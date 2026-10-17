const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const sdk = path.join(os.homedir(), '.gemini/antigravity/lib/node_modules/sidecar_sdk/register_loader.js');
const electron = path.join(process.env.LOCALAPPDATA || '', 'Programs/Antigravity/Antigravity.exe');
const runtime = process.platform === 'win32' && existsSync(electron) ? electron : process.execPath;
const available = existsSync(sdk);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function host() {
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { address: '127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
async function freePort() { const server = await host(); const port = Number(server.address.split(':')[1]); await server.close(); return port; }

test('installed Antigravity runtime releases an orphaned host and its replacement becomes ready on the same profile', { skip: !available }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'elektron-host-restart-'));
  const children = [], hosts = [];
  const preferences = JSON.stringify({ economy: true, agentEnabled: false, mode: 'chrome' });
  await writeFile(path.join(dir, 'settings.json'), preferences);
  async function start(address) {
    const port = await freePort(), token = randomBytes(32).toString('hex');
    const child = spawn(runtime, ['--import', pathToFileURL(sdk).href, 'elektron.mjs'], {
      cwd: path.resolve('app-plugin/elektron-app/sidecars/browser'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELEKTRON_APP_DATA_DIR: dir, ANTIGRAVITY_LS_ADDRESS: address,
        ANTIGRAVITY_CSRF_TOKEN: 'local-test-only', ANTIGRAVITY_SIDECAR_UI_TOKEN: token, ANTIGRAVITY_SIDECAR_WEB_PORT: String(port) }
    });
    let output = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
    const item = { child, port, token, exited, output: () => output }; children.push(item);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(output);
      try { const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }); await response.text(); if (response.ok) return item; } catch {}
      await delay(100);
    }
    throw new Error('Replacement never became ready: ' + output);
  }
  const api = async (item, route) => {
    const response = await fetch(`http://127.0.0.1:${item.port}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sidecar-Token': item.token }, body: '{}' });
    assert.equal(response.status, 200); return response.json();
  };
  const waitExit = item => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sidecar did not release the dead host: ' + item.output())), 10000);
    item.exited.then(code => { clearTimeout(timer); resolve(code); });
  });
  try {
    const firstHost = await host(); hosts.push(firstHost);
    const first = await start(firstHost.address);
    await api(first, '/api/open');
    const firstDiscovery = JSON.parse(await readFile(path.join(dir, 'session.json'), 'utf8'));
    assert.equal(firstDiscovery.pid, first.child.pid);
    assert.equal((await api(first, '/api/poll')).state.mode, 'chrome');
    // Our process remains alive, just like the stale Windows agy-node.cmd shim.
    // Only the actual language-server endpoint disappears.
    await firstHost.close(); hosts.splice(hosts.indexOf(firstHost), 1);
    const secondHost = await host(); hosts.push(secondHost);
    const second = await start(secondHost.address);
    assert.equal(await waitExit(first), 0, first.output());
    assert.match(first.output(), /host Antigravity encerrado/);
    const secondDiscovery = JSON.parse(await readFile(path.join(dir, 'session.json'), 'utf8'));
    assert.equal(secondDiscovery.pid, second.child.pid);
    assert.notEqual(secondDiscovery.pid, firstDiscovery.pid);
    assert.equal(await readFile(path.join(dir, 'settings.json'), 'utf8'), preferences);
    const state = (await api(second, '/api/poll')).state;
    assert.equal(state.agentEnabled, false); assert.equal(state.mode, 'chrome');
    assert.deepEqual(state.tabs, []);
    await assert.rejects(fetch(`http://127.0.0.1:${first.port}/`, { signal: AbortSignal.timeout(1000) }));
    await secondHost.close(); hosts.splice(hosts.indexOf(secondHost), 1);
    assert.equal(await waitExit(second), 0, second.output());
    await assert.rejects(readFile(path.join(dir, 'session.json')), { code: 'ENOENT' });
  } finally {
    await Promise.all(hosts.map(server => server.close()));
    for (const item of children) { if (item.child.exitCode === null) { item.child.kill(); await item.exited; } }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

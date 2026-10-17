const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, cp, readFile, writeFile, rm } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { spawn, execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const { BrowserController, startBridge } = require('../dist/core.cjs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { WebSocket } = require('ws');

// An ordinary Chromium launch: no headless, remote debugging or automation flags.
const executable = process.env.ELEKTRON_TEST_CHROME || path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1155/chrome-win/chrome.exe');
const available = process.platform === 'win32' && existsSync(executable);
let root, relay, child, controller, fixture, base, bridge, client;
const waitFor = async (predicate, label) => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Timeout: ' + label);
};
before(async () => {
  if (!available) return;
  root = await mkdtemp(path.join(os.tmpdir(), 'elektron-chrome-test-'));
  controller = new BrowserController({ profileDir: path.join(root, 'profile-integrated'), mode: 'chrome' });
  await controller.start();
  await controller.call('resize', { width: 800, height: 600 });
  assert.equal((await controller.state()).running, false, 'Waiting for the extension must not launch headless Chromium');
  relay = controller.relay;
  const folder = path.join(root, 'extension');
  await cp('chrome-extension', folder, { recursive: true });
  child = spawn(executable, ['--no-first-run', '--no-default-browser-check', '--disable-default-apps', `--user-data-dir=${path.join(root, 'profile')}`, `--load-extension=${folder}`, `--disable-extensions-except=${folder}`, '--window-size=1100,800', relay.connectionUrl()], { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {});
  await waitFor(() => relay.connected, 'real extension handshake');
  assert.equal((await controller.call('snapshot')).url, 'about:blank', 'First action waits for the connected page initialization');
  assert.deepEqual([...controller.pages.values()][0].viewportSize(), { width: 800, height: 600 }, 'Size chosen before the extension connects must reach its first page');
  assert.equal((await controller.state()).helperVersion,JSON.parse(await readFile('chrome-extension/manifest.json','utf8')).version);
  fixture = http.createServer((req, res) => { if (req.url.startsWith('/monaco') || req.url.startsWith('/vs/')) return require('./fixtures/monaco.cjs').handler(req, res); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/editor' ? require('./fixtures/shadow-editor.cjs') : '<!doctype html><title>Chrome conectado real</title><h1>Teste compartilhado</h1><label for="name">Nome</label><input id="name"><button onclick="document.querySelector(\'h1\').textContent=document.querySelector(\'input\').value">Aplicar</button>'); });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${fixture.address().port}`;
  const discovery = path.join(root, 'session.json'); bridge = await startBridge(controller, discovery);
  client = new Client({ name: 'connected-chrome-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/mcp.cjs'), discovery], stderr: 'pipe' }));
});
after(async () => {
  if (!available) return;
  await client?.close(); await bridge?.close(); await controller?.close().catch(() => {});
  if (child?.exitCode === null && child?.signalCode === null) await new Promise(resolve => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve()));
  if (fixture) await new Promise(resolve => fixture.close(resolve));
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('real extension controls ordinary Chrome through authenticated CDP without changing navigator flags', { skip: !available }, async () => {
  const call = async (name, args = {}) => { const result = await client.callTool({ name: 'browser_' + name, arguments: args }); assert.ok(!result.isError, result.content[0]?.text); return JSON.parse(result.content[0].text); };
  assert.equal((await controller.state()).tabs.length, 1, 'Only the dedicated Tabyra window is shared');
  await call('navigate', { url: base });
  assert.deepEqual((await call('evaluate', { script: '() => ({ webdriver: navigator.webdriver, headless: navigator.userAgent.includes("Headless") })' })).value, { webdriver: false, headless: false });
  const field = (await call('snapshot')).elements.find(el => el.name === 'Nome');
  await call('fill', { ref: field.ref, text: 'Gabriel, açúcar 💛' }); await call('click', { selector: 'button' });
  assert.ok((await call('snapshot')).text.includes('Gabriel, açúcar 💛'));
  await controller.call('resize', { width: 800, height: 600 });
  const png = await controller.call('screenshot', {}, true);
  assert.equal(Buffer.from(png.data, 'base64').subarray(1, 4).toString(), 'PNG');
  const frame = await controller.capture(); assert.ok(frame.data.length > 1000); assert.equal(frame.width, 800);
  await controller.call('input', { kind: 'key', key: 'Control+A' });
  await controller.call('input', { kind: 'text', text: 'Entrada humana' });
  await call('new_tab', { url: base }); assert.equal((await controller.state()).tabs.length, 2);
  await call('close_tab'); assert.equal((await controller.state()).tabs.length, 1);
  await call('evaluate', { script: '() => { document.cookie = "elektronConnected=ok;path=/"; }' });
});

test('ordinary Chrome extension supports nested shadow refs and native multiline editor input over MCP', { skip: !available }, async () => {
  const call = async (name, args = {}) => { const result = await client.callTool({ name: 'browser_' + name, arguments: args }); assert.ok(!result.isError, result.content[0]?.text); return JSON.parse(result.content[0].text); };
  try {
    await call('navigate', { url: base + '/editor' });
    const snapshot = await call('snapshot', { selector: '#runtime-panel' });
    await call('click', { ref: snapshot.elements.find(el => el.name === 'RAM alta').ref });
    await call('click', { ref: snapshot.elements.find(el => el.name === 'Código Python').ref });
    await call('press', { key: 'Control+A' });
    const code = 'import torch\nprint("ação 💛")\n';
    await call('type', { text: code });
    const result = await call('evaluate', { script: '() => JSON.parse(document.querySelector("#events").textContent)' });
    assert.deepEqual(result.value, { code, trustedInput: true });
    assert.equal((await call('snapshot')).elements[0].checked, true);
  } finally { await call('navigate', { url: base }); }
});

test('connected Chrome inserts Python into real Monaco with exact verification and no cumulative indentation over MCP', { skip: !available || !require('./fixtures/monaco.cjs').available }, async () => {
  const call = async (name, args = {}) => { const result = await client.callTool({ name: 'browser_' + name, arguments: args }); assert.ok(!result.isError, result.content[0]?.text); return JSON.parse(result.content[0].text); };
  try {
    await call('navigate', { url: base + '/monaco' });
    const page = [...controller.pages.values()].find(page => page.url().includes('/monaco'));
    await page.waitForFunction(() => document.body.dataset.ready === 'true', undefined, { timeout:10000 });
    await page.evaluate(async () => { await monaco.editor.colorize('class A:\n    pass\n', 'python', {}); });
    await call('click', { selector: '.monaco-editor' });
    await call('press', { key: 'Control+A' });
    const code = 'class CNN:\n    def train(self):\n        for epoch in range(3):\n            if epoch:\n                print("ação 💛")\n        return 42\n\nprint("fim")\n';
    assert.equal((await call('type', { text:code })).input, 'monaco-edit');
    const result = await call('evaluate', { script:'() => JSON.parse(document.querySelector("#model").textContent)' });
    assert.equal(result.value.replace(/\r\n/g, '\n'), code);
  } finally { await call('navigate', { url:base }); }
});

test('manual login releases debugger, keeps the same Chrome tabs and reconnects with the same cookies', { skip: !available }, async () => {
  const before = relay.listTabs();
  await controller.call('chrome_manual', { enabled: true });
  try {
    await waitFor(() => !relay.client, 'CDP client detaches');
    const frame = await controller.capture();
    assert.ok(frame.data.length > 1000);
    assert.deepEqual(relay.listTabs().map(tab => tab.id), before.map(tab => tab.id));
    assert.equal((await controller.state()).agentEnabled, false);
    await assert.rejects(controller.call('snapshot', {}, true), /Login manual|pausado/);
    await assert.rejects(controller.call('agent', { enabled: true }), /login/);
  } finally { await controller.call('chrome_manual', { enabled: false }); }
  assert.ok((await controller.call('evaluate', { script: '() => document.cookie' }, true)).value.includes('elektronConnected=ok'));
  assert.equal((await controller.call('evaluate', { script: '() => navigator.webdriver' }, true)).value, false);
  assert.deepEqual((await controller.state()).tabs.map(tab => tab.id), before.map(tab => tab.id));
});

test('saved Chrome pairing reconnects to a replacement backend on the same port without JSON or new shared tabs', {skip:!available},async()=>{
  const before=await controller.state();
  await client.close();await bridge.close();await controller.close();
  controller=new BrowserController({profileDir:path.join(root,'profile-integrated'),mode:'chrome'});await controller.start();relay=controller.relay;
  await waitFor(()=>relay.connected,'saved Chrome extension reconnects');
  await controller.call('snapshot');
  assert.deepEqual((await controller.state()).tabs.map(tab=>tab.id),before.tabs.map(tab=>tab.id));
  const discovery=path.join(root,'session.json');bridge=await startBridge(controller,discovery);
  client=new Client({name:'reconnected-chrome-test',version:'1.0.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/mcp.cjs'),discovery],stderr:'pipe'}));
});

test('Chrome connector refuses unpaired extensions, web origins, unauthenticated CDP and agent-only settings changes', { skip: !available }, async () => {
  const info = JSON.parse((await controller.call('chrome_connection')).code);
  const refused = (url, options, hello) => new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options), timer = setTimeout(() => { ws.terminate(); reject(new Error('Unauthorized socket was not closed')); }, 4000);
    ws.on('open', () => { if (hello) ws.send(JSON.stringify(hello)); });
    ws.on('error', () => {}); ws.on('close', () => { clearTimeout(timer); resolve(); });
  });
  await refused(info.endpoint, { origin: 'https://untrusted.example' });
  await refused(info.endpoint, { origin: 'chrome-extension://' + 'a'.repeat(32) }, { type: 'hello', token: 'wrong' });
  await refused(info.endpoint.replace('/extension', '/cdp'), {});
  await assert.rejects(controller.call('chrome_connection', {}, true), /reservada/);
  await assert.rejects(controller.call('browser_mode', { mode: 'embedded' }, true), /reservada/);
  assert.equal((await controller.state()).connected, true);
});

test('JavaScript timeout preserves both connected Chrome tabs and keeps the affected page usable', { skip: !available }, async () => {
  const original = (await controller.state()).activeId;
  await controller.call('new_tab', { url: base });
  const affected = (await controller.state()).activeId;
  await assert.rejects(controller.call('evaluate', { script: '() => { while (true) {} }', timeoutMs: 200 }, true), /aba foi preservada/);
  assert.equal((await controller.state()).tabs.length, 2);
  assert.equal((await controller.state()).activeId, affected);
  assert.equal((await controller.call('snapshot', {}, true)).title, 'Chrome conectado real');
  await controller.call('close_tab');
  assert.equal((await controller.state()).activeId,original);
});

test('disconnecting Tabyra leaves the ordinary Chrome process and its window alive', { skip: !available }, async () => {
  await controller.close();
  assert.equal(child.exitCode, null); assert.doesNotThrow(() => process.kill(child.pid, 0));
});

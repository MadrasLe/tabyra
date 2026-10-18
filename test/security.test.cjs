const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { WebSocket } = require('ws');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { ChromeRelay } = require('../dist/core.cjs');

test('malformed unauthenticated Chrome handshakes cannot crash the relay process', { timeout: 20000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tabyra-relay-security-'));
  const child = fork(path.join(__dirname, 'fixtures/relay-security.cjs'), [root], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4000); });
  try {
    const [{ port }] = await once(child, 'message');
    for (const payload of ['null', '[]', '"hello"', '42', 'true', '{}', '{"type":"hello","token":null}', 'not-json']) {
      const ws = new WebSocket('ws://127.0.0.1:' + port + '/extension', {
        origin: 'chrome-extension://' + 'a'.repeat(32)
      });
      const closed = once(ws, 'close');
      ws.on('error', () => {});
      await once(ws, 'open');
      ws.send(payload);
      const [code] = await closed;
      assert.equal(code, 1008, 'Invalid payload must be refused without crashing: ' + payload + '\n' + diagnostic);
      assert.equal(child.exitCode, null, diagnostic);
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      if (child.connected) child.send('stop', () => {});
      const timer = setTimeout(() => child.kill(), 2000);
      await exited;
      clearTimeout(timer);
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('WebSocket upgrade refuses a foreign Host even with a valid pairing key', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tabyra-host-security-'));
  const relay = new ChromeRelay(root);
  try {
    await relay.start();
    const config = JSON.parse(relay.pairing());
    const ws = new WebSocket(config.endpoint, {
      origin: 'chrome-extension://' + 'a'.repeat(32), headers: { Host: 'foreign.example' }
    });
    const outcome = new Promise(resolve => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token: config.token, tabs: [] })));
      ws.on('message', () => resolve('accepted'));
      ws.on('error', () => resolve('rejected'));
      ws.on('close', () => resolve('rejected'));
    });
    const timer = setTimeout(() => ws.terminate(), 3000);
    try { assert.equal(await outcome, 'rejected'); }
    finally { clearTimeout(timer); ws.terminate(); }
  } finally { await relay.close(); await rm(root, { recursive: true, force: true }); }
});

test('MCP never forwards a browser command body through an HTTP redirect', { timeout: 15000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tabyra-redirect-security-'));
  const received = [];
  const destination = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: { value: 'redirected' } }));
    });
  });
  const redirect = http.createServer((req, res) => {
    req.resume();
    res.writeHead(307, { Location: 'http://127.0.0.1:' + destination.address().port + '/untrusted' });
    res.end();
  });
  const client = new Client({ name: 'redirect-security-test', version: '1' });
  try {
    await new Promise(resolve => destination.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => redirect.listen(0, '127.0.0.1', resolve));
    const discovery = path.join(root, 'session.json');
    await writeFile(discovery, JSON.stringify({
      version: 1, port: redirect.address().port, pid: process.pid, token: randomBytes(32).toString('hex')
    }));
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: [path.resolve('dist/mcp.cjs'), discovery], stderr: 'pipe'
    }));
    const result = await client.callTool({
      name: 'browser_evaluate', arguments: { script: '() => "security-test-only"' }
    });
    assert.equal(received.length, 0, 'The local bridge must not redirect command data to another server');
    assert.equal(result.isError, true);
  } finally {
    await client.close();
    for (const server of [redirect, destination]) {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
    await rm(root, { recursive: true, force: true });
  }
});

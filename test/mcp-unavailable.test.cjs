const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { randomBytes } = require('node:crypto');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

test('MCP status times out quickly and an offline bridge returns an actionable connection error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'elektron-offline-'));
  const server = http.createServer(req => req.resume());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const discovery = path.join(root, 'session.json');
  await writeFile(discovery, JSON.stringify({ version: 1, port: server.address().port, pid: process.pid, token: randomBytes(32).toString('hex') }));
  const client = new Client({ name: 'offline-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/mcp.cjs'), discovery], stderr: 'pipe' }));
    const started = performance.now();
    const timeout = await client.callTool({ name: 'browser_tabs', arguments: {} });
    assert.equal(timeout.isError, true); assert.match(timeout.content[0].text, /2.5 s/);
    assert.ok(performance.now() - started < 4000);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    const offline = await client.callTool({ name: 'browser_tabs', arguments: {} });
    assert.equal(offline.isError, true); assert.match(offline.content[0].text, /conexão local.*indisponível/);
  } finally { server.closeAllConnections(); server.close(); await client.close(); await rm(root, { recursive: true, force: true }); }
});

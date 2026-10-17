const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { BrowserController, startBridge } = require('../dist/core.cjs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
let root, browser, fixture, bridge, client;
const call = async (name, args = {}) => {
  const result = await client.callTool({ name: 'browser_' + name, arguments: args });
  assert.ok(!result.isError, result.content[0]?.text);
  return JSON.parse(result.content[0].text);
};
before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'elektron-editors-'));
  fixture = http.createServer((_, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(require('./fixtures/shadow-editor.cjs')); });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  browser = new BrowserController({ profileDir: path.join(root, 'profile') }); await browser.start();
  await browser.call('navigate', { url: 'http://127.0.0.1:' + fixture.address().port });
  const discovery = path.join(root, 'session.json'); bridge = await startBridge(browser, discovery);
  client = new Client({ name: 'editor-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/mcp.cjs'), discovery], stderr: 'pipe' }));
});
after(async () => { await client?.close(); await bridge?.close(); await browser?.close(); if (fixture) await new Promise(resolve => fixture.close(resolve)); if (root) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

test('snapshot traverses nested open shadow roots, scopes inner selectors and reports switch state without closed roots or input values', async () => {
  const snapshot = await call('snapshot');
  assert.deepEqual(snapshot.elements.map(el => el.name), ['RAM alta', 'Código Python', 'Guardar']);
  assert.equal(snapshot.elements[0].checked, false);
  assert.equal(snapshot.elements[2].expanded, false);
  assert.ok(snapshot.text.includes('RAM alta'));
  assert.ok(!JSON.stringify(snapshot).includes('initial-private-input'));
  assert.ok(!JSON.stringify(snapshot).includes('Closed private control'));
  const scoped = await call('snapshot', { selector: '#code', maxElements: 5 });
  assert.equal(scoped.elements.length, 1);
  assert.equal(scoped.elements[0].name, 'Código Python');
  const limited = await call('snapshot', { selector: '#runtime-panel', maxElements: 1, maxTextLength: 5 });
  assert.equal(limited.elements.length, 1); assert.equal(limited.truncated, true); assert.ok(limited.text.length <= 5);
});

test('MCP refs click shadow controls and insert multiline Unicode in the focused editor with trusted native input and no execution', async () => {
  const started = performance.now(), snapshot = await call('snapshot');
  await call('click', { ref: snapshot.elements[0].ref });
  await call('click', { ref: snapshot.elements[1].ref });
  await call('press', { key: 'Control+A' });
  const code = 'import torch\n\n# Acentuação e Unicode 💛\nprint("ação")\n';
  await call('type', { text: code });
  const result = await call('evaluate', { script: '() => ({...JSON.parse(document.querySelector("#events").textContent), click:document.body.dataset.trustedClick, executed:document.body.dataset.executed || null})' });
  assert.deepEqual(result.value, { code, trustedInput: true, click: 'true', executed: null });
  assert.equal((await call('snapshot')).elements[0].checked, true);
  console.log('Local inspect/shadow click/focus/type/check ms:', Math.round(performance.now() - started));
});

test('native text insertion preserves the selection semantics and validates arguments', async () => {
  const snapshot = await call('snapshot', { selector: '#code' });
  await call('click', { ref: snapshot.elements[0].ref });
  await call('press', { key: 'Control+End' });
  await call('type', { text: '# appended' });
  const result = await call('evaluate', { script: '() => JSON.parse(document.querySelector("#events").textContent)' });
  assert.ok(result.value.code.endsWith('\n# appended'));
  await assert.rejects(browser.call('type', { text: 42 }, true), /Campo inválido/);
  await assert.rejects(browser.call('type', { text: 'x'.repeat(100001) }, true), /Campo muito longo/);
  await assert.rejects(browser.call('type', {}, true), /Campo inválido/);
});

test('pause blocks native editor insertion and resuming preserves the existing page', async () => {
  const before = await browser.state();
  await browser.call('agent', { enabled: false });
  try { await assert.rejects(browser.call('type', { text: 'must-not-type' }, true), /pausado/); }
  finally { await browser.call('agent', { enabled: true }); }
  assert.deepEqual((await browser.state()).tabs, before.tabs);
  const output = await call('evaluate', { script: '() => document.querySelector("#events").textContent' });
  assert.ok(!output.value.includes('must-not-type'));
});

test('a Monaco-like element without the public API returns an error without silently falling back to typing', async () => {
  const page = [...browser.pages.values()][0];
  await page.evaluate(() => { document.querySelector('runtime-controls').shadowRoot.querySelector('code-editor').shadowRoot.querySelector('textarea').classList.add('monaco-editor'); });
  try {
    await call('click', { selector:'#code' });
    const before = await page.locator('#code').inputValue();
    const result = await client.callTool({ name:'browser_type', arguments:{text:'must-not-fallback\n    pass\n'} });
    assert.equal(result.isError, true); assert.match(result.content[0].text, /não expõe uma instância/);
    assert.equal(await page.locator('#code').inputValue(), before);
  } finally { await page.evaluate(() => { document.querySelector('runtime-controls').shadowRoot.querySelector('code-editor').shadowRoot.querySelector('textarea').classList.remove('monaco-editor'); }); }
});

test('lost editor detection expires without closing the tab, typing later or blocking status', async () => {
  const context = browser.context, original = context.newCDPSession;
  let entered;
  const stalled = new Promise(resolve => { entered = resolve; });
  context.newCDPSession = async function(page) {
    const session = await original.call(this, page), send = session.send.bind(session);
    session.send = async (method, args) => { if (method === 'Runtime.evaluate') { entered(); return new Promise(() => {}); } return send(method,args); };
    return session;
  };
  const started = performance.now(), pending = browser.call('type', {text:'must-not-type'}, true).catch(error => error);
  try {
    await stalled;
    assert.equal((await browser.state()).busy.method, 'type');
    assert.match((await pending).message, /editor não respondeu em 3 s/);
    assert.ok(performance.now() - started < 4500);
    assert.equal((await browser.state()).tabs.length, 1);
  } finally { context.newCDPSession = original; }
  const page = [...browser.pages.values()][0];
  assert.ok(!(await page.locator('#code').inputValue()).includes('must-not-type'));
  await call('click', {selector:'#code'}); await call('press', {key:'Control+End'});
  assert.equal((await call('type', {text:'# still usable'})).input, 'native');
});

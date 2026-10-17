const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { BrowserController, startBridge } = require('../dist/core.cjs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let root, controller, bridge, fixture, client, base, lateRequests = 0;
before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'elektron-js-test-'));
  fixture = http.createServer((req, res) => {
    if (req.url === '/late') lateRequests++;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><title>Automação Tabyra</title><h1>Estoque</h1>
      <table><tbody><tr><td>Maçã</td><td>3</td></tr><tr><td>Café</td><td>7</td></tr></tbody></table>
      <label for="name">Nome</label><input id="name"><button id="hello" onclick="document.querySelector('h1').textContent=document.querySelector('input').value">Aplicar</button>
      <script>window.sitePrivateValue = 'não deve aparecer no mundo isolado';</script>`);
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${fixture.address().port}`;
  controller = new BrowserController({ profileDir: path.join(root, 'profile') });
  await controller.start();
  const discovery = path.join(root, 'session.json');
  bridge = await startBridge(controller, discovery);
  client = new Client({ name: 'elektron-js-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/mcp.cjs'), discovery], stderr: 'pipe' }));
});
after(async () => {
  await client?.close(); await bridge?.close(); await controller?.close();
  await new Promise(resolve => fixture.close(resolve));
  await rm(root, { recursive: true, force: true });
});
const evaluate = args => controller.call('evaluate', args, true);

test('real MCP JavaScript extracts a table and shares live DOM with human input without Node access', async () => {
  await controller.call('navigate', { url: base });
  const response = await client.callTool({ name: 'browser_evaluate', arguments: {
    script: `() => [...document.querySelectorAll('tbody tr')].map(row => ({name: row.cells[0].textContent, quantity: Number(row.cells[1].textContent)}))`
  } });
  assert.ok(!response.isError, response.content[0]?.text);
  assert.deepEqual(JSON.parse(response.content[0].text).value, [{ name: 'Maçã', quantity: 3 }, { name: 'Café', quantity: 7 }]);
  const limits = await evaluate({ script: '() => [typeof process, typeof require, typeof window.sitePrivateValue]' });
  assert.deepEqual(limits.value, ['undefined', 'undefined', 'undefined']);
  await controller.call('click', { selector: '#name' });
  await controller.call('input', { kind: 'text', text: 'Berta e Ada 💛' });
  assert.equal((await evaluate({ script: '() => document.querySelector("input").value' })).value, 'Berta e Ada 💛');
  const text = 'Gabriel, ação 💛 ` ${doNotEvaluate} " \\ \n';
  const oldRef = (await controller.call('snapshot')).elements.find(el => el.name === 'Nome').ref;
  await evaluate({ script: 'async (data) => { await Promise.resolve(); document.querySelector("input").value = data.text; document.querySelector("button").click(); return document.querySelector("h1").textContent; }', argument: { text } });
  assert.ok((await controller.call('snapshot')).text.includes(text.trim()));
  await assert.rejects(controller.call('fill', { ref: oldRef, text: 'stale' }), /Referência expirou/);
  const before = await controller.state();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => evaluate({ script: '(i) => i * 2', argument: i })));
  assert.deepEqual(results.map(result => result.value), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  assert.deepEqual(await controller.state(), before);
});

test('JavaScript validates limits and reports ordinary errors without closing the tab', async () => {
  for (const args of [{ script: '' }, { script: 'x'.repeat(20001) }, { script: '() => 1', timeoutMs: 120001 }, { script: '() => 1', argument: 'x'.repeat(32001) }]) {
    await assert.rejects(evaluate(args), /script|timeoutMs|argument/);
  }
  await assert.rejects(evaluate({ script: '() => { throw new Error("erro de teste"); }' }), /erro de teste/);
  await assert.rejects(evaluate({ script: '() => "x".repeat(64001)' }), /64.000/);
  await assert.rejects(evaluate({ script: '() => { const a = {}; a.a = a; return a; }' }), /circular/i);
  assert.equal((await evaluate({ script: '() => document.title' })).value, 'Automação Tabyra');
  assert.equal((await evaluate({ script: '() => {}' })).value, null);
});

test('pause immediately blocks queued JavaScript and MCP reports the pause', async () => {
  const active = evaluate({ script: 'async () => { await new Promise(resolve => setTimeout(resolve, 120)); return "finished"; }' });
  await new Promise(resolve => setTimeout(resolve, 40));
  const queued = assert.rejects(evaluate({ script: '() => document.title = "must not run"' }), /pausado/);
  await controller.call('agent', { enabled: false });
  await active; await queued;
  const paused = await client.callTool({ name: 'browser_evaluate', arguments: { script: '() => document.title' } });
  assert.equal(paused.isError, true);
  assert.match(paused.content[0].text, /pausado/);
  await controller.call('agent', { enabled: true });
  assert.equal((await evaluate({ script: '() => document.title' })).value, 'Automação Tabyra');
});

test('deadlines stop loops and tracked asynchronous work without closing or replacing the working tab', async () => {
  await controller.call('navigate',{url:base});
  await controller.call('fill',{selector:'#name',text:'unsaved work 💛'});
  const before = await controller.state();
  for (const script of ['() => { while (true) {} }', `async () => { setTimeout(() => fetch('${base}/late'), 600); await new Promise(() => {}); }`]) {
    const start = Date.now();
    await assert.rejects(evaluate({ script, timeoutMs: 200 }), /excedeu 200 ms.*aba foi preservada/);
    assert.ok(Date.now() - start < 4000, 'Timeout actually interrupts the browser');
    const state = await controller.state();
    assert.deepEqual(state.tabs,before.tabs); assert.equal(state.activeId, before.activeId);
    assert.equal((await controller.call('snapshot')).title, 'Automação Tabyra');
    assert.equal((await evaluate({script:'() => document.querySelector("input").value'})).value,'unsaved work 💛');
  }
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal(lateRequests, 0, 'Tracked deferred callbacks must be cancelled without closing the tab');
  await assert.rejects(evaluate({ script: 'async () => await new Promise(() => {})', timeoutMs: 150 }), /aba foi preservada/);
  assert.equal((await controller.state()).tabs.length, 1);
  assert.equal((await controller.call('snapshot')).url, base+'/');
});

test('the panel cancels an active long operation outside the queue and the same tab remains usable', async () => {
  const before = await controller.state();
  const pending = assert.rejects(evaluate({script:`async () => { setTimeout(() => fetch('${base}/late'), 1200); await new Promise(() => {}); }`,timeoutMs:30000}),/interrompido pelo painel.*aba.*preservados/);
  await new Promise(resolve=>setTimeout(resolve,150));
  const status = await controller.call('tabs',{},true); assert.equal(status.busy.method,'evaluate');
  assert.equal((await controller.call('cancel')).cancelled,true);
  await pending;
  assert.deepEqual((await controller.state()).tabs,before.tabs);
  assert.equal((await evaluate({script:'() => 42',timeoutMs:30000})).value,42);
  await new Promise(resolve=>setTimeout(resolve,1300)); assert.equal(lateRequests,0);
});

test('MCP can explicitly wait beyond the former 15-second ceiling while status stays available', async()=>{
  const pending = client.callTool({name:'browser_evaluate',arguments:{script:'async () => {await new Promise(resolve=>setTimeout(resolve,15500)); return "finished";}',timeoutMs:20000}});
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal((await controller.call('tabs',{},true)).busy.method,'evaluate');
  const result=await pending;assert.ok(!result.isError,result.content[0]?.text);assert.equal(JSON.parse(result.content[0].text).value,'finished');
});

test('ending a script cleans intervals and listeners while preserving normal removeEventListener semantics',async()=>{
  const result=await evaluate({script:'() => {let count=0;const listener=()=>count++;document.addEventListener("elektron-test",listener);document.addEventListener("elektron-test",listener);document.dispatchEvent(new Event("elektron-test"));document.removeEventListener("elektron-test",listener);document.dispatchEvent(new Event("elektron-test"));setInterval(()=>document.body.dataset.unexpected="yes",100);return count;}'});
  assert.equal(result.value,1);
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal((await evaluate({script:'() => document.body.dataset.unexpected || null'})).value,null);
});

test('Interromper can stop a synchronous loop before its requested deadline without closing the page',async()=>{
  const before=await controller.state();
  const pending=assert.rejects(evaluate({script:'() => {while(true){}}',timeoutMs:30000}),/interrompido pelo painel/);
  await new Promise(resolve=>setTimeout(resolve,200));
  const started=Date.now();await controller.call('cancel');await pending;
  assert.ok(Date.now()-started<4000);assert.deepEqual((await controller.state()).tabs,before.tabs);
  assert.equal((await evaluate({script:'() => 42'})).value,42);
});

test('closing the browser interrupts JavaScript without reopening a replacement tab', async () => {
  const executing = assert.rejects(evaluate({ script: 'async () => await new Promise(() => {})', timeoutMs: 2000 }));
  await new Promise(resolve => setTimeout(resolve, 100));
  const start = Date.now();
  await controller.close(); await executing;
  assert.ok(Date.now() - start < 10000, 'Closing must finish within the worker graceful shutdown budget, including Chromium profile flush');
  assert.equal((await controller.state()).running, false);
});

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { BrowserController, startBridge } = require('../dist/core.cjs');
let root, browser, bridge, fixture, base;
before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'elektron-responsive-'));
  fixture = http.createServer((_, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><title>Editor rico local</title><h1>Chat de teste</h1><form id="composer" onsubmit="return false"><div id="prompt-textarea" role="textbox" aria-label="Mensagem" contenteditable="true" style="height:70px;border:1px solid"></div><button id="send" type="button">Enviar</button></form><div id="result"></div><input type="password" value="never-expose-password"><section>${'<p>Histórico de teste</p>'.repeat(6000)}</section><script>
      let trustedInput = false, sent = 0;
      document.querySelector('#prompt-textarea').addEventListener('input', e => trustedInput = e.isTrusted);
      document.querySelector('#send').onclick = e => { sent++; document.querySelector('#result').textContent = JSON.stringify({ text: document.querySelector('#prompt-textarea').textContent, trustedInput, trustedClick: e.isTrusted, sent }); };
      // A page can replace main-world APIs; inspection must remain isolated.
      window.getComputedStyle = () => { throw Error('page override'); };
      Element.prototype.getBoundingClientRect = () => { throw Error('page override'); };
      </script>`);
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + fixture.address().port;
  browser = new BrowserController({ profileDir: path.join(root, 'profile') }); await browser.start();
  await browser.call('navigate', { url: base });
  bridge = await startBridge(browser, path.join(root, 'session.json'));
});
after(async () => { await bridge?.close(); await browser?.close(); await new Promise(resolve => fixture.close(resolve)); await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

test('isolated scoped inspection reads a rich editor in a large page without main-world overrides or input values', async () => {
  const started = performance.now();
  const result = await browser.call('snapshot', { selector: '#composer', maxElements: 10, maxTextLength: 1000 });
  assert.deepEqual(result.elements.map(el => el.name), ['Mensagem', 'Enviar']);
  assert.ok(!JSON.stringify(result).includes('never-expose-password'));
  assert.ok(performance.now() - started < 3000);
  await assert.rejects(browser.call('snapshot', { selector: '#missing' }), /não encontrada/);
  await assert.rejects(browser.call('snapshot', { maxElements: 100000 }), /maxElements/);
});

test('a lost snapshot reply expires while tabs and HTTP stay responsive, and the next action works without restarting', async () => {
  const context = browser.context, original = context.newCDPSession;
  let entered;
  const stalled = new Promise(resolve => { entered = resolve; });
  context.newCDPSession = async function(page) {
    const session = await original.call(this, page), send = session.send.bind(session);
    session.send = async (method, args) => { if (method === 'Runtime.evaluate') { entered(); return new Promise(() => {}); } return send(method, args); };
    return session;
  };
  const started = performance.now(), pending = browser.call('snapshot').catch(error => error);
  try {
    await stalled;
    const statusStart = performance.now();
    const response = await fetch(`http://127.0.0.1:${bridge.discovery.port}/call`, { method: 'POST', headers: { Authorization: 'Bearer ' + bridge.discovery.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'tabs', args: {} }) });
    const state = (await response.json()).result;
    assert.equal(state.busy.method, 'snapshot'); assert.equal(state.tabs.length, 1);
    assert.ok(performance.now() - statusStart < 1000, 'Status must not wait for the stalled read');
    const error = await pending; assert.match(error.message, /3 s/);
    assert.ok(performance.now() - started < 4500);
    assert.equal((await browser.state()).tabs.length, 1);
  } finally { context.newCDPSession = original; }
  const next = await browser.call('snapshot', { selector: '#composer' }); assert.equal(next.elements.length, 2);
});

test('native filling and clicking work with a ProseMirror-style contenteditable and send exactly once', async () => {
  const started = performance.now();
  const snapshot = await browser.call('snapshot', { selector: '#composer' });
  await browser.call('fill', { ref: snapshot.elements[0].ref, text: 'Mensagem local, açúcar 💛' }, true);
  await browser.call('click', { ref: snapshot.elements[1].ref }, true);
  const result = await browser.call('evaluate', { script: '() => JSON.parse(document.querySelector("#result").textContent)' }, true);
  assert.deepEqual(result.value, { text: 'Mensagem local, açúcar 💛', trustedInput: true, trustedClick: true, sent: 1 });
  console.log('Local inspect/fill/click/check ms:', Math.round(performance.now() - started));
});

// Optional real-library regression. Setup commands are in VALIDATION.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { BrowserController, startBridge } = require('../dist/core.cjs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const vs = path.resolve(process.env.ELEKTRON_TEST_MONACO || '.test-user-data/monaco-fixture/package/min/vs');

test('real Python Monaco preserves nested indentation through MCP with autoindent and both EditContext modes', { skip: existsSync(path.join(vs, 'loader.js')) ? false : 'Optional Monaco fixture not downloaded' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'elektron-monaco-'));
  let browser, bridge, client;
  const fixture = http.createServer(require('./fixtures/monaco.cjs').handler);
  try {
    await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
    browser = new BrowserController({ profileDir: path.join(root, 'profile') }); await browser.start();
    const discovery = path.join(root, 'session.json'); bridge = await startBridge(browser, discovery);
    client = new Client({ name:'real-monaco-test', version:'1.0.0' });
    await client.connect(new StdioClientTransport({ command:process.execPath, args:[path.resolve('dist/mcp.cjs'), discovery], stderr:'pipe' }));
    const call = async (name, args = {}) => { const result = await client.callTool({ name:'browser_' + name, arguments:args }); assert.ok(!result.isError, result.content[0]?.text); return JSON.parse(result.content[0].text); };
    for (const editContext of [false, true]) {
      await call('navigate', { url:'http://127.0.0.1:' + fixture.address().port + '/?editContext=' + editContext });
      const page = [...browser.pages.values()][0];
      await page.waitForFunction(() => document.body.dataset.ready === 'true', undefined, { timeout: 10000 });
      await page.evaluate(async () => {
        await monaco.editor.colorize('class A:\n    def run(self):\n        pass\n', 'python', {});
        document.body.dataset.clipboardReads = '0';
        for (const key of ['read','readText','write','writeText']) Object.defineProperty(navigator.clipboard,key,{configurable:true,value:()=>{document.body.dataset.clipboardReads=String(+document.body.dataset.clipboardReads+1);return Promise.reject(new Error('Clipboard must not be accessed'));}});
      });
      const started = performance.now();
      const snapshot = await call('snapshot', { selector: '.monaco-editor' });
      const editor = snapshot.elements.find(el => el.tag === 'div');
      assert.ok(editor, 'The code editor container must be discoverable');
      await call('click', { ref: editor.ref });
      await call('press', { key:'Control+A' });
      const code = 'import torch\n\n# Acentuação e Unicode 💛\nclass ConvNet:\n    def forward(self, x):\n        if x is not None:\n            values = [\n                x,\n                x + 1,\n            ]\n            return values\n        return []\n\nfor epoch in range(3):\n    running_loss = 0\n    for batch in range(2):\n        running_loss += batch\n    train_loss = running_loss / 2\n    print("ação", train_loss)\n';
      assert.deepEqual(await call('type', { text:code }), {typed:true,input:'monaco-edit',verified:true});
      const result = await call('evaluate', { script:'() => ({code:JSON.parse(document.querySelector("#model").textContent), executed:document.body.dataset.executed || null})' });
      // Monaco uses the platform EOL (CRLF on Windows) in its model.
      assert.equal(result.value.code.replace(/\r\n/g, '\n'), code);
      assert.equal(result.value.executed, null);
      console.log('Real Python Monaco editContext=' + editContext + ' focus/replace/edit/model-check ms:', Math.round(performance.now() - started));
      await call('press', {key:'Control+z'});
      assert.equal(await page.evaluate(() => monaco.editor.getModels()[0].getValue()), '# initial', 'The edit must be undoable');
      await call('press', {key:'Control+A'});
      const sourceWithIndentError = 'for epoch in range(3):\n      train_loss = 1\n    train_acc = 2\n';
      await call('type', {text:sourceWithIndentError});
      assert.equal((await page.evaluate(() => monaco.editor.getModels()[0].getValue())).replace(/\r\n/g,'\n'), sourceWithIndentError, 'Source errors must not be silently rewritten');
      await page.evaluate(() => monaco.editor.getEditors()[0].updateOptions({readOnly:true}));
      const blocked = await client.callTool({name:'browser_type',arguments:{text:'must not write'}});
      assert.equal(blocked.isError,true); assert.match(blocked.content[0].text,/somente leitura/);
      assert.equal(await page.evaluate(() => document.body.dataset.clipboardReads),'0');
    }
  } finally {
    await client?.close(); await bridge?.close(); await browser?.close();
    if (fixture.listening) await new Promise(resolve => fixture.close(resolve));
    await rm(root, { recursive:true, force:true, maxRetries:5, retryDelay:200 });
  }
});

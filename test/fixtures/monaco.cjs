const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const vs = path.resolve(process.env.ELEKTRON_TEST_MONACO || '.test-user-data/monaco-fixture/package/min/vs');
exports.available = existsSync(path.join(vs, 'loader.js'));
exports.handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/' || url.pathname === '/monaco') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><meta charset="utf-8"><title>Monaco real local</title><div id="editor" style="height:350px"></div><output id="model"></output><script src="/vs/loader.js"></script><script>
        require.config({paths:{vs:'/vs'}});
        require(['vs/editor/editor.main'], () => {
          const editor = monaco.editor.create(document.querySelector('#editor'), {value:'# initial', language:'python', autoIndent:'full', formatOnType:true, formatOnPaste:true, pasteAs:{enabled:true}, tabSize:4, insertSpaces:true, detectIndentation:false, experimentalEditContext:${url.searchParams.get('editContext') !== 'false'}, ariaLabel:'Python code', automaticLayout:true, minimap:{enabled:false}});
          editor.onDidChangeModelContent(() => document.querySelector('#model').textContent = JSON.stringify(editor.getValue()));
          document.querySelector('#editor').addEventListener('keydown', e => {if(e.shiftKey && e.key === 'Enter') document.body.dataset.executed = 'true';});
          document.body.dataset.ready = 'true';
        });
        </script>`);
      return;
    }
    try {
      if (!url.pathname.startsWith('/vs/')) throw Error('not found');
      const file = path.resolve(vs, decodeURIComponent(url.pathname.slice(4)));
      if (!file.startsWith(vs + path.sep)) throw Error('not found');
      res.setHeader('Content-Type', ({ '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.ttf':'font/ttf' })[path.extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.statusCode = 404; res.end(); }
  };

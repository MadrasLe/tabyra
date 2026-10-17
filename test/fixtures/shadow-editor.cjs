// A local web-component fixture, not an emulation of the Colab application.
module.exports = `<!doctype html><meta charset="utf-8"><title>Componentes e editor locais</title>
<h1>Notebook de teste</h1><runtime-controls></runtime-controls><closed-controls></closed-controls>
<output id="events"></output><script>
  const panel = document.querySelector('runtime-controls').attachShadow({mode:'open'});
  panel.innerHTML = '<section id="runtime-panel"><button role="switch" aria-label="RAM alta" aria-checked="false">RAM alta</button><code-editor></code-editor><button id="save" aria-expanded="false">Guardar</button></section>';
  const toggle = panel.querySelector('[role=switch]');
  toggle.onclick = e => { toggle.setAttribute('aria-checked', toggle.getAttribute('aria-checked') !== 'true'); document.body.dataset.trustedClick = e.isTrusted; };
  const editor = panel.querySelector('code-editor').attachShadow({mode:'open'});
  editor.innerHTML = '<label for="code">Código Python</label><textarea id="code" style="display:block;width:600px;height:160px"></textarea>';
  const field = editor.querySelector('textarea');
  field.value = 'initial-private-input';
  field.addEventListener('input', e => { document.body.dataset.trustedInput = e.isTrusted; document.querySelector('#events').textContent = JSON.stringify({code:field.value, trustedInput:e.isTrusted}); });
  field.addEventListener('keydown', e => { if (e.shiftKey && e.key === 'Enter') document.body.dataset.executed = 'true'; });
  document.querySelector('closed-controls').attachShadow({mode:'closed'}).innerHTML = '<button>Closed private control</button>';
</script>`;

'use strict';
const $ = id => document.getElementById(id);
async function refresh() {
  const state = await chrome.storage.session.get(['status', 'connected', 'manual']);
  const saved = await chrome.storage.local.get('connection');
  $('status').textContent = state.status || 'Clique em Conectar Chrome no painel Tabyra.';
  $('connect').textContent = state.connected ? 'Abrir janela compartilhada' : 'Retomar conexão salva';
  $('connect').disabled = !saved.connection && !$('code').value.trim();
  $('disconnect').hidden = !state.connected;
}
$('connect').onclick = async () => {
  $('connect').disabled = true;
  try { const result = await chrome.runtime.sendMessage({ type: 'connect', value: $('code').value.trim() }); if (result.error) throw new Error(result.error); $('code').value = ''; await refresh(); }
  catch (error) { $('status').textContent = error.message; }
  finally { $('connect').disabled = false; }
};
$('disconnect').onclick = async () => { await chrome.runtime.sendMessage({ type: 'disconnect' }); await refresh(); };
chrome.storage.onChanged.addListener(() => { void refresh(); });
$('code').oninput = () => { void refresh(); };
void refresh();

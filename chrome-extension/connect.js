(() => {
  'use strict';
  if (location.pathname !== '/elektron/connect' || window.top !== window) return;
  const key = new URLSearchParams(location.hash.slice(1)).get('key');
  if (!/^[a-f0-9]{64}$/.test(key || '') || !location.port) return;
  const value = { endpoint:`ws://127.0.0.1:${location.port}/extension`, token:key };
  // The short-lived key is never sent in HTTP requests or left in history.
  history.replaceState(null, '', location.pathname);
  const title = document.getElementById('pair-title'), status = document.getElementById('pair-status');
  if (!title || !status) return;
  chrome.runtime.sendMessage({ type:'pair-page', value }).then(result => {
    if (result?.error) throw new Error(result.error);
    title.textContent = 'Seu Chrome está conectado.';
    status.textContent = 'Volte ao painel Tabyra. A janela compartilhada já está pronta; a conexão ficou salva neste perfil.';
    status.classList.add('done');
  }).catch(error => {
    title.textContent = 'Vamos tentar de novo.';
    status.textContent = error.message + ' Volte ao painel e clique em Conectar Chrome para gerar um novo acesso.';
  });
})();

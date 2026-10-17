(() => {
  'use strict';
  let sequence = 0, signature, busy = false, timer, queue = Promise.resolve();
  let stateSignature, preferenceSignature, epoch = 0, stopping;
  let latestMove, moveQueued = false;
  let visible = true, started = false, economy = true, pendingRefresh = false;
  const dispatch = data => window.dispatchEvent(new MessageEvent('message', { data }));
  const error = reason => dispatch({ type: 'error', text: reason.message || String(reason) });
  async function api(route, body = {}) {
    const response = await window.sidecar.fetch(route, { method: 'POST', body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok || data?.error) throw new Error(data.error || 'O painel não conseguiu acessar o navegador.');
    return data;
  }
  async function poll(force = false) {
    if (busy) { pendingRefresh ||= force; return; }
    clearTimeout(timer);
    if (!started || document.hidden || !visible) return;
    busy = true;
    try {
      const result = await api('/api/poll', { after: sequence, signature, frame: true });
      const nextState = JSON.stringify(result.state), nextPreferences = JSON.stringify(result.preferences);
      if (nextState !== stateSignature) { stateSignature = nextState; dispatch({ type: 'state', state: result.state }); }
      if (nextPreferences !== preferenceSignature) { preferenceSignature = nextPreferences; dispatch({ type: 'preferences', ...result.preferences }); }
      economy = result.preferences.economy;
      for (const message of result.messages) dispatch(message);
      sequence = result.sequence;
      if (result.frame) { signature = result.frame.signature; dispatch({ type: 'frame', ...result.frame }); }
      if (!result.state.running && result.state.mode !== 'chrome') document.getElementById('starting').textContent = 'Navegador encerrado. Abra uma página ou uma nova aba para retomar.';
    } catch (reason) { error(reason); }
    finally {
      busy = false;
      const immediate = pendingRefresh; pendingRefresh = false;
      timer = setTimeout(() => poll(), immediate ? 0 : economy ? 1000 : 300);
    }
  }
  function enqueue(task, refresh = true) {
    const generation = epoch;
    queue = queue.then(async () => {
      if (generation !== epoch) return;
      await stopping;
      if (generation !== epoch) return;
      await task();
      if (refresh) return poll(true);
    }).catch(reason => { if (generation === epoch) error(reason); });
    return queue;
  }
  window.acquireVsCodeApi = () => ({
    postMessage(message) {
      if (message.type === 'ready') {
        enqueue(async () => { await api('/api/open'); started = true; });
      } else if (message.type === 'action') {
        if (message.method === 'agent' || message.method === 'cancel') {
          // Stop controls must not wait behind navigation or pointer events.
          void api('/api/action', { method: message.method, args: message.args || {} }).then(() => poll(true)).catch(error);
          return;
        }
        const move = message.method === 'input' && message.args?.kind === 'mouse' && message.args?.phase === 'move';
        if (move) {
          latestMove = message;
          if (!moveQueued) {
            moveQueued = true;
            enqueue(async () => {
              const current = latestMove; latestMove = undefined; moveQueued = false;
              if (current) await api('/api/action', { method: current.method, args: current.args });
            }, false);
          }
          return;
        }
        enqueue(async () => {
          await api('/api/action', { method: message.method, args: message.args || {} });
          if (message.method === 'chrome_open') dispatch({ type: 'chrome_opened' });
        }, !move);
      } else if (message.type === 'economy') enqueue(() => api('/api/preferences'));
      else if (message.type === 'copy') enqueue(async () => {
        const selection = await api('/api/selection');
        if (selection.text) await navigator.clipboard.writeText(selection.text);
      }, false);
      else if (message.type === 'mcp') {
        const prompt = 'Use somente o MCP do plugin Tabyra App (servidor elektron-app_elektron-app) para executar browser_tabs e browser_snapshot. Informe claramente se as ferramentas não estiverem disponíveis.';
        navigator.clipboard.writeText(prompt).then(() => {
          document.getElementById('copy-config').textContent = 'Pedido copiado ✓';
          document.getElementById('copy-feedback').textContent = 'Cole o pedido na conversa para testar a conexão.';
        }).catch(error);
      } else if (message.type === 'chrome-guide') enqueue(async () => dispatch({ type: 'chrome_connection', ...await api('/api/chrome') }), false);
      else if (message.type === 'chrome-copy') enqueue(async () => {
        const info = await api('/api/chrome');
        const value = message.kind === 'code' ? info.code : info.extensionDir;
        if (!value) throw new Error('Selecione Chrome conectado primeiro.');
        await navigator.clipboard.writeText(value); dispatch({ type: 'chrome_copied', kind: message.kind });
      }, false);
      else if (message.type === 'external') {
        const url = document.getElementById('address').value;
        if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  });
  document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden) void poll(); });
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stop-browser').onclick = () => {
      if (stopping) return;
      epoch++; latestMove = undefined; moveQueued = false;
      stopping = api('/api/stop').then(() => poll(true)).catch(error).finally(() => { stopping = undefined; });
    };
    document.querySelector('#connection h2').textContent = 'Seu navegador, dentro do Antigravity.';
    document.querySelector('#connection > p').textContent = 'O plugin inclui a conexão MCP. A IDE pode ficar fechada.';
    const steps = [
      ['Abra o painel', 'Na conversa: ⋮ → Extensions → Tabyra. O perfil é do Tabyra App e é compartilhado entre os projetos deste aplicativo.'],
      ['Use o servidor certo', 'Peça à IA para usar o MCP do plugin Tabyra App. O servidor elektron-browser continua sendo o da IDE.'],
      ['Teste a conexão', 'Se as ferramentas não aparecerem, vá a Customizations → Installed → Tabyra App → MCP. O nome completo do servidor é elektron-app_elektron-app.']
    ];
    for (let i = 0; i < steps.length; i++) {
      document.querySelectorAll('#connection li strong')[i].textContent = steps[i][0];
      document.querySelectorAll('#connection li p')[i].textContent = steps[i][1];
    }
    document.getElementById('copy-config').textContent = 'Copiar pedido de teste';
    document.querySelector('.connection-note').textContent = 'Pausar IA bloqueia as próximas ações. O botão Encerrar navegador libera memória e mantém cookies e logins no perfil. Copiar pedido de teste não envia mensagens ao chat.';
    document.getElementById('mcp').querySelector('span').textContent = 'Conexão';
    document.getElementById('connection-status').title = 'Perfil próprio do Tabyra App, compartilhado entre projetos e separado do Chrome pessoal e do Tabyra da IDE.';
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      clearTimeout(timer);
      if (visible) void poll();
    }).observe(document.body);
  });
})();

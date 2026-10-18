(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const screen = $('screen');
  const ctx = screen.getContext('2d');
  const keyboard = $('keyboard');
  let state = { tabs: [], agentEnabled: true };
  let frameWidth = 1100, frameHeight = 750, imageVersion = 0;
  let composing = false;
  let lastTab, activityTimer, cursorTimer, pendingTarget, connecting = false;
  const post = message => vscode.postMessage(message);
  function action(method, args = {}) {
    if (['browser_mode', 'navigate', 'switch_tab', 'new_tab', 'close_tab', 'back', 'forward', 'reload'].includes(method)) {
      pendingTarget = undefined; $('agent-cursor').classList.add('hidden'); $('activity').classList.add('hidden');
      $('notice').classList.add('hidden');
    }
    post({ type: 'action', method, args });
  }
  function navigate(url) {
    url = url.trim();
    if (!url) { $('address').focus(); return; }
    if (!/^[a-z][a-z\d+.-]*:/i.test(url) && (/\s/.test(url) || !/[.\/]/.test(url) && !/^localhost(?::\d+)?$/i.test(url))) {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
    }
    $('busy').classList.remove('hidden');
    if (!state.tabs.length) action('new_tab', { url }); else action('navigate', { url });
  }
  function notice(text, error = false) {
    $('notice-text').textContent = text;
    $('notice').classList.remove('hidden');
    $('notice').classList.toggle('error', error);
    $('busy').classList.add('hidden');
  }
  function renderState(next) {
    const wasConnected = state.connected;
    state = next;
    const active = state.tabs.find(tab => tab.id === state.activeId);
    if (lastTab !== state.activeId) { $('agent-cursor').classList.add('hidden'); lastTab = state.activeId; }
    if (pendingTarget) placeCursor(pendingTarget);
    $('tabs').replaceChildren(...state.tabs.map(tab => {
      const row = document.createElement('div');
      row.className = 'tab' + (tab.id === state.activeId ? ' selected' : '');
      row.setAttribute('role', 'tab');
      row.setAttribute('aria-selected', String(tab.id === state.activeId));
      const title = document.createElement('button');
      title.textContent = tab.title || (tab.url === 'about:blank' ? 'Nova aba' : tab.url);
      title.title = tab.url;
      title.onclick = () => action('switch_tab', { tabId: tab.id });
      const close = document.createElement('button');
      close.textContent = '×'; close.className = 'close-tab';
      close.title = 'Fechar aba'; close.setAttribute('aria-label', `Fechar ${title.textContent}`);
      close.onclick = () => action('close_tab', { tabId: tab.id });
      row.append(title, close); return row;
    }));
    if (document.activeElement !== $('address')) $('address').value = active?.url === 'about:blank' ? '' : active?.url || '';
    const blank = !active || active.url === 'about:blank';
    $('welcome').classList.toggle('hidden', !blank);
    $('start-chrome').classList.toggle('hidden',state.mode !== 'chrome' || state.connected && state.tabs.length > 0);
    $('start-chrome').textContent = state.connected ? 'Reabrir janela do Chrome ↗' : 'Conectar Chrome ↗';
    $('starting').textContent = state.running ? 'Tudo pronto. Seu perfil fica separado do navegador pessoal.' : 'Preparando seu navegador…';
    $('browser-mode').value = state.mode || 'embedded';
    $('chrome-setup').classList.toggle('hidden', state.mode !== 'chrome');
    $('chrome-settings').classList.toggle('connected', state.mode === 'chrome' && state.connected);
    $('chrome-settings').textContent = state.mode === 'chrome' ? state.connected ? 'Chrome ✓' : 'Chrome…' : 'Chrome';
    $('chrome-state-title').textContent = state.connected ? 'Chrome conectado' : connecting ? 'Conectando…' : 'Pronto para conectar';
    $('chrome-status').textContent = state.connected ? 'Mesmas abas e contas do perfil do Chrome.' : 'A extensão guarda sua conexão neste perfil.';
    $('chrome-connect').textContent = state.connected ? 'Reconectar Chrome ↗' : 'Conectar Chrome ↗';
    $('chrome-connect').disabled = connecting;
    $('chrome-update').classList.toggle('hidden', !state.connected || state.helperVersion !== '0.1.0');
    if (state.connected && (!wasConnected || connecting)) { connecting = false; $('chrome-connect').disabled = false; $('chrome-feedback').textContent = 'Tudo pronto. A conexão foi salva.'; }
    $('chrome-manual').disabled = !state.connected;
    $('chrome-login').classList.toggle('hidden', !state.manual);
    if (state.mode === 'chrome') $('starting').textContent = state.connected ? 'Chrome conectado. Suas contas pertencem ao perfil do Chrome.' : 'Abra Chrome → Conectar Chrome para continuar. Sem copiar códigos.';
    $('operation').classList.toggle('hidden', state.busy?.method !== 'evaluate');
    if (state.busy?.method === 'evaluate') $('operation-label').textContent = `Executando JavaScript · ${Math.floor(state.busy.elapsedMs / 1000)} s`;
    $('agent').classList.toggle('paused', !state.agentEnabled);
    $('agent').setAttribute('aria-pressed', String(state.agentEnabled));
    $('agent-label').textContent = state.agentEnabled ? 'Pausar IA' : 'Retomar IA';
    $('agent').title = state.agentEnabled ? 'Pausar o acesso da IA a este navegador' : 'Retomar o acesso da IA';
    for (const id of ['back', 'forward']) $(id).disabled = !active;
    for (const id of ['reload', 'external']) $(id).disabled = !active || blank;
    if (!state.agentEnabled) { $('connection-label').textContent = 'IA pausada'; $('agent-cursor').classList.add('hidden'); }
    else if ($('connection-label').textContent === 'IA pausada') $('connection-label').textContent = 'Navegador compartilhado';
    $('busy').classList.add('hidden');
  }
  window.addEventListener('message', event => {
    // VS Code forwards from its same-origin frame and masks window.parent.
    // App also dispatches local events. Unrelated origins cannot supply state.
    const local = event.source === window || event.source === null && !event.isTrusted;
    if (!local && event.origin !== location.origin) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    if (message.type === 'state') renderState(message.state);
    else if (message.type === 'chrome_connection') {
      $('chrome-copy-code').disabled = !message.code;
      $('chrome-copy-path').disabled = !message.extensionDir;
    } else if (message.type === 'chrome_copied') $('chrome-feedback').textContent = message.kind === 'code' ? 'Código copiado. Cole na extensão Tabyra do Chrome.' : 'Pasta copiada. Cole no seletor Carregar sem compactação.';
    else if (message.type === 'chrome_opened') {
      $('chrome-open').disabled = false;
      $('chrome-feedback').textContent = connecting ? 'Conexão aberta no Chrome. A extensão conclui automaticamente; se faltar, abra Primeiro acesso abaixo.' : 'Abertura solicitada. Instale ou atualize a extensão Tabyra uma vez e depois clique em Conectar Chrome.';
      connecting = false; $('chrome-connect').disabled = false;
    }
    else if (message.type === 'frame') {
      const version = ++imageVersion;
      const image = new Image();
      image.onload = () => {
        if (version !== imageVersion) return;
        frameWidth = message.width; frameHeight = message.height;
        if (screen.width !== frameWidth || screen.height !== frameHeight) { screen.width = frameWidth; screen.height = frameHeight; }
        ctx.drawImage(image, 0, 0);
      };
      image.src = 'data:image/jpeg;base64,' + message.data;
    } else if (message.type === 'activity') showActivity(message.activity);
    else if (message.type === 'preferences') {
      $('economy').classList.toggle('enabled', message.economy);
      $('economy').setAttribute('aria-pressed', String(message.economy));
      $('economy').title = message.economy ? 'Modo leve ligado: capturas periódicas a cada segundo; suas ações atualizam na hora. Clique para voltar ao modo normal.' : 'Ligar modo leve: reduz a frequência e a qualidade das imagens';
    } else if (message.type === 'host') {
      if (message.kind === 'vscode') {
        document.querySelector('#connection > p').textContent = 'Conecte um agente com suporte a MCP às mesmas abas do painel.';
        const steps = document.querySelectorAll('#connection li');
        steps[1].querySelector('strong').textContent = 'Adicione no VS Code';
        steps[1].querySelector('p').textContent = 'Mescle servers.elektron-browser em .vscode/mcp.json. A configuração copiada já usa o formato do VS Code.';
        steps[2].querySelector('p').textContent = 'Execute MCP: List Servers, inicie elektron-browser e habilite suas ferramentas no chat com um agente compatível.';
        $('connection').dataset.host = 'vscode';
      }
    } else if (message.type === 'connection') openConnection();
    else if (message.type === 'copied') {
      $('copy-config').textContent = 'Configuração copiada ✓';
      $('copy-feedback').textContent = $('connection').dataset.host === 'vscode' ? 'Mescle servers.elektron-browser em .vscode/mcp.json e inicie o servidor.' : 'Agora adicione a entrada elektron-browser no Antigravity e atualize os servidores.';
    } else if (message.type === 'error' || message.type === 'notice') {
      $('chrome-open').disabled = false;
      connecting = false; $('chrome-connect').disabled = false;
      notice(message.text, message.type === 'error');
      if (message.type === 'error' && !$('chrome-guide').classList.contains('hidden')) $('chrome-feedback').textContent = message.text;
    }
  });
  function openConnection() { $('connection').classList.remove('hidden'); $('close-connection').focus(); }
  function placeCursor(activity) {
    if (activity.tabId !== state.activeId || !Number.isFinite(activity.x) || !Number.isFinite(activity.y)) return;
    const cursor = $('agent-cursor');
    cursor.style.left = Math.max(0, Math.min(1, activity.x)) * 100 + '%';
    cursor.style.top = Math.max(0, Math.min(1, activity.y)) * 100 + '%';
    cursor.classList.remove('hidden');
  }
  function showActivity(activity) {
    const names = { evaluate: 'Executando JavaScript', tabs: 'Consultando abas', snapshot: 'Lendo a página', screenshot: 'Observando a página', navigate: 'Abrindo uma página', new_tab: 'Abrindo uma aba', switch_tab: 'Trocando de aba', close_tab: 'Fechando uma aba', click: 'Clicando na página', fill: 'Preenchendo um campo', type: 'Digitando texto', press: 'Usando o teclado', scroll: 'Rolando a página', back: 'Voltando uma página', forward: 'Avançando uma página', reload: 'Atualizando a página' };
    clearTimeout(activityTimer);
    const completed = { evaluate: 'Automação concluída', click: 'Clique realizado', fill: 'Campo preenchido', type: 'Texto inserido', snapshot: 'Página lida', screenshot: 'Página observada', navigate: 'Navegação concluída', press: 'Tecla enviada', scroll: 'Página rolada', tabs: 'Abas consultadas' };
    const label = activity.phase === 'complete' ? completed[activity.method] || 'Ação concluída' : names[activity.method] || 'Trabalhando na página';
    $('activity-text').textContent = activity.phase === 'error' ? 'IA: ação não concluída' : 'IA · ' + label;
    $('activity').classList.remove('hidden');
    $('connection-label').textContent = 'Acesso da IA detectado';
    if (activity.phase === 'begin' && ['evaluate', 'navigate', 'new_tab', 'switch_tab', 'close_tab', 'back', 'forward', 'reload'].includes(activity.method)) {
      clearTimeout(cursorTimer); pendingTarget = undefined; $('agent-cursor').classList.add('hidden');
    }
    if (activity.phase === 'target') {
      const cursor = $('agent-cursor');
      clearTimeout(cursorTimer);
      pendingTarget = activity;
      cursor.classList.remove('click');
      placeCursor(activity);
      if (activity.method === 'click') { void cursor.offsetWidth; cursor.classList.add('click'); }
      cursorTimer = setTimeout(() => { pendingTarget = undefined; cursor.classList.add('hidden'); }, 2600);
    }
    if (activity.phase === 'complete' || activity.phase === 'error') activityTimer = setTimeout(() => $('activity').classList.add('hidden'), 2300);
  }
  $('navigation').onsubmit = event => { event.preventDefault(); navigate($('address').value); keyboard.focus({ preventScroll: true }); };
  $('start-navigation').onsubmit = event => { event.preventDefault(); navigate($('start-address').value); };
  $('address').addEventListener('focus', () => $('address').select());
  $('new-tab').onclick = () => action('new_tab');
  for (const method of ['back', 'forward', 'reload']) $(method).onclick = () => action(method);
  $('agent').onclick = () => action('agent', { enabled: !state.agentEnabled });
  $('mcp').onclick = openConnection;
  $('welcome-connect').onclick = openConnection;
  $('close-connection').onclick = () => { $('connection').classList.add('hidden'); $('mcp').focus(); };
  $('copy-config').onclick = () => post({ type: 'mcp' });
  $('economy').onclick = () => post({ type: 'economy' });
  $('chrome-settings').onclick = () => { $('connection').classList.add('hidden'); $('chrome-guide').classList.remove('hidden'); $('chrome-guide').scrollTop = 0; $('close-chrome').focus({ preventScroll: true }); post({ type: 'chrome-guide' }); };
  $('close-chrome').onclick = () => $('chrome-guide').classList.add('hidden');
  $('browser-mode').onchange = () => { action('browser_mode', { mode: $('browser-mode').value }); post({ type: 'chrome-guide' }); };
  $('chrome-open').onclick = () => {
    $('chrome-open').disabled = true;
    $('chrome-feedback').textContent = 'Solicitando uma janela do Chrome…';
    action('chrome_open');
  };
  $('chrome-copy-code').onclick = () => post({ type: 'chrome-copy', kind: 'code' });
  $('chrome-connect').onclick = () => {
    connecting = true; $('chrome-connect').disabled = true;
    $('chrome-feedback').textContent = 'Abrindo a conexão no Chrome…';
    action('chrome_open', {connect:true});
  };
  $('cancel-operation').onclick = () => { action('cancel'); };
  $('start-chrome').onclick = () => $('chrome-connect').click();
  $('chrome-copy-path').onclick = () => post({ type: 'chrome-copy', kind: 'path' });
  $('chrome-manual').onclick = () => { $('chrome-guide').classList.add('hidden'); action('chrome_manual', { enabled: true }); };
  $('chrome-resume').onclick = () => action('chrome_manual', { enabled: false });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); $('address').focus(); }
    if (event.key === 'Escape' && !$('connection').classList.contains('hidden')) { $('connection').classList.add('hidden'); $('mcp').focus(); }
    if (event.key === 'Escape') $('chrome-guide').classList.add('hidden');
  });
  $('external').onclick = () => post({ type: 'external' });
  $('dismiss').onclick = () => $('notice').classList.add('hidden');
  for (const button of document.querySelectorAll('[data-url]')) button.onclick = () => navigate(button.dataset.url);
  const coordinates = event => {
    const rect = screen.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * frameWidth, y: (event.clientY - rect.top) / rect.height * frameHeight };
  };
  const buttonName = button => button === 2 ? 'right' : button === 1 ? 'middle' : 'left';
  screen.addEventListener('pointerdown', event => {
    event.preventDefault(); keyboard.focus({ preventScroll: true }); screen.setPointerCapture(event.pointerId);
    $('agent-cursor').classList.add('hidden');
    pendingTarget = undefined;
    action('input', { kind: 'mouse', phase: 'down', ...coordinates(event), button: buttonName(event.button), double: event.detail === 2 });
  });
  screen.addEventListener('pointerup', event => {
    action('input', { kind: 'mouse', phase: 'up', ...coordinates(event), button: buttonName(event.button), double: event.detail === 2 });
    if (screen.hasPointerCapture(event.pointerId)) screen.releasePointerCapture(event.pointerId);
  });
  let lastMove = 0;
  screen.addEventListener('pointermove', event => {
    if (Date.now() - lastMove < 60) return;
    lastMove = Date.now(); action('input', { kind: 'mouse', phase: 'move', ...coordinates(event) });
  });
  screen.addEventListener('contextmenu', event => event.preventDefault());
  screen.addEventListener('wheel', event => {
    event.preventDefault();
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frameHeight : 1;
    action('input', { kind: 'wheel', x: event.deltaX * factor, y: event.deltaY * factor });
  }, { passive: false });
  keyboard.addEventListener('keydown', event => {
    if (event.isComposing) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'v') return; // paste event carries actual clipboard text
    if (modifier && event.key.toLowerCase() === 'c') { event.preventDefault(); post({ type: 'copy' }); return; }
    if (modifier && event.key.toLowerCase() === 'l') { event.preventDefault(); $('address').focus(); return; }
    if (['Control', 'Meta', 'Shift', 'Alt', 'Dead', 'Process', 'Unidentified'].includes(event.key)) return;
    if (event.key.length === 1 && !modifier && !event.altKey) return; // handled by beforeinput, including accents
    event.preventDefault();
    const aliases = { ' ': 'Space', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
    const mods = [event.ctrlKey && 'Control', event.metaKey && 'Meta', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
    action('input', { kind: 'key', key: [...mods, aliases[event.key] || event.key].join('+') });
  });
  keyboard.addEventListener('beforeinput', event => {
    if (event.isComposing || event.inputType === 'insertCompositionText') return;
    if (event.inputType === 'insertText' && event.data) { event.preventDefault(); action('input', { kind: 'text', text: event.data }); }
  });
  keyboard.addEventListener('compositionstart', () => { composing = true; });
  keyboard.addEventListener('compositionend', event => { composing = false; if (event.data) action('input', { kind: 'text', text: event.data }); keyboard.value = ''; });
  keyboard.addEventListener('input', () => { if (!composing) keyboard.value = ''; });
  keyboard.addEventListener('paste', event => {
    event.preventDefault(); const text = event.clipboardData?.getData('text/plain');
    if (text) action('input', { kind: 'text', text });
  });
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const rect = $('viewport').getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) action('resize', { width: rect.width, height: rect.height });
    }, 200);
  }).observe($('viewport'));
  post({ type: 'ready' });
})();

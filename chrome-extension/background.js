'use strict';
let socket, connection, connectPromise, heartbeat, retry, ready = false;
let windowId, manual = false, connecting = false, generation = 0;
const attached = new Set(), attaching = new Map();
const expectedDetach = new Set();
const send = value => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
const safeUrl = url => url === 'about:blank' || /^https?:\/\//i.test(url);
const safeTab = tab => ({ id: tab.id, windowId: tab.windowId, title: tab.title || '', url: tab.url || 'about:blank', active: tab.active, width: tab.width, height: tab.height });
async function status(text, error = false) {
  await chrome.storage.session.set({ status: text, error, connected: ready && socket?.readyState === WebSocket.OPEN, manual });
  await chrome.action.setBadgeText({ text: error ? '!' : socket?.readyState === WebSocket.OPEN ? 'ON' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: error ? '#b84c59' : '#416de4' });
}
async function ownedTabs() {
  if (!windowId) return [];
  try { return (await chrome.tabs.query({ windowId })).map(safeTab); }
  catch { windowId = undefined; return []; }
}
async function publishTabs() {
  const tabs = await ownedTabs();
  send({ type: 'tabs', tabs, activeId: tabs.find(tab => tab.active)?.id });
}
async function ensureWindow(url = 'about:blank') {
  if (!safeUrl(url)) throw new Error('Endereço não permitido.');
  if (windowId) { try { await chrome.windows.get(windowId); return false; } catch { windowId = undefined; } }
  const created = await chrome.windows.create({ url, type: 'normal', focused: false, width: 1200, height: 850 });
  windowId = created.id;
  await chrome.storage.session.set({ windowId });
  return true;
}
async function tabInWindow(tabId) {
  if (!Number.isInteger(tabId)) throw new Error('Aba inválida.');
  const tab = await chrome.tabs.get(tabId);
  if (!windowId || tab.windowId !== windowId) throw new Error('Esta aba não pertence à janela Tabyra.');
  return tab;
}
async function detachAll() {
  await Promise.all([...attaching.values()].map(task => task.catch(() => {})));
  await Promise.all([...attached].map(async tabId => { expectedDetach.add(tabId); try { await chrome.debugger.detach({ tabId }); } catch { expectedDetach.delete(tabId); } attached.delete(tabId); }));
}
async function attach(tabId) {
  await tabInWindow(tabId);
  if (manual) throw new Error('Login manual ativo. Retome o painel depois de concluir no Chrome.');
  if (attaching.has(tabId)) return attaching.get(tabId);
  const task = (async () => {
    if (!attached.has(tabId)) { await chrome.debugger.attach({ tabId }, '1.3'); attached.add(tabId); }
    return chrome.debugger.sendCommand({ tabId }, 'Target.getTargetInfo');
  })().finally(() => attaching.delete(tabId));
  attaching.set(tabId, task); return task;
}
async function dispatch(method, params) {
  switch (method) {
    case 'attach': return attach(params.tabId);
    case 'detachAll': await detachAll(); return {};
    case 'command':
      await tabInWindow(params.tabId);
      if (manual || !attached.has(params.tabId)) throw new Error('Controle da aba desconectado.');
      return chrome.debugger.sendCommand({ tabId: params.tabId, ...(params.sessionId ? { sessionId: params.sessionId } : {}) }, params.method, params.params);
    case 'newTab': {
      if (!safeUrl(params.url)) throw new Error('Endereço não permitido.');
      const created = await ensureWindow(params.url);
      const tab = created ? (await chrome.tabs.query({ windowId }))[0] : await chrome.tabs.create({ windowId, url: params.url, active: true });
      await publishTabs(); return safeTab(tab);
    }
    case 'closeTab': await tabInWindow(params.tabId); await chrome.tabs.remove(params.tabId); await publishTabs(); return {};
    case 'activate': await tabInWindow(params.tabId); await chrome.tabs.update(params.tabId, { active: true }); await publishTabs(); return {};
    case 'prepare': {
      if (!windowId) throw new Error('A janela compartilhada foi encerrada.');
      const window = await chrome.windows.get(windowId);
      // A minimized native window has no usable compositor surface for CDP
      // screenshots. Restore only our window without taking the user's focus.
      if (window.state === 'minimized') await chrome.windows.update(windowId, { state: 'normal', focused: false });
      return {};
    }
    case 'manual':
      manual = params.enabled === true;
      await chrome.storage.session.set({ manual });
      if (manual) { await detachAll(); if (windowId) await chrome.windows.update(windowId, { focused: true }); }
      await status(manual ? 'Login manual: conclua no Chrome e retome no painel.' : 'Chrome conectado ao painel Tabyra.');
      return {};
    case 'capture': {
      await tabInWindow(params.tabId);
      await chrome.tabs.update(params.tabId, { active: true });
      const data = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: Math.min(95, Math.max(30, params.quality || 65)) });
      const encoded = data.split(',')[1];
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: 'image/jpeg' }));
      const result = { data: encoded, width: bitmap.width, height: bitmap.height }; bitmap.close(); return result;
    }
    default: throw new Error('Comando desconhecido.');
  }
}
function validateConfig(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  const url = new URL(parsed.endpoint);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.pathname !== '/extension' || url.search || url.hash || url.username || url.password || !/^[a-f0-9]{64}$/.test(parsed.token)) throw new Error('Código de conexão Tabyra inválido.');
  return { endpoint: url.href, token: parsed.token };
}
async function connect() {
  if (connecting || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING || !connection) return;
  connecting = true;
  const current = ++generation;
  clearTimeout(retry); clearInterval(heartbeat);
  try {
    if (!windowId) { await status('Abra uma janela Tabyra pelo botão Conectar.'); return; }
    try { await chrome.windows.get(windowId); } catch { windowId = undefined; await status('Janela encerrada. Clique em Conectar para abrir outra.'); return; }
    if (current !== generation) return;
    socket = new WebSocket(connection.endpoint);
    const ws = socket;
    ws.onopen = async () => {
      const tabs = await ownedTabs();
      if (socket !== ws) return;
      ws.send(JSON.stringify({ type: 'hello', token: connection.token, version:chrome.runtime.getManifest().version, manual, userAgent: navigator.userAgent, tabs, activeId: tabs.find(tab => tab.active)?.id }));
      heartbeat = setInterval(() => send({ type: 'ping' }), 20000);
    };
    ws.onmessage = async event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ready') {
          if (/^[a-f0-9]{64}$/.test(message.token || '')) connection = {...connection,token:message.token};
          await chrome.storage.local.set({connection});
          ready = true;
          await status('Chrome conectado ao painel Tabyra.'); return;
        }
        if (!Number.isInteger(message.id)) return;
        try { const result = await dispatch(message.method, message.params || {}); if (socket === ws) send({ id: message.id, result }); }
        catch (error) { if (socket === ws) send({ id: message.id, error: error.message }); }
      } catch { ws.close(1008); }
    };
    ws.onerror = () => { void status('Tabyra indisponível. Abra o painel para reconectar.', true); };
    ws.onclose = async () => {
      if (socket !== ws) return;
      socket = undefined; ready = false; clearInterval(heartbeat);
      await detachAll(); await status('Aguardando o painel Tabyra.');
      if (connection) retry = setTimeout(connect, 2000);
    };
  } catch (error) { await status(error.message, true); retry = setTimeout(connect, 2000); }
  finally { connecting = false; }
}
async function configure(value) {
  if (!value) value = (await chrome.storage.local.get('connection')).connection;
  const config = validateConfig(value);
  await ensureWindow();
  if (connection?.endpoint === config.endpoint && connection?.token === config.token && socket?.readyState === WebSocket.OPEN) { await publishTabs(); return; }
  ++generation; clearTimeout(retry); clearInterval(heartbeat);
  const previous = socket; socket = undefined; ready = false; previous?.close();
  await detachAll(); connection = config;
  await connect();
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (sender.tab) {
    let source, target;
    try { source = new URL(sender.url); target = new URL(message.value?.endpoint); } catch { respond({error:'Origem de conexão inválida.'}); return; }
    if (message.type !== 'pair-page' || sender.frameId !== 0 || source.protocol !== 'http:' || source.hostname !== '127.0.0.1' || source.pathname !== '/elektron/connect' || source.port !== target.port || target.protocol !== 'ws:' || target.hostname !== '127.0.0.1') { respond({error:'Conexão permitida somente pela página local do Tabyra.'}); return; }
  }
  const task = message.type === 'connect' || message.type === 'pair-page' ? (async () => {
    await configure(message.value);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) { if (ready && socket?.readyState === WebSocket.OPEN) {if(message.type==='connect' && windowId) await chrome.windows.update(windowId,{focused:true});return;} await new Promise(resolve=>setTimeout(resolve,100)); }
    throw new Error('O painel não confirmou a conexão.');
  })() : message.type === 'disconnect' ? (async () => {
    connection = undefined; ++generation; clearTimeout(retry); clearInterval(heartbeat);
    const previous = socket; socket = undefined; previous?.close(); await detachAll();
    await chrome.storage.local.remove('connection'); await status('Desconectado. Suas abas continuam no Chrome.');
  })() : Promise.reject(new Error('Pedido desconhecido.'));
  task.then(() => respond({ ok: true }), error => respond({ error: error.message })); return true;
});
chrome.debugger.onEvent.addListener((source, method, params) => { if (attached.has(source.tabId)) send({ type: 'event', source, method, params }); });
chrome.debugger.onDetach.addListener((source, reason) => {
  const expected = expectedDetach.delete(source.tabId);
  attached.delete(source.tabId); send({ type: 'detached', tabId: source.tabId });
  if (!expected && reason === 'canceled_by_user' && !manual && socket?.readyState === WebSocket.OPEN) {
    manual = true; void chrome.storage.session.set({ manual });
    send({ type: 'manual', enabled: true }); void detachAll();
    void status('Controle liberado no Chrome. Retome pelo painel quando quiser.');
  }
});
chrome.tabs.onCreated.addListener(tab => { if (tab.windowId === windowId) void publishTabs(); });
chrome.tabs.onUpdated.addListener((_, change, tab) => { if (tab.windowId === windowId && (change.url !== undefined || change.title !== undefined || change.status === 'complete')) void publishTabs(); });
chrome.tabs.onRemoved.addListener((tabId, info) => { if (info.windowId === windowId) { attached.delete(tabId); void publishTabs(); } });
chrome.tabs.onActivated.addListener(info => { if (info.windowId === windowId) void publishTabs(); });
chrome.tabs.onAttached.addListener((_, info) => { if (info.newWindowId === windowId) void publishTabs(); });
chrome.tabs.onDetached.addListener((tabId, info) => { if (info.oldWindowId === windowId) { expectedDetach.add(tabId); void chrome.debugger.detach({ tabId }).catch(() => expectedDetach.delete(tabId)); attached.delete(tabId); void publishTabs(); } });
chrome.windows.onRemoved.addListener(id => { if (id === windowId) { windowId = undefined; void chrome.storage.session.remove('windowId'); void publishTabs(); } });
chrome.alarms.create('elektron-reconnect', { periodInMinutes: .5 });
chrome.alarms.onAlarm.addListener(() => { void connect(); });
connectPromise = (async () => {
  const saved = await chrome.storage.session.get(['windowId', 'manual']);
  windowId = saved.windowId; manual = saved.manual === true;
  const local = await chrome.storage.local.get('connection');
  if (local.connection) { try { connection = validateConfig(local.connection); await connect(); } catch (error) { await status(error.message, true); } }
})();

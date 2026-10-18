import { EventEmitter } from 'node:events';
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { pairingPage } from './chrome-pairing';

type ChromeTab = { id: number; windowId: number; url: string; title: string; width?: number; height?: number; active?: boolean };
type TabSession = { tabId: number; sessionId: string; targetInfo: any; children: Set<string> };
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

/** Authenticated CDP transport over chrome.debugger. Chrome is never launched or owned here. */
export class ChromeRelay extends EventEmitter {
  private server = http.createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/elektron/connect' || request.headers.host !== `127.0.0.1:${this.port}` || request.headers.origin) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
    response.end(pairingPage);
  });
  private sockets = new WebSocketServer({ noServer: true, maxPayload: 12 * 1024 * 1024 });
  private extension?: WebSocket;
  private client?: WebSocket;
  private pending = new Map<number, Pending>();
  private tabs = new Map<number, ChromeTab>();
  private sessions = new Map<number, TabSession>();
  private attaching = new Map<number, Promise<TabSession>>();
  private aliases = new Map<string, TabSession>();
  private next = 0;
  private autoAttach = false;
  private stopping = false;
  private starting?: Promise<void>;
  private closing?: Promise<void>;
  private port = 0;
  private token = '';
  private cdpToken = randomBytes(32).toString('hex');
  private userAgent = '';
  private handoff?: { token: string; expires: number };
  private handshakes = new Set<WebSocket>();
  extensionVersion?: string;
  activeId?: number;
  manual = false;
  get connected() { return this.extension?.readyState === WebSocket.OPEN; }
  constructor(private directory: string) { super(); }

  start(): Promise<void> { return this.starting ??= this.listen(); }
  private async listen() {
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, 'chrome-connection.json');
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (!Number.isInteger(saved.port) || saved.port < 1024 || saved.port > 65535 || !/^[a-f0-9]{64}$/.test(saved.token)) throw new Error('Configuração Chrome inválida.');
      this.port = saved.port; this.token = saved.token;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    this.token ||= randomBytes(32).toString('hex');
    this.server.on('upgrade', (request, socket, head) => {
      if (request.headers.host !== `127.0.0.1:${this.port}`) { socket.destroy(); return; }
      const extension = request.url === '/extension' && /^chrome-extension:\/\/[a-p]{32}$/.test(request.headers.origin || '');
      const cdp = request.url === '/cdp' && !request.headers.origin && this.secret(request.headers.authorization || '', `Bearer ${this.cdpToken}`);
      if (this.stopping || !extension && !cdp || extension && (this.connected || this.handshakes.size >= 32) || cdp && (!this.connected || this.manual || this.client)) { socket.destroy(); return; }
      this.sockets.handleUpgrade(request, socket, head, ws => {
        ws.on('error', () => {});
        if (extension) this.handshake(ws);
        else this.connectClient(ws);
      });
    });
    const bind = () => new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => { this.server.off('error', reject); resolve(); });
    });
    try { await bind(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error; this.port = 0; await bind(); }
    this.port = (this.server.address() as { port: number }).port;
    await writeFile(file, JSON.stringify({ port: this.port, token: this.token }), { mode: 0o600 });
  }
  private secret(actual: string, expected: string) {
    const a = Buffer.from(actual), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  pairing() { return JSON.stringify({ endpoint: `ws://127.0.0.1:${this.port}/extension`, token: this.token }); }
  connectionUrl() {
    this.handoff = { token: randomBytes(32).toString('hex'), expires: Date.now() + 120000 };
    return `http://127.0.0.1:${this.port}/elektron/connect#key=${this.handoff.token}`;
  }
  endpoint() { return { endpointURL: `ws://127.0.0.1:${this.port}/cdp`, headers: { Authorization: `Bearer ${this.cdpToken}` } }; }
  tabId(targetId: string) { return [...this.sessions.values()].find(session => session.targetInfo.targetId === targetId)?.tabId; }
  listTabs() { return [...this.tabs.values()].map(tab => ({ id: String(tab.id), title: tab.title || '', url: tab.url || 'about:blank' })); }

  private handshake(ws: WebSocket) {
    this.handshakes.add(ws);
    let timer = setTimeout(() => ws.terminate(), 3000);
    const refuse = () => {
      ws.close(1008, 'Pairing refused');
      // Keep this unauthenticated peer in the admission count until it closes.
      timer = setTimeout(() => ws.terminate(), 1000);
    };
    ws.once('message', raw => {
      clearTimeout(timer);
      let hello: any;
      try {
        const json = raw.toString();
        if (Buffer.byteLength(json) > 64 * 1024) throw new Error('Handshake too large');
        hello = JSON.parse(json);
        if (!hello || typeof hello !== 'object' || Array.isArray(hello)) throw new Error('Invalid handshake');
      } catch { refuse(); return; }
      const handoff = this.handoff && Date.now() < this.handoff.expires && typeof hello.token === 'string' && this.secret(hello.token, this.handoff.token);
      if (this.extension || hello.type !== 'hello' || typeof hello.token !== 'string' || !handoff && !this.secret(hello.token, this.token)) { refuse(); return; }
      this.handshakes.delete(ws);
      if (handoff) this.handoff = undefined;
      this.extension = ws; this.tabs.clear(); this.sessions.clear(); this.aliases.clear();
      this.manual = hello.manual === true;
      this.userAgent = typeof hello.userAgent === 'string' ? hello.userAgent.slice(0, 500) : '';
      this.extensionVersion = typeof hello.version === 'string' ? hello.version.slice(0, 30) : '0.1.0';
      this.updateTabs(hello.tabs, hello.activeId);
      ws.on('message', raw => this.receive(raw.toString()));
      ws.on('close', () => {
        if (this.extension !== ws) return;
        this.extension = undefined; this.client?.close(); this.tabs.clear(); this.sessions.clear(); this.attaching.clear(); this.aliases.clear();
        this.rejectPending('A extensão do Chrome foi desconectada.');
        this.emit('changed');
      });
      ws.send(JSON.stringify({ type: 'ready', ...(handoff ? { token: this.token } : {}) }));
      this.emit('ready'); this.emit('changed');
    });
    ws.once('close', () => { clearTimeout(timer); this.handshakes.delete(ws); });
  }
  private updateTabs(tabs: unknown, activeId: unknown) {
    if (!Array.isArray(tabs)) return;
    this.tabs = new Map(tabs.filter(tab => tab && typeof tab === 'object' && Number.isInteger(tab.id)
      && Number.isInteger(tab.windowId) && typeof tab.url === 'string' && typeof tab.title === 'string').map(tab => [tab.id, tab]));
    this.activeId = typeof activeId === 'number' && this.tabs.has(activeId) ? activeId : this.tabs.keys().next().value;
  }
  private receive(raw: string) {
    try {
      const message = JSON.parse(raw);
      if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid message');
      if (Number.isInteger(message.id)) {
        const pending = this.pending.get(message.id);
        if (pending) { clearTimeout(pending.timer); this.pending.delete(message.id); message.error ? pending.reject(new Error(String(message.error))) : pending.resolve(message.result); }
      } else if (message.type === 'tabs') {
        this.updateTabs(message.tabs, message.activeId);
        for (const session of this.sessions.values()) if (!this.tabs.has(session.tabId)) this.detached(session.tabId);
        if (this.autoAttach && !this.manual) for (const id of this.tabs.keys()) void this.attach(id).catch(() => {});
        this.emit('changed');
      } else if (message.type === 'event') {
        const session = this.sessions.get(message.source?.tabId);
        if (!session) return;
        if (message.method === 'Target.attachedToTarget' && message.params?.sessionId) session.children.add(message.params.sessionId);
        if (message.method === 'Target.detachedFromTarget') session.children.delete(message.params?.sessionId);
        this.send({ sessionId: message.source.sessionId || session.sessionId, method: message.method, params: message.params });
      } else if (message.type === 'detached') this.detached(message.tabId);
      else if (message.type === 'manual' && message.enabled === true) { this.manual = true; this.emit('manual'); this.client?.close(); this.emit('changed'); }
    } catch { this.extension?.close(1008, 'Invalid message'); }
  }
  rpc(method: string, params: unknown = {}): Promise<any> {
    if (!this.connected) return Promise.reject(new Error('Conecte a extensão Tabyra no Chrome.'));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timeout = ['activate', 'prepare', 'capture'].includes(method) ? 2500 : method === 'command' ? 10000 : 12000;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`O Chrome não respondeu a ${method} em ${timeout / 1000} s. As abas foram preservadas.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.extension!.send(JSON.stringify({ id, method, params }));
    });
  }
  private rejectPending(reason: string) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); } this.pending.clear(); }
  private send(message: unknown) { if (this.client?.readyState === WebSocket.OPEN) this.client.send(JSON.stringify(message)); }
  private connectClient(ws: WebSocket) {
    this.client = ws; this.autoAttach = false;
    ws.on('message', async raw => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
        const result = await this.command(message.method, message.params || {}, message.sessionId);
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: message.id, sessionId: message.sessionId, result }));
      } catch (error) {
        if (message && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: message.id, sessionId: message.sessionId, error: { message: error instanceof Error ? error.message : String(error) } }));
      }
    });
    ws.on('close', () => {
      if (this.client !== ws) return;
      this.client = undefined; this.autoAttach = false; this.sessions.clear(); this.aliases.clear(); this.attaching.clear();
      void this.rpc('detachAll').catch(() => {});
    });
  }
  private attach(tabId: number): Promise<TabSession> {
    if (this.sessions.has(tabId)) return Promise.resolve(this.sessions.get(tabId)!);
    if (this.attaching.has(tabId)) return this.attaching.get(tabId)!;
    const task = (async () => {
      const result = await this.rpc('attach', { tabId });
      if (!this.client || this.manual) throw new Error('Controle desconectado.');
      const session = { tabId, sessionId: `elektron-tab-${++this.next}`, targetInfo: { ...result.targetInfo, browserContextId: 'elektron-shared' }, children: new Set<string>() };
      this.sessions.set(tabId, session);
      this.send({ method: 'Target.attachedToTarget', params: { sessionId: session.sessionId, targetInfo: { ...session.targetInfo, attached: true }, waitingForDebugger: false } });
      return session;
    })().finally(() => this.attaching.delete(tabId));
    this.attaching.set(tabId, task); return task;
  }
  private detached(tabId: number) {
    const session = this.sessions.get(tabId);
    if (!session) return;
    this.sessions.delete(tabId);
    for (const [id, alias] of this.aliases) if (alias === session) this.aliases.delete(id);
    this.send({ method: 'Target.detachedFromTarget', params: { sessionId: session.sessionId, targetId: session.targetInfo.targetId } });
  }
  private async command(method: string, params: any, sessionId?: string): Promise<any> {
    if (method === 'Browser.getVersion') return { protocolVersion: '1.3', product: `Chrome/${/Chrome\/([\d.]+)/.exec(this.userAgent)?.[1] || '155.0.0.0'}`, userAgent: this.userAgent, revision: '', jsVersion: '' };
    if (method === 'Browser.setDownloadBehavior' || method === 'Browser.setWindowBounds') return {};
    if (method === 'Target.attachToBrowserTarget') return { sessionId: `browser-${++this.next}` };
    if (method === 'Target.setAutoAttach' && (!sessionId || sessionId.startsWith('browser-'))) {
      this.autoAttach = params.autoAttach;
      if (this.autoAttach) await Promise.all([...this.tabs.keys()].map(id => this.attach(id)));
      return {};
    }
    if (method === 'Target.createTarget') {
      const tab = await this.rpc('newTab', { url: params.url });
      this.tabs.set(tab.id, tab); const session = await this.attach(tab.id);
      return { targetId: session.targetInfo.targetId };
    }
    if (method === 'Target.closeTarget') {
      const session = [...this.sessions.values()].find(s => s.targetInfo.targetId === params.targetId);
      if (!session) return { success: false };
      await this.rpc('closeTab', { tabId: session.tabId }); return { success: true };
    }
    if (method === 'Target.attachToTarget') {
      const session = [...this.sessions.values()].find(s => s.targetInfo.targetId === params.targetId);
      if (!session) throw new Error('Aba fora da janela compartilhada.');
      const alias = `elektron-extra-${++this.next}`; this.aliases.set(alias, session);
      return { sessionId: alias };
    }
    if (method === 'Target.detachFromTarget') { this.aliases.delete(params.sessionId); return {}; }
    const session = this.aliases.get(sessionId || '') || [...this.sessions.values()].find(s => s.sessionId === sessionId || s.children.has(sessionId || ''));
    if (method === 'Target.getTargetInfo') return { targetInfo: session?.targetInfo || { targetId: 'elektron-browser', type: 'browser', title: '', url: '', attached: true } };
    if (method === 'Browser.getWindowForTarget') return { windowId: this.tabs.values().next().value?.windowId || 1, bounds: { left: 0, top: 0, width: 1200, height: 850, windowState: 'normal' } };
    if (!session) throw new Error(`Comando fora de uma aba compartilhada: ${method}.`);
    const child = session.children.has(sessionId || '') ? sessionId : undefined;
    return this.rpc('command', { tabId: session.tabId, sessionId: child, method, params });
  }
  async setManual(enabled: boolean) {
    this.manual = enabled;
    await this.rpc('manual', { enabled });
    if (enabled) this.client?.close();
    this.emit('changed');
  }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.stopping = true;
      if (this.connected) await this.rpc('detachAll').catch(() => {});
      this.client?.terminate(); this.extension?.terminate();
      for (const socket of this.sockets.clients) socket.terminate();
      this.rejectPending('Conexão Chrome encerrada.');
      await new Promise<void>(resolve => this.server.close(() => resolve()));
      this.sockets.close(); this.removeAllListeners();
    })();
  }
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BrowserController, type BrowserMode, type BrowserState } from './core';

type Settings = { economy: boolean; agentEnabled: boolean; mode?: BrowserMode };
type Message = { sequence: number; type: string; [key: string]: unknown };

/** One persistent App profile, independent of workspaces and the IDE. */
export class AppSession {
  private controller?: BrowserController;
  private starting?: Promise<BrowserController>;
  private closing?: Promise<void>;
  private settings: Settings = { economy: true, agentEnabled: true };
  private saving: Promise<void> = Promise.resolve();
  private messages: Message[] = [];
  private sequence = 0;
  private frame?: { data: string; width: number; height: number; signature: string };
  private capturing?: Promise<typeof this.frame>;
  private nextCaptureAt = 0;
  private viewport?: Record<string, unknown>;
  private generation = 0;
  private disposed = false;
  private activeCalls = 0;
  private idleTimer?: NodeJS.Timeout;

  constructor(readonly dataDir: string, private executablePath?: string, private blankIdleMs = 60000, private chromeExtensionDir?: string) {}

  async initialize() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const stored = JSON.parse(await readFile(path.join(this.dataDir, 'settings.json'), 'utf8'));
      if (typeof stored.economy === 'boolean') this.settings.economy = stored.economy;
      if (typeof stored.agentEnabled === 'boolean') this.settings.agentEnabled = stored.agentEnabled;
      if (stored.mode === 'chrome' || stored.mode === 'embedded') this.settings.mode = stored.mode;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.emit('notice', { text: 'As preferências não puderam ser lidas; usando os padrões.' });
    }
  }

  private emit(type: string, data: Record<string, unknown>) {
    this.messages.push({ sequence: ++this.sequence, type, ...data });
    if (this.messages.length > 60) this.messages.shift();
  }

  private save() {
    const content = JSON.stringify(this.settings, null, 2);
    const pending = this.saving.then(() => writeFile(path.join(this.dataDir, 'settings.json'), content, { mode: 0o600 }));
    this.saving = pending.catch(() => {});
    return pending;
  }

  preferences() { return { ...this.settings }; }

  async open(): Promise<BrowserController> {
    if (this.disposed) throw new Error('O Tabyra App está encerrando.');
    if (this.closing) await this.closing;
    if (this.disposed) throw new Error('O Tabyra App está encerrando.');
    if (this.controller) { await this.controller.start(); return this.controller; }
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const controller = new BrowserController({ profileDir: path.join(this.dataDir, 'profile'), executablePath: this.executablePath, mode: this.settings.mode, chromeExtensionDir: this.chromeExtensionDir });
      controller.on('activity', activity => this.emit('activity', { activity }));
      controller.on('notice', text => this.emit('notice', { text }));
      try {
        await controller.start();
        if (this.viewport) await controller.call('resize', this.viewport);
        await controller.call('agent', { enabled: this.settings.agentEnabled && !(await controller.state()).manual });
        this.controller = controller;
        this.nextCaptureAt = 0;
        this.scheduleIdle();
        return controller;
      } catch (error) { await controller.close(); throw error; }
    })();
    try { return await this.starting; } finally { this.starting = undefined; }
  }

  async state(): Promise<BrowserState> {
    const state: BrowserState = this.controller ? await this.controller.state() : { running: false, tabs: [], agentEnabled: this.settings.agentEnabled, mode: this.settings.mode || 'embedded' };
    return this.starting ? { ...state, starting: true } : state;
  }

  async call(method: string, args: Record<string, unknown> = {}, fromAgent = false): Promise<unknown> {
    if (this.disposed) throw new Error('O Tabyra App está encerrando.');
    if (fromAgent && !this.settings.agentEnabled) throw new Error('Controle da IA pausado no Tabyra App. Retome pelo botão do painel.');
    if (method === 'tabs') {
      if (this.controller) return this.controller.call(method, args, fromAgent);
      if (!this.starting) void this.open().catch(error => this.emit('notice', { text: String(error.message || error) }));
      return this.state();
    }
    if (method === 'resize' && !fromAgent) {
      this.viewport = args;
      if (!this.controller?.running) return this.controller ? this.controller.call('resize', args) : { deferred: true };
    }
    if (method === 'selection' && !this.controller?.running && !fromAgent) return { text: '' };
    if (method === 'agent' && !fromAgent) {
      const enabled = args.enabled === true;
      await this.controller?.call('agent', { enabled });
      this.settings.agentEnabled = enabled;
      await this.save();
      return this.state();
    }
    const generation = this.generation;
    this.activeCalls++;
    try {
      const controller = await this.open();
      if (generation !== this.generation || this.disposed) throw new Error('A operação foi cancelada pelo encerramento do navegador.');
      const result = await controller.call(method, args, fromAgent);
      if (method === 'browser_mode' && !fromAgent) { this.settings.mode = args.mode as BrowserMode; await this.save(); }
      if (method === 'chrome_open' && args.connect === true && !fromAgent) { this.settings.mode='chrome'; await this.save(); }
      if (method === 'chrome_manual' && !fromAgent) { this.settings.agentEnabled = (await controller.state()).agentEnabled; await this.save(); }
      if (!(method === 'input' && args.kind === 'mouse' && args.phase === 'move')) this.nextCaptureAt = 0;
      if (method === 'close_tab' && !(await controller.state()).tabs.length) {
        await this.stop(false);
        return this.state();
      }
      return result;
    } finally { this.activeCalls--; this.scheduleIdle(); }
  }

  async toggleEconomy() {
    this.settings.economy = !this.settings.economy;
    this.nextCaptureAt = 0;
    await this.save();
    return this.preferences();
  }

  async poll(after: number, wantsFrame: boolean, signature?: string) {
    if (wantsFrame) this.scheduleIdle();
    const state = await this.state();
    let frame: typeof this.frame;
    if (wantsFrame && state.running && state.tabs.some(tab => tab.id === state.activeId && tab.url !== 'about:blank')) {
      if (this.capturing) frame = await this.capturing;
      else if (Date.now() >= this.nextCaptureAt) {
        this.nextCaptureAt = Date.now() + (this.settings.economy ? 1000 : 300);
        this.capturing = (async () => {
          try {
            const image = await this.controller!.capture(this.settings.economy ? 65 : 80);
            this.frame = { ...image, signature: createHash('sha256').update(`${image.width}:${image.height}:${image.data}`).digest('hex') };
          } catch { /* Navigation can invalidate a screenshot. Retry on the next poll. */ }
          return this.frame;
        })();
        try { frame = await this.capturing; } finally { this.capturing = undefined; }
      } else frame = this.frame;
    }
    return { state, preferences: this.preferences(), sequence: this.sequence,
      messages: this.messages.filter(message => message.sequence > after),
      ...(frame && frame.signature !== signature ? { frame } : {}) };
  }

  async stop(pause = true) {
    if (this.closing) return this.closing;
    this.generation++;
    clearTimeout(this.idleTimer);
    if (pause) {
      this.settings.agentEnabled = false;
      void this.controller?.call('agent', { enabled: false }).catch(() => {});
    }
    this.closing = (async () => {
      const saved = pause ? this.save() : Promise.resolve();
      if (this.starting) await this.starting.catch(() => {});
      const controller = this.controller;
      this.controller = undefined;
      await controller?.close();
      await this.capturing?.catch(() => {});
      this.frame = undefined;
      this.messages = [];
      await saved;
    })();
    try { await this.closing; } finally { this.closing = undefined; }
  }

  private scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (this.disposed || this.closing || !this.controller?.running || this.settings.mode === 'chrome') return;
    this.idleTimer = setTimeout(() => { void (async () => {
      if (this.activeCalls || this.starting) { this.scheduleIdle(); return; }
      const state = await this.state();
      if (state.tabs.every(tab => tab.url === 'about:blank')) {
        await this.stop(false);
        this.emit('notice', { text: 'Navegador em branco encerrado por inatividade para liberar memória. Abra uma página para retomar.' });
      }
    })().catch(() => {}); }, this.blankIdleMs);
    this.idleTimer.unref();
  }

  async dispose() {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    await this.stop(false);
    await this.saving;
  }
}

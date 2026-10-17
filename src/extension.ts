import * as vscode from 'vscode';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, cp } from 'node:fs/promises';
import { BrowserClient } from './client';
import { normalizeUrl } from './url';
import type { BrowserOptions } from './core';
import { browserTools } from './tools';
import { Launcher } from './launcher';

let session: Session | undefined;
let opening: Promise<void> | undefined;
let ending: Promise<void> | undefined;
let output: vscode.OutputChannel;
let launcher: Launcher | undefined;

class Session {
  private closing?: Promise<void>;
  panel: vscode.WebviewPanel;
  controller: BrowserClient;
  private started = false;
  private options: BrowserOptions;
  private timer?: NodeJS.Timeout;
  private capturing = false;
  private stopped = false;
  private updating = false;
  private updateAgain = false;
  private bridgeFile: string;
  private lastState = '';
  private failures = 0;
  private initialSize?: Record<string, unknown>;
  private nextFrameAt = 0;
  private lastFrame = '';
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('elektron');
    const workspace = vscode.workspace.workspaceFolders?.map(f => f.uri.toString()).join('|') || 'default';
    const scope = createHash('sha256').update(workspace).digest('hex').slice(0, 16);
    this.bridgeFile = path.join(context.globalStorageUri.fsPath, 'sessions', `${scope}.json`);
    this.options = {
      profileDir: path.join(context.globalStorageUri.fsPath, 'profiles', scope),
      executablePath: config.get<string>('executablePath') || undefined,
      startPage: config.get<string>('startPage', 'about:blank'),
      mode: context.globalState.get('browserMode', 'embedded'), chromeExtensionDir: vscode.Uri.joinPath(context.globalStorageUri, 'chrome-extension').fsPath
    };
    this.controller = new BrowserClient(vscode.Uri.joinPath(context.extensionUri, 'dist', 'worker.cjs').fsPath, line => output.appendLine(line));
    this.panel = vscode.window.createWebviewPanel('elektron.browser', 'Tabyra Browser', vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    });
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');
    this.disposables.push(this.panel.onDidDispose(() => { void this.close(); }));
    this.disposables.push(this.panel.onDidChangeViewState(() => { if (this.panel.visible) void this.sendState(); }));
    this.disposables.push(this.panel.webview.onDidReceiveMessage(message => { void this.message(message); }));
    this.controller.on('changed', () => { void this.sendState(); });
    this.controller.on('notice', message => { void this.post({ type: 'notice', text: message }); });
    this.controller.on('activity', activity => { void this.post({ type: 'activity', activity }); });
  }

  async start() {
    await cp(vscode.Uri.joinPath(this.context.extensionUri, 'chrome-extension').fsPath, this.options.chromeExtensionDir!, { recursive: true });
    const webview = this.panel.webview;
    const nonce = randomBytes(16).toString('hex');
    const html = await readFile(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'browser.html').fsPath, 'utf8');
    webview.html = html.replaceAll('{{nonce}}', nonce)
      .replaceAll('{{csp}}', webview.cspSource)
      .replaceAll('{{style}}', webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'browser.css')).toString())
      .replaceAll('{{script}}', webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'browser.js')).toString());
    await this.controller.start(this.options, this.bridgeFile);
    if (this.stopped) { await this.controller.close(); return; }
    this.started = true;
    if (this.initialSize) await this.controller.call('resize', this.initialSize);
    await this.sendState();
    await this.sendPreferences();
    await this.frame(true);
    this.timer = setInterval(() => { void this.frame(); }, 100);
    output.appendLine('Navegador iniciado. Perfil isolado por workspace; ponte somente em loopback.');
  }

  async copyConfig() {
    if (!this.started) throw new Error('O navegador ainda está iniciando.');
    const antigravity = vscode.env.appName.toLowerCase().includes('antigravity');
    const base = {
      command: process.execPath,
      args: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'mcp.cjs').fsPath, this.bridgeFile],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    };
    const mcpConfig = antigravity ? {
      mcpServers: {
        'elektron-browser': {
          ...base,
          // Antigravity supports per-tool eager loading. Do not depend on a lazy
          // dispatcher being discoverable in an already-running conversation.
          tools: Object.fromEntries(browserTools.map(tool => [tool.name, { eager: true }]))
        }
      }
    } : { servers: { 'elektron-browser': { type: 'stdio', ...base } } };
    await vscode.env.clipboard.writeText(JSON.stringify(mcpConfig, null, 2));
    await this.post({ type: 'copied' });
    void vscode.window.showInformationMessage(antigravity
      ? 'Configuração MCP copiada. No Antigravity: MCP Servers → Manage MCP Servers → View raw config. Mescle a entrada elektron-browser.'
      : 'Configuração MCP copiada. Mescle servers.elektron-browser em .vscode/mcp.json e inicie o servidor pelo comando MCP: List Servers.');
  }

  private async post(value: unknown) {
    if (!this.stopped) await this.panel.webview.postMessage(value);
  }
  async showConnection() { await this.post({ type: 'connection' }); }
  private async sendPreferences() {
    await this.post({ type: 'host', kind: vscode.env.appName.toLowerCase().includes('antigravity') ? 'antigravity' : 'vscode' });
    await this.post({ type: 'preferences', economy: this.context.globalState.get('economy', false) });
  }
  private async sendState() {
    if (this.stopped || !this.started) return;
    if (this.updating) { this.updateAgain = true; return; }
    this.updating = true;
    try {
      do {
        this.updateAgain = false;
        const state = await this.controller.state();
        launcher?.update(state);
        const serialized = JSON.stringify(state);
        if (serialized !== this.lastState) {
          this.lastState = serialized;
          await this.post({ type: 'state', state });
        }
      } while (this.updateAgain && !this.stopped);
    } catch (error) { output.appendLine(`Estado: ${String(error)}`); }
    finally { this.updating = false; }
  }
  private async frame(force = false) {
    if (this.stopped || !this.panel.visible || this.capturing) return;
    if (!force && Date.now() < this.nextFrameAt) return;
    const economy = this.context.globalState.get('economy', false);
    const interval = economy ? 1000 : Math.max(100, Math.min(2000, vscode.workspace.getConfiguration('elektron').get<number>('captureIntervalMs', 250)));
    this.nextFrameAt = Date.now() + interval;
    this.capturing = true;
    try {
      const frame = await this.controller.capture(economy ? 65 : vscode.workspace.getConfiguration('elektron').get<number>('imageQuality', 80));
      this.failures = 0;
      const signature = `${frame.width}:${frame.height}:${frame.data}`;
      if (signature !== this.lastFrame) { this.lastFrame = signature; await this.post({ type: 'frame', ...frame }); }
    } catch (error) {
      // Navigation and closing a tab can invalidate an in-flight screenshot.
      if (++this.failures === 8) {
        await this.post({ type: 'notice', text: 'A imagem não está disponível. Confira a aba ou abra uma nova. Detalhes em Saída → Tabyra Browser.' });
        output.appendLine(`Captura: ${String(error)}`);
      }
    } finally { this.capturing = false; }
  }

  private async message(message: unknown) {
    if (this.stopped || !message || typeof message !== 'object') return;
    const msg = message as { type: string; method?: string; args?: Record<string, unknown> };
    try {
      if (!this.started) {
        if (msg.type === 'action' && msg.method === 'resize') this.initialSize = msg.args;
        return;
      }
      if (msg.type === 'ready') {
        this.lastState = '';
        this.lastFrame = '';
        await this.sendState(); await this.sendPreferences(); await this.frame(true);
      } else if (msg.type === 'mcp') { await this.copyConfig(); }
      else if (msg.type === 'chrome-guide') { await this.post({ type: 'chrome_connection', ...await this.controller.call('chrome_connection') as object }); }
      else if (msg.type === 'chrome-copy') {
        const info = await this.controller.call('chrome_connection') as { code?: string; extensionDir?: string };
        const kind = (msg as unknown as { kind: string }).kind;
        const text = kind === 'code' ? info.code : info.extensionDir;
        if (!text) throw new Error('Selecione Chrome conectado primeiro.');
        await vscode.env.clipboard.writeText(text); await this.post({ type: 'chrome_copied', kind });
      }
      else if (msg.type === 'economy') {
        await this.context.globalState.update('economy', !this.context.globalState.get('economy', false));
        await this.sendPreferences(); await this.frame(true);
      }
      else if (msg.type === 'external') {
        const state = await this.controller.state();
        const url = state.tabs.find(t => t.id === state.activeId)?.url;
        if (url && url !== 'about:blank') await vscode.env.openExternal(vscode.Uri.parse(normalizeUrl(url)));
      } else if (msg.type === 'copy') {
        const result = await this.controller.call('selection') as { text: string };
        if (result.text) await vscode.env.clipboard.writeText(result.text);
      } else if (msg.type === 'action' && typeof msg.method === 'string') {
        const allowed = ['new_tab', 'switch_tab', 'close_tab', 'navigate', 'back', 'forward', 'reload', 'resize', 'input', 'agent', 'cancel', 'browser_mode', 'chrome_manual', 'chrome_open'];
        if (!allowed.includes(msg.method)) return;
        await this.controller.call(msg.method, msg.args || {});
        if (msg.method === 'chrome_open') await this.post({ type: 'chrome_opened' });
        if (msg.method === 'browser_mode') await this.context.globalState.update('browserMode', msg.args?.mode);
        if (msg.method === 'chrome_open' && msg.args?.connect === true) await this.context.globalState.update('browserMode','chrome');
        if (msg.method === 'input') {
          if (!(msg.args?.kind === 'mouse' && msg.args?.phase === 'move')) await this.frame(true);
          return;
        }
        await this.sendState();
        await this.frame(true);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      output.appendLine(text);
      await this.post({ type: 'error', text });
      await this.sendState();
    }
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (session === this) session = undefined;
    launcher?.update();
    this.disposables.forEach(d => d.dispose());
    this.panel.dispose();
    this.closing = this.controller.close().then(() => { output.appendLine('Navegador e ponte MCP encerrados.'); });
    ending = this.closing;
    void this.closing.finally(() => { if (ending === this.closing) ending = undefined; }).catch(() => {});
    return this.closing;
  }
}

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('Tabyra Browser');
  context.subscriptions.push(output);
  launcher = new Launcher();
  const launchView = vscode.window.createTreeView('elektron.launcher', { treeDataProvider: launcher, showCollapseAll: false });
  launchView.message = 'Navegue e trabalhe com sua IA na mesma página.';
  context.subscriptions.push(launcher, launchView);
  const open = async () => {
    if (ending) await ending;
    if (opening) return opening;
    if (session) { session.panel.reveal(); return; }
    opening = (async () => {
      const created = new Session(context);
      session = created;
      try { await created.start(); }
      catch (error) {
        await created.close();
        output.appendLine(String(error));
        output.show(true);
        void vscode.window.showErrorMessage(`Tabyra: ${error instanceof Error ? error.message : error}`);
      }
    })();
    try { await opening; } finally { opening = undefined; }
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('elektron.open', open),
    vscode.commands.registerCommand('elektron.copyMcpConfig', async () => { await open(); await session?.copyConfig(); }),
    vscode.commands.registerCommand('elektron.stop', async () => { await session?.close(); }),
    vscode.commands.registerCommand('elektron.newTab', async () => { await open(); await session?.controller.call('new_tab'); }),
    vscode.commands.registerCommand('elektron.connect', async () => { await open(); await session?.showConnection(); }),
    vscode.commands.registerCommand('elektron.selectTab', async (tabId: string) => { await open(); await session?.controller.call('switch_tab', { tabId }); }),
    vscode.commands.registerCommand('elektron.toggleAgent', async () => {
      await open();
      const state = await session?.controller.state();
      if (state) await session?.controller.call('agent', { enabled: !state.agentEnabled });
    }),
    vscode.commands.registerCommand('elektron.settings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:gabrielyogi.elektron-browser'))
  );
}

export async function deactivate() { await session?.close(); }

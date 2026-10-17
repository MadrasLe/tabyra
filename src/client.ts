import { EventEmitter } from 'node:events';
import { fork, execFile, type ChildProcess } from 'node:child_process';
import type { BrowserOptions, BrowserState } from './core';

/** Keep Playwright and its dependency globals out of the IDE's extension host. */
export class BrowserClient extends EventEmitter {
  private child?: ChildProcess;
  private nextId = 0;
  private stopping = false;
  private starting?: Promise<void>;
  private closing?: Promise<void>;
  private externalChrome = false;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  constructor(private workerPath: string, private log: (line: string) => void) { super(); }

  start(options: BrowserOptions, discoveryFile: string): Promise<void> {
    this.externalChrome ||= options.mode === 'chrome';
    if (this.stopping) return Promise.reject(new Error('O processo do navegador está encerrando.'));
    if (this.starting) return this.starting;
    if (this.child?.connected) return Promise.resolve();
    this.starting = this.launch(options, discoveryFile).finally(() => { this.starting = undefined; });
    return this.starting;
  }

  private async launch(options: BrowserOptions, discoveryFile: string) {
    this.child = fork(this.workerPath, [], {
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true
    });
    this.child.stdout?.on('data', data => this.log(data.toString()));
    this.child.stderr?.on('data', data => this.log(data.toString()));
    this.child.on('message', (message: any) => {
      if (message.event) { this.emit(message.event, message.data); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result);
    });
    const rejectAll = (error: Error) => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
      this.pending.clear();
    };
    this.child.on('error', rejectAll);
    this.child.on('exit', code => {
      this.child = undefined;
      rejectAll(new Error(`Processo do navegador encerrado (${code}).`));
      if (!this.stopping) this.emit('notice', 'O processo do navegador encerrou. Reabra o Tabyra.');
    });
    try { await this.request('start', { options, discoveryFile }); }
    catch (error) { await this.close(); throw error; }
  }

  private request<T = unknown>(method: string, args: Record<string, unknown> = {}, timeout = 40000): Promise<T> {
    if (!this.child?.connected) return Promise.reject(new Error('Processo do navegador não está conectado.'));
    const child = this.child;
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('O navegador não respondeu no prazo.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      child.send({ id, method, args }, error => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
      });
    });
  }
  state() { return this.request<BrowserState>('state'); }
  capture(quality = 80) { return this.request<{ data: string; width: number; height: number }>('capture', { quality }); }
  call(method: string, args: Record<string, unknown> = {}) {
    this.externalChrome ||= method === 'chrome_open' || method === 'browser_mode' && args.mode === 'chrome';
    return this.request('call', { method, args }, method === 'evaluate' ? Math.min(130000, Math.max(40000, Number(args.timeoutMs || 5000)+5000)) : 40000);
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopping = true;
    const child = this.child;
    this.closing = (async () => {
      if (!child) return;
      if (child.connected) await this.request('close', {}, 10000).catch(error => this.log(String(error)));
      const waitForExit = async (milliseconds: number) => {
        if (child.exitCode !== null || child.signalCode !== null) return true;
        return new Promise<boolean>(resolve => {
          const finish = () => { clearTimeout(timer); child.off('exit', exited); resolve(child.exitCode !== null || child.signalCode !== null); };
          const exited = () => finish();
          const timer = setTimeout(finish, milliseconds);
          child.once('exit', exited);
        });
      };
      if (!(await waitForExit(2000)) && child.exitCode === null && child.signalCode === null) {
        // Fallback is scoped to this owned child and its descendants only.
        if (process.platform === 'win32' && child.pid) {
          const killArgs = ['/PID', String(child.pid), ...(this.externalChrome ? [] : ['/T']), '/F'];
          await new Promise<void>(resolve => execFile('taskkill.exe', killArgs, { windowsHide: true, timeout: 5000 }, error => {
            if (error && child.exitCode === null && child.signalCode === null) this.log(`Encerramento do processo: ${error.message}`);
            resolve();
          }));
        } else child.kill('SIGKILL');
        if (!(await waitForExit(5000))) throw new Error('O processo do navegador não confirmou encerramento.');
      }
    })().finally(() => { this.removeAllListeners(); });
    return this.closing;
  }
}

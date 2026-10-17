import type { BrowserContext, CDPSession, Page } from 'playwright-core';
import { randomBytes } from 'node:crypto';

// Track resources in this isolated world, without changing the site's APIs.
function managedExecution(operation: Function, argument: unknown, key: string) {
  const scope = globalThis as any;
  let active = true, rejectCancellation: (error: Error) => void;
  const timers = new Set<number>(), intervals = new Set<number>(), frames = new Set<number>();
  const requests: {controller: AbortController; signal?: AbortSignal | null; abort: () => void}[] = [];
  const listeners: { target: EventTarget; type: string; callback: any; wrapped: EventListener; options: any }[] = [];
  const original = { setTimeout:scope.setTimeout, setInterval:scope.setInterval, requestAnimationFrame:scope.requestAnimationFrame, fetch:scope.fetch,
    add:EventTarget.prototype.addEventListener, remove:EventTarget.prototype.removeEventListener };
  const cancelled = new Promise<never>((_, reject) => { rejectCancellation = reject; });
  const check = () => { if (!active) throw new Error('Execução encerrada.'); };
  scope.setTimeout = (callback: Function, delay?: number, ...args: any[]) => {
    check(); if (typeof callback !== 'function') throw new Error('Use função em setTimeout.');
    const id = original.setTimeout.call(scope,() => { timers.delete(id); if (active) callback(...args); }, delay); timers.add(id); return id;
  };
  scope.setInterval = (callback: Function, delay?: number, ...args: any[]) => {
    check(); if (typeof callback !== 'function') throw new Error('Use função em setInterval.');
    const id = original.setInterval.call(scope,() => { if (active) callback(...args); }, delay); intervals.add(id); return id;
  };
  scope.requestAnimationFrame = (callback: FrameRequestCallback) => {
    check(); const id = original.requestAnimationFrame.call(scope,(time: number) => { frames.delete(id); if (active) callback(time); }); frames.add(id); return id;
  };
  EventTarget.prototype.addEventListener = function(type: string, callback: any, options?: any) {
    check(); if (!callback) return;
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    if (listeners.some(item=>item.target===this && item.type===type && item.callback===callback && (typeof item.options==='boolean' ? item.options : !!item.options?.capture)===capture)) return;
    const wrapped: EventListener = event => { if (active) typeof callback === 'function' ? callback.call(this, event) : callback.handleEvent(event); };
    listeners.push({target:this,type,callback,wrapped,options}); original.add.call(this,type,wrapped,options);
  };
  EventTarget.prototype.removeEventListener = function(type: string, callback: any, options?: any) {
    const capture=typeof options==='boolean' ? options : !!options?.capture;
    for (let i=listeners.length-1;i>=0;i--) {
      const item=listeners[i];
      if (item.target===this && item.type===type && item.callback===callback && (typeof item.options==='boolean' ? item.options : !!item.options?.capture)===capture) {original.remove.call(this,type,item.wrapped,options);listeners.splice(i,1);return;}
    }
    original.remove.call(this,type,callback,options);
  };
  scope.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    check(); const controller = new AbortController();
    const signal = init?.signal || (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort();
    requests.push({controller,signal,abort});
    if (signal?.aborted) abort(); else if (signal) original.add.call(signal,'abort',abort,{once:true});
    return original.fetch.call(scope,input,{...init,signal:controller.signal});
  };
  const cleanup = () => {
    if (!active) return; active = false;
    for (const id of timers) clearTimeout(id); for (const id of intervals) clearInterval(id); for (const id of frames) cancelAnimationFrame(id);
    for (const {controller,signal,abort} of requests) {controller.abort();if(signal)original.remove.call(signal,'abort',abort);}
    for (const {target,type,wrapped,options} of listeners) original.remove.call(target,type,wrapped,options);
    Object.assign(scope,{setTimeout:original.setTimeout,setInterval:original.setInterval,requestAnimationFrame:original.requestAnimationFrame,fetch:original.fetch});
    EventTarget.prototype.addEventListener = original.add; EventTarget.prototype.removeEventListener=original.remove; delete scope[key];
  };
  scope[key] = () => { cleanup(); rejectCancellation(new Error('Execução interrompida.')); };
  const tracked = {setTimeout:scope.setTimeout,setInterval:scope.setInterval,requestAnimationFrame:scope.requestAnimationFrame,fetch:scope.fetch};
  const guardedWindow = new Proxy(scope,{get(target,property) {
    if (property === 'window' || property === 'self' || property === 'globalThis') return guardedWindow;
    if (Object.prototype.hasOwnProperty.call(tracked,property)) return tracked[property as keyof typeof tracked];
    const value = Reflect.get(target,property,target); return typeof value === 'function' && !('prototype' in value) ? value.bind(target) : value;
  }});
  return Promise.race([Promise.resolve().then(() => {
    return operation({...tracked,window:guardedWindow},argument);
  }),cancelled]).then(value => {
    const json = JSON.stringify(value === undefined ? null : value);
    if (json === undefined) throw new Error('A automação deve retornar um valor JSON.');
    if (json.length > 64000) throw new Error('Resultado excedeu 64.000 caracteres; retorne menos dados.');
    return json;
  }).finally(cleanup);
}

/** A deadline ends this operation; it never closes the user's browser tab. */
export async function evaluateInPage(context: BrowserContext, page: Page, args: Record<string, unknown>, signal: AbortSignal) {
  if (typeof args.script !== 'string' || !args.script.trim() || args.script.length > 20000) throw new Error('script deve ser uma função JavaScript com até 20.000 caracteres.');
  const timeout = args.timeoutMs ?? 5000;
  if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 100 || timeout > 120000) throw new Error('timeoutMs deve ser um inteiro entre 100 e 120.000 ms.');
  const argument = JSON.stringify(args.argument ?? null);
  if (argument === undefined || argument.length > 32000) throw new Error('argument deve ser JSON com até 32.000 caracteres.');
  const key = '__elektron_run_' + randomBytes(12).toString('hex');
  let cdp: CDPSession | undefined, contextId: number | undefined, watchdog: NodeJS.Timeout | undefined;
  let timedOut = false, running = false, finished = false, cancelled = signal.aborted;
  let abort = () => {};
  const bounded = async (operation: Promise<unknown>) => {
    let timer: NodeJS.Timeout | undefined, completed=false;
    try { await Promise.race([operation.then(()=>{completed=true;}).catch(() => {}),new Promise(resolve => {timer=setTimeout(resolve,750);})]);return completed; }
    finally {clearTimeout(timer);}
  };
  const operation = async () => {
    cdp = await context.newCDPSession(page);
    if (finished) throw new Error('Execução encerrada.');
    const {frameTree} = await cdp.send('Page.getFrameTree');
    if (finished) throw new Error('Execução encerrada.');
    const world = await cdp.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'elektron-automation',grantUniveralAccess:false});
    contextId = world.executionContextId;
    if (finished) throw new Error('Execução encerrada.');
    running = true;
    const invoke = `(api, argument) => { const {setTimeout,setInterval,requestAnimationFrame,fetch} = api; const window=api.window, globalThis=window, self=window; const operation=(${args.script}\n); if(typeof operation!=='function') throw new Error('script deve ser uma função JavaScript.'); return operation(argument); }`;
    const result = await cdp.send('Runtime.evaluate',{expression:`(${managedExecution.toString()})(${invoke},${argument},${JSON.stringify(key)})`,contextId,awaitPromise:true,returnByValue:true,timeout,silent:true,allowUnsafeEvalBlockedByCSP:false});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Erro na automação JavaScript.');
    if (typeof result.result.value !== 'string') throw new Error('A automação não retornou JSON.');
    return {value:JSON.parse(result.result.value),url:page.url()};
  };
  try {
    const deadline = new Promise<never>((_,reject) => {
      abort = () => {cancelled=true;reject(new Error('Execução interrompida pelo painel.'));};
      signal.addEventListener('abort',abort,{once:true});
      if (cancelled) {abort();return;}
      watchdog = setTimeout(() => {timedOut=true;reject(new Error('Prazo da operação excedido.'));},timeout);
    });
    const execution=operation().finally(()=>{if(finished&&cdp)void cdp.detach().catch(()=>{});});
    return await Promise.race([execution,deadline]);
  } catch(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/execution.*timed out|execution.*terminated/i.test(message)) timedOut=true;
    if (cancelled || timedOut) throw new Error(cancelled ? 'JavaScript interrompido pelo painel. A aba e seus dados foram preservados; confira o resultado antes de repetir.' : `JavaScript excedeu ${timeout} ms. A aba foi preservada. Ajuste timeoutMs (até 120.000) se a operação precisar de mais tempo, ou acompanhe trabalhos longos com consultas curtas. Confira o resultado antes de repetir.`);
    throw error;
  } finally {
    finished=true; clearTimeout(watchdog);signal.removeEventListener('abort',abort);
    if (cdp && contextId !== undefined) {
      const cleanup = () => cdp!.send('Runtime.evaluate',{expression:`globalThis[${JSON.stringify(key)}]?.()`,contextId,returnByValue:true,silent:true,timeout:500});
      // Cooperative cancellation is sufficient for an asynchronous wait. Only
      // use runtime termination if a blocked renderer cannot execute cleanup.
      const cleaned = await bounded(cleanup());
      if (!cleaned && running && (timedOut || cancelled)) {await bounded(cdp.send('Runtime.terminateExecution'));await bounded(cleanup());}
    }
    if (cdp) void cdp.detach().catch(() => {});
  }
}

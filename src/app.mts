import { SidecarApp, Response } from 'sidecar_sdk';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startBridge } from './core.js';
import { AppSession } from './app-session.js';
import { acquireInstance, AlreadyRunningError } from './instance.js';
import { watchHostLifetime } from './host-lifecycle.js';

async function main() {
  if (!process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN) throw new Error('Inicie o Tabyra pelo Antigravity App: falta o token seguro do painel.');
  const dataDir = process.env.ELEKTRON_APP_DATA_DIR;
  if (!dataDir) throw new Error('Instale o plugin com scripts/install-app.mjs antes de abrir.');
  // A restarting Windows host can need a moment to release its previous shim.
  const owner = await acquireInstance(dataDir, 8000);
  let closing: Promise<void> | undefined;
  let session: AppSession | undefined;
  let bridge: Awaited<ReturnType<typeof startBridge>> | undefined;
  let app: SidecarApp | undefined;
  let uiServer: Awaited<ReturnType<SidecarApp['run']>> | undefined;
  let stopWatching: (() => void) | undefined;
  const close = () => closing ??= (async () => {
    stopWatching?.();
    // Stop accepting UI calls before disposing the shared session.
    const uiClosed = app?.close();
    uiServer?.closeAllConnections();
    try { await Promise.all([bridge?.close(), session?.dispose(), uiClosed]); }
    finally { await owner.close(); }
  })();
  try {
  const mediaDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'media');
  const requestedIdle = Number(process.env.ELEKTRON_BLANK_IDLE_MS);
  session = new AppSession(dataDir, process.env.ELEKTRON_BROWSER_EXECUTABLE, Number.isFinite(requestedIdle) && requestedIdle >= 1000 ? requestedIdle : 60000, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'chrome-extension'));
  await session.initialize();
  app = new SidecarApp();
  bridge = await startBridge(session, path.join(dataDir, 'session.json'));
  const nonce = randomBytes(16).toString('hex');
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const page = (body: string, contentType: string) => new Response(body, { contentType, headers });
  app.page('/', async () => {
    let html = await readFile(path.join(mediaDir, 'browser.html'), 'utf8');
    html = html.replaceAll('{{nonce}}', nonce).replaceAll('{{csp}}', "'self'").replaceAll('{{style}}', '/browser.css').replaceAll('{{script}}', '/browser.js');
    html = html.replace("default-src 'none';", "default-src 'none'; connect-src 'self';")
      .replace('</head>', `<link rel="stylesheet" href="/app.css"><script nonce="${nonce}" src="/app-guard.js"></script><script nonce="${nonce}" src="/preload.js"></script><script nonce="${nonce}" src="/app-bridge.js"></script></head>`)
      .replace('<button id="new-tab"', '<button id="stop-browser" class="icon" title="Encerrar navegador e liberar memória" aria-label="Encerrar navegador"><svg viewBox="0 0 24 24"><path d="M12 3v9M7.2 5.6a8 8 0 1 0 9.6 0"/></svg></button><button id="new-tab"');
    return page(html, 'text/html; charset=utf-8');
  });
  for (const file of ['browser.css', 'browser.js', 'app.css', 'app-guard.js', 'app-bridge.js']) {
    app.page('/' + file, async () => {
      let content = await readFile(path.join(mediaDir, file), 'utf8');
      // Keep our palette private: the host also defines --border and --muted.
      if (file === 'browser.css') content = content.replace(/--(bg|fg|muted|border|hover|input|accent|on-accent|blue|green)\b/g, '--elektron-$1');
      return page(content, file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
    });
  }
  const browser = session;
  app.api('/api/open', async () => { await browser.open(); return { opened: true }; });
  app.api('/api/poll', data => browser.poll(Number.isFinite(data.after) ? data.after : 0, data.frame === true, typeof data.signature === 'string' ? data.signature : undefined));
  app.api('/api/preferences', () => browser.toggleEconomy());
  app.api('/api/stop', async () => { await browser.stop(); return { stopped: true }; });
  app.api('/api/selection', () => browser.call('selection'));
  app.api('/api/chrome', () => browser.call('chrome_connection'));
  app.api('/api/action', data => {
    const allowed = ['new_tab', 'switch_tab', 'close_tab', 'navigate', 'back', 'forward', 'reload', 'resize', 'input', 'agent', 'cancel', 'browser_mode', 'chrome_manual', 'chrome_open'];
    if (!allowed.includes(data.method) || !data.args || typeof data.args !== 'object' || Array.isArray(data.args)) throw new Error('Ação inválida.');
    return browser.call(data.method, data.args);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void close().finally(() => process.exit(0)); });
  process.on('disconnect', () => { void close().finally(() => process.exit(0)); });
  stopWatching = watchHostLifetime(process.env.ANTIGRAVITY_LS_ADDRESS || '', () => {
    process.stderr.write('Tabyra App: host Antigravity encerrado; liberando a sessão.\n');
    void close().finally(() => process.exit(0));
  });
  uiServer = await app.run();
  } catch (error) { await close(); throw error; }
}
main().catch(error => { process.stderr.write(`Tabyra App: ${error.message}\n`); process.exitCode = error instanceof AlreadyRunningError ? 0 : 1; });

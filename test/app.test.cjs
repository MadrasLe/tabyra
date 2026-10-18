const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, readFile, rm, mkdir, cp, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { execFile } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const { findBrowser } = require('../dist/core.cjs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let dir, base, fixture, child, port, client, transport;
let hostServer, hostAddress;
const token = randomBytes(32).toString('hex');
const sdk = path.join(os.homedir(), '.gemini/antigravity/lib/node_modules/sidecar_sdk/register_loader.js');
async function api(route, body = {}, authenticate = true) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticate ? { 'X-Sidecar-Token': token } : {}) }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (authenticate) assert.equal(response.status, 200, result.error);
  return { status: response.status, result };
}
async function tool(method, args = {}) {
  const result = await client.callTool({ name: 'browser_' + method, arguments: args });
  assert.ok(!result.isError, result.content[0]?.text);
  return result.content[0].type === 'text' ? JSON.parse(result.content[0].text) : result.content[0];
}
async function start() {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  let output = '';
  child = spawn(process.execPath, ['--import', pathToFileURL(sdk).href, 'app-plugin/elektron-app/sidecars/browser/elektron.mjs'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELEKTRON_APP_DATA_DIR: dir,
      ANTIGRAVITY_LS_ADDRESS: hostAddress, ANTIGRAVITY_CSRF_TOKEN: 'test-only', ANTIGRAVITY_SIDECAR_UI_TOKEN: token,
      ANTIGRAVITY_SIDECAR_WEB_PORT: String(port), ELEKTRON_BLANK_IDLE_MS: '1500' }
  });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(output);
    try { const response = await fetch(`http://127.0.0.1:${port}/`); await response.text(); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Sidecar não iniciou: ' + output);
}
async function shutdown() {
  if (child && child.exitCode === null) {
    await api('/api/stop').catch(() => {});
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await stopped;
  }
}
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'elektron-app-test-'));
  hostServer = net.createServer(socket => socket.end());
  await new Promise(resolve => hostServer.listen(0, '127.0.0.1', resolve));
  hostAddress = '127.0.0.1:' + hostServer.address().port;
  fixture = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.url === '/cookies') res.end(`<title>Sessão App</title><p>${req.headers.cookie || 'Sem sessão'}</p>`);
    else res.end(`<!doctype html><html lang="pt-BR"><title>Oficina App</title><style>body{font:18px system-ui;padding:30px;background:#f3f5fa}input,button{font:inherit;padding:10px;margin:10px 0}label{display:block}#result{padding:15px;background:white;border-radius:8px}</style><h1>Tabyra sem IDE</h1><p>Uma página real compartilhada com a IA.</p><label for="name">Seu nome</label><input id="name"><button id="hello" onclick="document.getElementById('result').textContent='Olá, '+document.getElementById('name').value">Cumprimentar</button><div id="result"></div><button id="save" onclick="document.cookie='elektronApp=ok; path=/; max-age=600'">Salvar login de teste</button></html>`);
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${fixture.address().port}`;
  await start();
  transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/mcp.cjs'), path.join(dir, 'session.json')], env: { ...process.env, ELEKTRON_MCP_NAME: 'elektron-app' }, stderr: 'pipe' });
  client = new Client({ name: 'elektron-app-test', version: '1.0.0' });
  await client.connect(transport);
});
after(async () => {
  await client?.close();
  await shutdown();
  await new Promise(resolve => hostServer.close(resolve));
  await new Promise(resolve => fixture?.close(resolve));
  await rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
});

test('App starts without Chromium; SDK protects state and MCP bridge rejects browser origins', async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 16);
  assert.ok(tools.every(tool => tool._meta['antigravity/alwaysLoad'] === true));
  assert.equal(client.getServerVersion().name, 'elektron-app');
  assert.equal((await api('/api/poll', { frame: true })).result.state.running, false);
  await api('/api/action', { method: 'resize', args: { width: 820, height: 600 } });
  assert.equal((await api('/api/poll')).result.state.running, false, 'Resizing an idle panel must not launch Chromium');
  assert.equal((await api('/api/poll', {}, false)).status, 401);
  const panelResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(panelResponse.headers.get('referrer-policy'), 'no-referrer');
  const panelSource = await panelResponse.text();
  assert.ok(panelSource.indexOf('/app-guard.js') < panelSource.indexOf('/preload.js'));
  const discovery = JSON.parse(await readFile(path.join(dir, 'session.json'), 'utf8'));
  const response = await fetch(`http://127.0.0.1:${discovery.port}/call`, { method: 'POST', headers: { Authorization: 'Bearer ' + discovery.token, Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'tabs', args: {} }) });
  assert.equal(response.status, 403);
});

test('MCP starts Chromium on demand and acts on the same page returned by the panel', async () => {
  const statusStarted = performance.now();
  const initial = await tool('tabs');
  assert.ok(initial.running || initial.starting);
  assert.ok(performance.now() - statusStarted < 2000, 'Cold startup must not block the status request');
  await tool('navigate', { url: base });
  assert.equal((await tool('tabs')).running, true);
  const snapshot = await tool('snapshot');
  const field = snapshot.elements.find(el => el.name === 'Seu nome');
  assert.ok(field);
  await tool('fill', { ref: field.ref, text: 'Gabriel Yogi' });
  await tool('click', { selector: '#hello' });
  assert.ok((await tool('snapshot')).text.includes('Olá, Gabriel Yogi'));
  assert.deepEqual((await tool('evaluate', { script: '() => ({ text: document.querySelector("#result").textContent, node: typeof process })' })).value,
    { text: 'Olá, Gabriel Yogi', node: 'undefined' });
  const first = (await api('/api/poll', { frame: true })).result;
  assert.equal(first.preferences.economy, true);
  assert.ok(first.messages.some(message => message.type === 'activity' && message.activity.phase === 'target'));
  assert.ok(Buffer.from(first.frame.data, 'base64').length > 5000);
  assert.equal(first.state.tabs[0].url, base + '/');
  const hidden = (await api('/api/poll', { after: first.sequence, frame: false })).result;
  assert.equal(hidden.frame, undefined);
  const same = (await api('/api/poll', { frame: true, signature: first.frame.signature })).result;
  assert.equal(same.frame, undefined);
  await api('/api/action', { method: 'input', args: { kind: 'key', key: 'Tab' } });
  assert.equal((await tool('screenshot')).mimeType, 'image/png');
});

test('the panel displays an active JavaScript operation and cancels it without closing the working page', async()=>{
  const browser=await chromium.launch({executablePath:findBrowser(),headless:true});
  const page=await browser.newPage({viewport:{width:820,height:760}});
  try {
    await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
    await page.locator('#agent').waitFor();
    await page.waitForResponse(response=>response.url().endsWith('/api/poll'));
    const before=await tool('tabs');
    const pending=client.callTool({name:'browser_evaluate',arguments:{script:'async () => await new Promise(()=>{})',timeoutMs:30000}});
    await page.locator('#operation:not(.hidden)').waitFor();
    assert.match(await page.locator('#operation-label').innerText(),/Executando JavaScript/);
    await page.locator('#cancel-operation').click();
    const result=await pending;assert.equal(result.isError,true);assert.match(result.content[0].text,/interrompido pelo painel/);
    assert.deepEqual((await tool('tabs')).tabs,before.tabs);
    assert.equal((await tool('tabs')).agentEnabled,true,'Interrupting an operation must not pause subsequent tools');
    await page.locator('#operation').waitFor({state:'hidden'});
  }finally{await browser.close();}
});

test('concurrent panel opens reuse Chromium and a duplicate App instance cannot replace discovery', async () => {
  await Promise.all(Array.from({ length: 8 }, () => api('/api/open')));
  assert.equal((await tool('tabs')).tabs.length, 1);
  const original = await readFile(path.join(dir, 'session.json'), 'utf8');
  const duplicate = spawn(process.execPath, ['--import', pathToFileURL(sdk).href, 'app-plugin/elektron-app/sidecars/browser/elektron.mjs'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELEKTRON_APP_DATA_DIR: dir, ANTIGRAVITY_LS_ADDRESS: hostAddress, ANTIGRAVITY_CSRF_TOKEN: 'test-only', ANTIGRAVITY_SIDECAR_UI_TOKEN: token, ANTIGRAVITY_SIDECAR_WEB_PORT: String(port) }
  });
  let output = '';
  duplicate.stderr.on('data', data => { output += data; });
  const exit = await new Promise(resolve => duplicate.once('exit', resolve));
  assert.equal(exit, 0, output);
  assert.match(output, /Outra instância/);
  assert.equal(await readFile(path.join(dir, 'session.json'), 'utf8'), original);
  assert.equal((await tool('tabs')).running, true);
});

test('App ignores theme spoofing from a foreign opener and malformed SDK messages', async () => {
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => window.addEventListener('message', event => {
      if (event.data?.type === 'theme-change' && event.data?.payload?.cssVariables?.['--background'] === 'rgb(255, 0, 0)') window.foreignThemeArrived = true;
    }, true));
    const opener = await context.newPage();
    await opener.goto(base);
    const popup = opener.waitForEvent('popup');
    await opener.evaluate(url => { window.victim = window.open(url); }, 'http://127.0.0.1:' + port + '/?token=' + token);
    const panel = await popup;
    const errors = [];
    panel.on('pageerror', reason => errors.push(reason.message));
    await panel.waitForFunction(() => window.sidecar);
    const original = await panel.evaluate(() => document.documentElement.style.getPropertyValue('--background'));
    await opener.evaluate(() => {
      window.victim.postMessage({ type: 'theme-change', payload: { cssVariables: { '--background': 'rgb(255, 0, 0)' } } }, '*');
    });
    await panel.waitForFunction(() => window.foreignThemeArrived);
    assert.equal(await panel.evaluate(() => document.documentElement.style.getPropertyValue('--background')), original);
    await panel.evaluate(() => {
      window.postMessage({ type: 'theme-change', payload: null }, '*');
      window.postMessage({ type: 'theme-change', payload: { cssVariables: { color: 'red' } } }, '*');
      window.postMessage(null, '*');
      window.postMessage({ type: 'theme-change', payload: { cssVariables: { '--security-marker': 'processed' } } }, '*');
    });
    await panel.waitForFunction(() => document.documentElement.style.getPropertyValue('--security-marker') === 'processed');
    assert.deepEqual(errors, []);
    assert.equal(await panel.evaluate(() => document.documentElement.style.color), '');
    await panel.evaluate(() => window.postMessage({
      type: 'theme-change', payload: { cssVariables: { '--background': '#15171e' } }
    }, '*'));
    await panel.waitForFunction(() => document.documentElement.style.getPropertyValue('--background') === '#15171e');
  } finally { await browser.close(); }
});

test('actual App panel renders, types manually, shows agent target, pauses, and follows theme at narrow width', async () => {
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 820, height: 760 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', reason => errors.push(reason.message));
    await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
    await page.locator('#address').waitFor();
    await page.waitForFunction(() => document.getElementById('address').value.startsWith('http://127.0.0.1:'));
    await page.evaluate(() => window.postMessage({ type: 'theme-change', payload: { cssVariables: { '--background': '#15171e', '--foreground': '#e4e8f0', '--muted-foreground': '#a0a8b8', '--border': '#343945', '--card': '#202530', '--muted': '#303848', '--primary': '#a8b7ff' } } }, '*'));
    await page.locator('#address').fill(base);
    await page.locator('#address').press('Enter');
    await page.waitForFunction(() => Math.abs(document.getElementById('screen').width - document.getElementById('viewport').getBoundingClientRect().width) <= 1);
    const snapshot = await tool('snapshot');
    const field = snapshot.elements.find(el => el.name === 'Seu nome');
    const bounds = await page.locator('#screen').boundingBox();
    const size = await page.locator('#screen').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
    await page.mouse.click(bounds.x + (field.bounds.x + 15) * bounds.width / size.width, bounds.y + (field.bounds.y + 15) * bounds.height / size.height);
    const typed = page.waitForResponse(response => response.url().endsWith('/api/action') && response.request().postDataJSON()?.args?.text === 'e');
    await page.keyboard.type('Príncipe');
    await typed;
    await tool('click', { selector: '#hello' });
    const manualResult = await tool('snapshot');
    assert.ok(manualResult.text.includes('Olá, Príncipe'), manualResult.text);
    await tool('fill', { selector: '#name', text: 'Berta e Gabriel' });
    await page.locator('#agent-cursor:not(.hidden)').waitFor();
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/app-panel-dark.png' });
    await page.locator('#mcp').click();
    assert.ok((await page.locator('#connection').textContent()).includes('elektron-app'));
    await page.locator('#close-connection').click();
    await page.locator('#agent').click();
    await page.waitForFunction(() => document.getElementById('agent-label').textContent === 'Retomar IA');
    const blocked = await client.callTool({ name: 'browser_snapshot', arguments: {} });
    assert.equal(blocked.isError, true);
    await page.locator('#agent').click();
    await page.waitForFunction(() => document.getElementById('agent-label').textContent === 'Pausar IA');
    await page.setViewportSize({ width: 390, height: 740 });
    await page.evaluate(() => window.postMessage({ type: 'theme-change', payload: { cssVariables: { '--background': '#fafafa', '--foreground': '#242631', '--muted-foreground': '#747782', '--border': '#e0e1e6', '--card': '#f2f3f7', '--muted': '#eceef3', '--primary': '#6070dd' } } }, '*'));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(250, 250, 250)');
    await page.screenshot({ path: 'output/playwright/app-panel-light-narrow.png' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('shutdown releases Chromium, persists pause, and keeps cookies when the App sidecar restarts', async () => {
  await api('/api/action', { method: 'agent', args: { enabled: true } });
  await tool('navigate', { url: base });
  await tool('click', { selector: '#save' });
  await api('/api/action', { method: 'agent', args: { enabled: false } });
  await shutdown();
  await start();
  assert.equal((await api('/api/poll')).result.state.running, false);
  const blocked = await client.callTool({ name: 'browser_tabs', arguments: {} });
  assert.equal(blocked.isError, true);
  await api('/api/action', { method: 'agent', args: { enabled: true } });
  await tool('navigate', { url: base + '/cookies' });
  assert.ok((await tool('snapshot')).text.includes('elektronApp=ok'));
  await api('/api/stop');
  await api('/api/action', { method: 'resize', args: { width: 390, height: 600 } });
  assert.equal((await api('/api/poll', { frame: true })).result.state.running, false);
});

test('closing the last tab releases Chromium; background blank sessions expire without discarding a real page', async () => {
  await api('/api/action', { method: 'agent', args: { enabled: true } });
  await tool('navigate', { url: base });
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal((await api('/api/poll')).result.state.running, true);
  await tool('close_tab');
  assert.equal((await api('/api/poll')).result.state.running, false);
  await api('/api/open');
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal((await api('/api/poll')).result.state.running, false);
  await api('/api/open');
  assert.equal((await api('/api/poll')).result.state.running, true);
});

test('Chrome setup stays in waiting state and reports launch failures and retry feedback in the App panel', async () => {
  await api('/api/action', { method: 'browser_mode', args: { mode: 'chrome' } });
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
  try {
    const page = await browser.newPage();
    let fail = true;
    await page.route('**/api/action', route => {
      if (route.request().postDataJSON()?.method !== 'chrome_open') return route.continue();
      return route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { error: 'Falha de inicialização de teste' } : { launched: true }) });
    });
    await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
    await page.getByRole('button', { name: 'Chrome…', exact: true }).waitFor();
    await page.waitForResponse(response => response.url().endsWith('/api/poll'));
    assert.match(await page.locator('#starting').innerText(), /Sem copiar códigos/);
    await page.locator('#chrome-settings').click();
    await page.locator('#chrome-install summary').click();
    await page.locator('#chrome-open').click();
    await page.waitForFunction(() => document.getElementById('chrome-feedback').textContent.includes('Falha de inicialização'));
    assert.equal(await page.locator('#chrome-open').isEnabled(), true);
    fail = false;
    await page.locator('#chrome-open').click();
    await page.waitForFunction(() => document.getElementById('chrome-feedback').textContent.includes('Abertura solicitada'));
    assert.equal(await page.locator('#chrome-open').isEnabled(), true);
    assert.equal(await page.locator('#chrome-settings').innerText(), 'Chrome…', 'Starting a process must not claim the Chrome extension is connected');
  } finally { await browser.close(); }
});

test('App panel connects ordinary Chrome, mirrors MCP actions, releases login control and resumes the same tabs', async t => {
  const nativeChrome = process.env.ELEKTRON_TEST_CHROME || path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1155/chrome-win/chrome.exe');
  if (process.platform !== 'win32' || !existsSync(nativeChrome)) { t.skip('Set ELEKTRON_TEST_CHROME to an extension-capable Chromium'); return; }
  const viewer = await chromium.launch({ executablePath: findBrowser(), headless: true });
  const page = await viewer.newPage({ viewport: { width: 820, height: 760 }, reducedMotion: 'reduce' });
  let native;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${port}/?token=${token}`);
    await page.locator('#chrome-settings').click();
    await page.locator('#browser-mode').selectOption('chrome');
    await page.waitForFunction(() => document.getElementById('chrome-setup').classList.contains('hidden') === false);
    const info = (await api('/api/chrome')).result;
    assert.ok(info.code); assert.ok(info.extensionDir.endsWith('chrome-extension'));
    assert.equal((await api('/api/chrome', {}, false)).status, 401);
    assert.equal((await tool('tabs')).running, false);
    const extension = path.join(dir, 'chrome-test-extension');
    await cp('chrome-extension', extension, { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
    manifest.background.service_worker = 'test-worker.js';
    await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(extension, 'test-worker.js'), `importScripts('background.js'); connectPromise.then(() => configure(${info.code}));`);
    native = spawn(nativeChrome, ['--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(dir, 'normal-chrome-profile')}`, `--load-extension=${extension}`, `--disable-extensions-except=${extension}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    await page.waitForFunction(() => document.getElementById('chrome-settings').textContent === 'Chrome ✓', { timeout: 20000 });
    // The state handshake can precede Playwright finishing its page initialization.
    const deadline = Date.now() + 20000;
    while (true) { const result = await client.callTool({ name: 'browser_navigate', arguments: { url: base } }); if (!result.isError) break; if (Date.now() > deadline) throw new Error(result.content[0]?.text); await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.equal((await tool('evaluate', { script: '() => navigator.webdriver' })).value, false);
    await tool('fill', { selector: '#name', text: 'Chrome normal, mesma sessão 💛' });
    await tool('click', { selector: '#hello' });
    assert.ok((await tool('snapshot')).text.includes('Chrome normal, mesma sessão 💛'));
    await tool('evaluate', { script: '() => { document.title = "Chrome conectado · teste concluído"; }' });
    await page.locator('#close-chrome').click();
    await page.waitForFunction(() => document.getElementById('address').value.startsWith('http://127.0.0.1:'));
    await page.getByRole('button', { name: 'Chrome conectado · teste concluído', exact: true }).waitFor();
    await page.waitForFunction(() => document.getElementById('screen').width === 820);
    await page.screenshot({ path: 'output/playwright/chrome-connected-panel.png' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(() => document.getElementById('screen').width === 1280);
    await page.screenshot({ path: 'output/playwright/tabyra-browser-wide.png' });
    const original = await tool('tabs');
    await page.locator('#chrome-settings').click();
    await page.locator('#chrome-manual').click();
    await page.locator('#chrome-login:not(.hidden)').waitFor();
    assert.equal((await client.callTool({ name: 'browser_snapshot', arguments: {} })).isError, true);
    await page.screenshot({ path: 'output/playwright/chrome-manual-login.png' });
    await page.locator('#chrome-resume').click();
    await page.waitForFunction(() => document.getElementById('chrome-login').classList.contains('hidden'));
    const resumed = await tool('tabs'); assert.deepEqual(resumed.tabs.map(tab => tab.id), original.tabs.map(tab => tab.id));
    assert.ok((await tool('snapshot')).text.includes('Chrome normal, mesma sessão 💛'));
    await page.locator('#chrome-settings').click();
    await page.setViewportSize({ width: 390, height: 740 });
    await page.screenshot({ path: 'output/playwright/chrome-guide-narrow.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await api('/api/stop');
    assert.equal(native.exitCode, null, 'Disconnecting the App must leave normal Chrome alive');
  } finally {
    await viewer.close();
    if (native?.exitCode === null && native?.signalCode === null) await new Promise(resolve => execFile('taskkill.exe', ['/PID', String(native.pid), '/T', '/F'], { windowsHide: true }, () => resolve()));
  }
});

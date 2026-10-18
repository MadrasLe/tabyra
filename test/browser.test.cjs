const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { mkdtemp, rm, readFile, mkdir } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { BrowserController, startBridge, findBrowser } = require('../dist/core.cjs');
const { chromium } = require('playwright-core');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { BrowserClient } = require('../dist/client.cjs');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let root, base, fixture, controller, bridge, discoveryFile;
let panelHtml, panelCss, panelJs;
const fixtureHtml = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Oficina Tabyra</title>
<style>body{font:18px system-ui;margin:40px;background:#f5f3ee;color:#202e36}input,button{font:inherit;padding:10px}h1{font-size:36px}#result{padding:20px}a{display:block;margin:25px 0}.spacer{height:1400px}</style>
<h1>Oficina do Gabriel</h1><p>Uma página real de teste, com proteção contra iframe.</p>
<label for="name">Seu nome</label><input id="name" placeholder="Como você se chama?">
<label for="password">Senha</label><input id="password" type="password" value="segredo-nao-expor">
<button id="hello" onclick="document.getElementById('result').textContent='Olá, '+document.getElementById('name').value+'!'">Cumprimentar</button>
<div id="result" role="status"></div><a href="/second">Segunda página</a>
<a href="/popup" target="_blank">Abrir popup</a><button onclick="document.cookie='elektronSession=ok; path=/; max-age=600'">Salvar sessão</button>
<div class="spacer"></div><p>Fim da página</p></html>`;

async function snapshot() { return controller.call('snapshot'); }
async function clickName(name) {
  const current = await snapshot();
  const item = current.elements.find(el => el.name === name);
  assert.ok(item, `Element ${name} exists`);
  await controller.call('click', { ref: item.ref });
}
before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'elektron-test-'));
  panelHtml = (await readFile('media/browser.html', 'utf8')).replaceAll('{{nonce}}', 'test-nonce').replaceAll('{{csp}}', "'self'").replaceAll('{{style}}', '/browser.css').replaceAll('{{script}}', '/browser.js');
  panelCss = await readFile('media/browser.css', 'utf8');
  panelJs = await readFile('media/browser.js', 'utf8');
  fixture = http.createServer((req, res) => {
    if (req.url === '/panel') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(panelHtml); return; }
    if (req.url === '/browser.css') { res.setHeader('Content-Type', 'text/css'); res.end(panelCss); return; }
    if (req.url === '/browser.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(panelJs); return; }
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/second') res.end('<title>Segunda</title><h1>Segunda página</h1><a href="/">Início</a>');
    else if (req.url === '/popup') res.end('<title>Popup</title><h1>Outra aba de verdade</h1>');
    else if (req.url === '/cookies') res.end(`<title>Sessão</title><p>${req.headers.cookie || 'Sem cookie'}</p>`);
    else res.end(fixtureHtml);
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${fixture.address().port}`;
  controller = new BrowserController({ profileDir: path.join(root, 'profile') });
  await controller.start();
  discoveryFile = path.join(root, 'bridge.json');
  bridge = await startBridge(controller, discoveryFile);
});
after(async () => {
  await bridge?.close();
  await controller?.close();
  await new Promise(resolve => fixture.close(resolve));
  await rm(root, { recursive: true, force: true });
});

test('real Chromium loads a frame-blocked page; agent refs click/fill the same DOM', async () => {
  await controller.call('navigate', { url: base });
  const initial = await snapshot();
  assert.equal(initial.title, 'Oficina Tabyra');
  assert.ok(initial.text.includes('Oficina do Gabriel'));
  assert.ok(!JSON.stringify(initial).includes('segredo-nao-expor'));
  const field = initial.elements.find(el => el.name === 'Seu nome');
  await controller.call('fill', { ref: field.ref, text: 'Gabriel Yogi, príncipe' }, true);
  await clickName('Cumprimentar');
  assert.ok((await snapshot()).text.includes('Olá, Gabriel Yogi, príncipe!'));
  const image = await controller.capture();
  assert.ok(Buffer.from(image.data, 'base64').length > 5000);
  const png = await controller.call('screenshot');
  assert.equal(Buffer.from(png.data, 'base64').subarray(1, 4).toString(), 'PNG');
  await mkdir('.test-artifacts', { recursive: true });
  const { writeFile } = require('node:fs/promises');
  await writeFile('.test-artifacts/browser-fixture.png', Buffer.from(png.data, 'base64'));
});

test('manual mouse/keyboard input and MCP share focus and support Unicode', async () => {
  await controller.call('resize', { width: 1200, height: 800 });
  const field = (await snapshot()).elements.find(el => el.name === 'Seu nome');
  const point = { x: field.bounds.x + 20, y: field.bounds.y + 15 };
  await controller.call('input', { kind: 'mouse', phase: 'down', ...point });
  await controller.call('input', { kind: 'mouse', phase: 'up', ...point });
  await controller.call('input', { kind: 'key', key: 'Control+A' });
  await controller.call('input', { kind: 'text', text: 'Berta, açúcar e ação 💛' });
  await controller.call('input', { kind: 'key', key: 'Tab' });
  await clickName('Cumprimentar');
  assert.ok((await snapshot()).text.includes('Olá, Berta, açúcar e ação 💛!'));
  await controller.call('click', { selector: '#name' });
  await controller.call('press', { key: 'Control+A' });
  assert.equal((await controller.call('selection')).text, 'Berta, açúcar e ação 💛');
});

test('navigation invalidates element refs; tabs, popups and history stay synchronized', async () => {
  const firstId = (await controller.state()).activeId;
  const initial = await snapshot();
  const oldRef = initial.elements.find(el => el.name === 'Seu nome').ref;
  await clickName('Segunda página');
  assert.equal((await snapshot()).title, 'Segunda');
  await assert.rejects(controller.call('fill', { ref: oldRef, text: 'stale' }), /Referência expirou/);
  await controller.call('back');
  await controller.call('forward');
  assert.equal((await snapshot()).title, 'Segunda');
  await controller.call('back');
  await clickName('Abrir popup');
  for (let i = 0; i < 30 && (await controller.state()).tabs.length < 2; i++) await new Promise(r => setTimeout(r, 50));
  let state = await controller.state();
  assert.equal(state.tabs.length, 2);
  assert.notEqual(state.activeId, firstId);
  await controller.call('switch_tab', { tabId: firstId });
  assert.equal((await controller.state()).activeId, firstId);
  await controller.call('close_tab', { tabId: state.tabs.find(t => t.id !== firstId).id });
  await controller.call('new_tab', { url: base + '/second' });
  assert.equal((await controller.state()).tabs.length, 2);
  await controller.call('close_tab');
  assert.equal((await controller.state()).activeId, firstId);
});

test('embedded Chromium keeps its process sandbox enabled', async () => {
  const cdp = await controller.context.browser().newBrowserCDPSession();
  try {
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
    const pid = processInfo.find(item => item.type === 'browser')?.id;
    assert.ok(Number.isInteger(pid) && pid > 0);
    const execFile = require('node:util').promisify(require('node:child_process').execFile);
    const command = process.platform === 'win32'
      ? (await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '(Get-CimInstance Win32_Process -Filter "ProcessId = ' + pid + '").CommandLine'], { windowsHide: true })).stdout
      : process.platform === 'linux' ? await readFile('/proc/' + pid + '/cmdline', 'utf8')
      : (await execFile('ps', ['-p', String(pid), '-o', 'command='])).stdout;
    assert.ok(command.length > 0);
    assert.ok(!command.includes('--no-sandbox'), 'Tabyra must preserve Chromium sandboxing');
  } finally { await cdp.detach(); }
});

test('HTTP bridge rejects missing token, browser origins and reserved panel actions', async () => {
  const { port, token } = bridge.discovery;
  const call = (headers, payload) => fetch(`http://127.0.0.1:${port}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  assert.equal((await call({}, { method: 'tabs', args: {} })).status, 403);
  // Node fetch replaces Host with the URL's authority; use HTTP directly to
  // exercise the actual foreign-Host request that a local client can send.
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const request = http.request(`http://127.0.0.1:${port}/call`, {
      method: 'POST', headers: { Host: 'foreign.example', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end(JSON.stringify({ method: 'tabs', args: {} }));
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await call({ Authorization: `Bearer ${token}`, Origin: 'https://evil.example' }, { method: 'tabs', args: {} })).status, 403);
  assert.equal((await call({ Authorization: `Bearer ${token}` }, { method: 'agent', args: { enabled: true } })).status, 400);
  await controller.call('agent', { enabled: false });
  const blocked = await call({ Authorization: `Bearer ${token}` }, { method: 'navigate', args: { url: base } });
  assert.match((await blocked.json()).error, /pausado/);
  // Human input remains available while the agent is paused.
  await controller.call('navigate', { url: base });
  await controller.call('agent', { enabled: true });
  assert.equal((await call({ Authorization: `Bearer ${token}` }, { method: 'tabs', args: {} })).status, 200);
});

test('actual MCP stdio client discovers tools, fills, clicks, receives images and observes pause', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/mcp.cjs'), discoveryFile], stderr: 'pipe' });
  const client = new Client({ name: 'elektron-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 16);
    const call = (name, args = {}) => client.callTool({ name, arguments: args });
    await call('browser_navigate', { url: base });
    const read = JSON.parse((await call('browser_snapshot')).content[0].text);
    const field = read.elements.find(el => el.name === 'Seu nome');
    assert.equal((await call('browser_fill', { ref: field.ref, text: 'Ada e Berta' })).isError, undefined);
    await call('browser_click', { selector: '#hello' });
    const result = JSON.parse((await call('browser_snapshot')).content[0].text);
    assert.ok(result.text.includes('Olá, Ada e Berta!'));
    const image = await call('browser_screenshot');
    assert.equal(image.content[0].type, 'image');
    await controller.call('agent', { enabled: false });
    assert.equal((await call('browser_navigate', { url: base + '/second' })).isError, true);
    await controller.call('agent', { enabled: true });
  } finally { await client.close(); }
});

test('a foreign window cannot spoof the panel state while trusted host messages still work', async () => {
  const viewer = await chromium.launch({ executablePath: findBrowser(), headless: true, chromiumSandbox: true });
  const context = await viewer.newContext();
  const attackerServer = http.createServer((req, res) => res.end('<!doctype html><title>Foreign window</title>'));
  await new Promise(resolve => attackerServer.listen(0, '127.0.0.1', resolve));
  try {
    await context.addInitScript(() => {
      window.acquireVsCodeApi = () => ({ postMessage(message) { if (message.type === 'ready') window.panelReady = true; } });
    });
    const attacker = await context.newPage();
    await attacker.goto('http://127.0.0.1:' + attackerServer.address().port);
    const popup = attacker.waitForEvent('popup');
    await attacker.evaluate(url => { window.victim = window.open(url); }, base + '/panel');
    const panel = await popup;
    await panel.waitForFunction(() => window.panelReady);
    await panel.evaluate(() => window.addEventListener('message', event => {
      if (event.data?.state?.activeId === 'forged') window.foreignMessageArrived = true;
    }));
    await attacker.evaluate(() => window.victim.postMessage({
      type: 'state', state: { tabs: [{ id: 'forged', url: 'https://forged.example', title: 'Forged tab' }], activeId: 'forged', agentEnabled: false }
    }, '*'));
    await panel.waitForFunction(() => window.foreignMessageArrived);
    assert.equal(await panel.locator('#tabs').innerText(), '');
    assert.equal(await panel.locator('#agent').getAttribute('aria-pressed'), 'true');
    await panel.evaluate(() => window.postMessage({
      type: 'state', state: { tabs: [{ id: 'trusted', url: 'https://example.com', title: 'Trusted host' }], activeId: 'trusted', agentEnabled: true }
    }, '*'));
    await panel.waitForFunction(() => document.getElementById('tabs').textContent.includes('Trusted host'));
    // VS Code/Antigravity forward messages from a same-origin parent iframe,
    // rather than dispatching a synthetic event with a null source.
    const host = await context.newPage();
    await host.goto(base);
    await host.evaluate(url => {
      const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame);
    }, base + '/panel');
    const embedded = await (await host.waitForSelector('iframe')).contentFrame();
    await embedded.waitForFunction(() => window.panelReady);
    await embedded.evaluate(() => { window.parent = window; window.top = window; window.frameElement = null; });
    await host.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({
      type: 'state', state: { tabs: [{ id: 'parent', url: 'https://example.com', title: 'Embedding host' }], activeId: 'parent', agentEnabled: true }
    }, location.origin));
    await embedded.waitForFunction(() => document.getElementById('tabs').textContent.includes('Embedding host'), undefined, { timeout: 2000 });
  } finally {
    await viewer.close();
    await new Promise(resolve => attackerServer.close(resolve));
  }
});

test('panel renders live frames and relays human typing, clicks, pause and responsive resize', async () => {
  const viewer = await chromium.launch({ executablePath: findBrowser(), headless: true });
  const panel = await viewer.newPage({ viewport: { width: 1000, height: 780 } });
  const errors = [];
  panel.on('pageerror', error => errors.push(error.message));
  let updates = Promise.resolve();
  let economy = false;
  const requested = [];
  const reportActivity = activity => { void panel.evaluate(activity => window.postMessage({ type: 'activity', activity }), activity).catch(() => {}); };
  controller.on('activity', reportActivity);
  async function update() {
    const state = await controller.state();
    await panel.evaluate(state => window.postMessage({ type: 'state', state }), state);
    if (state.tabs.length) {
      const frame = await controller.capture();
      await panel.evaluate(frame => window.postMessage({ type: 'frame', ...frame }), frame);
    }
  }
  await panel.exposeBinding('elektronTestHost', async (_, message) => {
    updates = updates.then(async () => {
      if (message.type === 'action') {
        requested.push(message);
        if (!message.args?.url?.startsWith('https://www.google.com/search?')) await controller.call(message.method, message.args || {});
      }
      if (message.type === 'economy') { economy = !economy; await panel.evaluate(economy => window.postMessage({ type: 'preferences', economy }), economy); }
      if (message.type === 'mcp') await panel.evaluate(() => window.postMessage({ type: 'copied' }));
      await update();
    });
    await updates;
  });
  await panel.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage: message => { void window.elektronTestHost(message); } }); });
  const settle = async () => {
    await panel.evaluate(() => window.elektronTestHost({ type: 'sync' }));
    await updates;
  };
  try {
    await controller.call('new_tab', { url: 'about:blank' });
    await panel.goto(base + '/panel');
    await panel.waitForFunction(() => document.getElementById('starting').textContent.includes('perfil'));
    await panel.screenshot({ path: '.test-artifacts/panel-welcome.png' });
    await panel.locator('#mcp').click();
    await panel.locator('#copy-config').click(); await settle();
    assert.ok((await panel.locator('#copy-feedback').innerText()).includes('elektron-browser'));
    await panel.screenshot({ path: '.test-artifacts/panel-connection.png' });
    await panel.keyboard.press('Escape');
    assert.equal(await panel.locator('#connection').isVisible(), false);
    await panel.locator('#economy').click(); await settle();
    assert.equal(await panel.locator('#economy').getAttribute('aria-pressed'), 'true');
    await panel.locator('#address').fill(base);
    await panel.locator('#address').press('Enter');
    await panel.waitForFunction(() => document.getElementById('welcome').classList.contains('hidden'));
    await settle();
    await panel.waitForFunction(() => document.getElementById('screen').width === Math.round(document.getElementById('viewport').getBoundingClientRect().width));
    const field = (await snapshot()).elements.find(el => el.name === 'Seu nome');
    const canvas = await panel.locator('#screen').boundingBox();
    const frame = await controller.capture();
    await panel.mouse.click(canvas.x + (field.bounds.x + 15) / frame.width * canvas.width, canvas.y + (field.bounds.y + 15) / frame.height * canvas.height);
    await settle();
    await panel.keyboard.type('Gabriel Yogi');
    await settle();
    await panel.keyboard.insertText(', príncipe 💛');
    await settle();
    const button = (await snapshot()).elements.find(el => el.name === 'Cumprimentar');
    await panel.mouse.click(canvas.x + (button.bounds.x + 25) / frame.width * canvas.width, canvas.y + (button.bounds.y + 15) / frame.height * canvas.height);
    await settle();
    const typed = await snapshot();
    assert.ok(typed.text.includes('Olá, Gabriel Yogi, príncipe 💛!'), typed.text);
    await update();
    await panel.waitForFunction(() => document.getElementById('screen').width > 0);
    await panel.screenshot({ path: '.test-artifacts/panel-live.png' });
    await controller.call('fill', { selector: '#name', text: 'IA com cursor' }, true);
    await update();
    await panel.waitForFunction(() => !document.getElementById('agent-cursor').classList.contains('hidden'));
    await panel.screenshot({ path: '.test-artifacts/panel-agent.png' });
    await panel.locator('#agent').click(); await settle();
    assert.equal((await controller.state()).agentEnabled, false);
    await panel.locator('#agent').click(); await settle();
    await panel.setViewportSize({ width: 390, height: 730 });
    await panel.waitForFunction(() => document.getElementById('screen').width === 390); await settle();
    assert.equal((await controller.capture()).width, 390);
    await panel.screenshot({ path: '.test-artifacts/panel-narrow.png' });
    await controller.call('navigate', { url: 'about:blank' }); await update();
    await panel.evaluate(() => {
      const theme = { '--vscode-editor-background': '#fafbfe', '--vscode-editor-foreground': '#243045', '--vscode-descriptionForeground': '#68768c', '--vscode-panel-border': '#dde3ee', '--vscode-input-background': '#f0f3f9', '--vscode-toolbar-hoverBackground': '#eaf0f8', '--vscode-textLink-foreground': '#426bcd', '--vscode-button-background': '#416dcc', '--vscode-button-foreground': '#ffffff' };
      for (const [key, value] of Object.entries(theme)) document.documentElement.style.setProperty(key, value);
    });
    await panel.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await panel.screenshot({ path: '.test-artifacts/panel-light-narrow.png' });
    await panel.locator('#start-address').fill('foto de gatinho');
    await panel.locator('#start-navigation button').click(); await settle();
    assert.ok(requested.some(message => message.args?.url === 'https://www.google.com/search?q=foto%20de%20gatinho'));
    assert.deepEqual(errors, []);
    await controller.call('close_tab');
  } finally { controller.off('activity', reportActivity); await updates.catch(() => {}); await viewer.close(); }
});

test('dedicated profile persists a site session after the browser restarts', async () => {
  await controller.call('navigate', { url: base });
  await clickName('Salvar sessão');
  await bridge.close(); bridge = undefined;
  await controller.close();
  controller = new BrowserController({ profileDir: path.join(root, 'profile') });
  await controller.start();
  bridge = await startBridge(controller, discoveryFile);
  await controller.call('navigate', { url: base + '/cookies' });
  assert.ok((await snapshot()).text.includes('elektronSession=ok'));
  // Invalid protocol never creates a new tab or launches a local file.
  const count = (await controller.state()).tabs.length;
  await assert.rejects(controller.call('new_tab', { url: 'file:///C:/Windows/win.ini' }), /http/);
  assert.equal((await controller.state()).tabs.length, count);
});

test('isolated worker owns browser and MCP, shares frames over IPC, and removes discovery on close', async () => {
  const messages = [];
  const client = new BrowserClient(path.resolve('dist/worker.cjs'), line => messages.push(line));
  const workerDiscovery = path.join(root, 'worker-bridge.json');
  const activity = [];
  let ownedPids = [];
  client.on('activity', event => activity.push(event));
  try {
    await Promise.all(Array.from({ length: 8 }, () => client.start({ profileDir: path.join(root, 'worker-profile') }, workerDiscovery)));
    await client.call('navigate', { url: base });
    assert.equal((await client.call('snapshot')).title, 'Oficina Tabyra');
    assert.ok((await client.capture()).data.length > 5000);
    const state = JSON.parse(await readFile(workerDiscovery, 'utf8'));
    if (process.platform === 'win32') {
      const { promisify } = require('node:util');
      const { execFile } = require('node:child_process');
      const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$items = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId); $owned = [System.Collections.Generic.HashSet[int]]::new(); [void]$owned.Add(${state.pid}); do { $added = $false; foreach ($item in $items) { if ($owned.Contains([int]$item.ParentProcessId) -and $owned.Add([int]$item.ProcessId)) { $added = $true } } } while ($added); @($owned) | ConvertTo-Json -Compress`], { windowsHide: true, timeout: 15000 });
      ownedPids = JSON.parse(stdout);
      assert.ok(ownedPids.length >= 3, 'The worker owns a real Chromium process tree');
    }
    const response = await fetch(`http://127.0.0.1:${state.port}/call`, {
      method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'fill', args: { selector: '#name', text: 'Processo isolado' } })
    });
    assert.equal(response.status, 200);
    assert.ok(activity.some(event => event.method === 'fill' && event.phase === 'target' && event.x >= 0 && event.x <= 1));
    await client.call('click', { selector: '#hello' });
    assert.ok((await client.call('snapshot')).text.includes('Olá, Processo isolado!'));
  } finally { await client.close(); }
  await assert.rejects(readFile(workerDiscovery));
  for (const pid of ownedPids) assert.throws(() => process.kill(pid, 0), /ESRCH/, `Owned process ${pid} must actually exit`);
});

test('agent cursor reports live element bounds and does not invent a target for a failed action', async () => {
  await controller.call('navigate', { url: base });
  const events = [];
  const listener = event => events.push(event);
  controller.on('activity', listener);
  try {
    const field = (await snapshot()).elements.find(el => el.name === 'Seu nome');
    const image = await controller.capture();
    await controller.call('fill', { ref: field.ref, text: 'Cursor real' }, true);
    assert.deepEqual(events.map(e => e.phase), ['begin', 'target', 'complete']);
    const target = events.find(e => e.phase === 'target');
    assert.ok(Math.abs(target.x - (field.bounds.x + field.bounds.width / 2) / image.width) < .01);
    assert.ok(Math.abs(target.y - (field.bounds.y + field.bounds.height / 2) / image.height) < .01);
    events.length = 0;
    await assert.rejects(controller.call('click', { ref: 'missing' }, true), /Referência expirou/);
    assert.deepEqual(events.map(e => e.phase), ['begin', 'error']);
  } finally { controller.off('activity', listener); }
});

test('concurrent starts share one browser; captures coalesce and closing during startup drains the session', async () => {
  const browser = new BrowserController({ profileDir: path.join(root, 'concurrent-profile') });
  await Promise.all(Array.from({ length: 8 }, () => browser.start()));
  assert.equal((await browser.state()).tabs.length, 1);
  await browser.call('navigate', { url: base });
  const frames = await Promise.all(Array.from({ length: 5 }, () => browser.capture()));
  assert.ok(frames.every(frame => frame.data === frames[0].data));
  await Promise.all([browser.close(), browser.close()]);
  assert.equal(browser.running, false);
  const interrupted = new BrowserController({ profileDir: path.join(root, 'interrupted-profile') });
  const starting = interrupted.start();
  await interrupted.close();
  await starting;
  assert.equal(interrupted.running, false);
  await assert.rejects(interrupted.call('tabs'), /encerrando/);
});

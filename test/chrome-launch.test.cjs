const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { launchChromeSetup, BrowserController } = require('../dist/core.cjs');

function fakeSpawn(onSpawn) {
  return mock.method(childProcess, 'spawn', (executable, args, options) => {
    const child = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => onSpawn(child, executable, args, options));
    return child;
  });
}

test('a failed Chrome launch is reported instead of claiming the window opened', async () => {
  const mocked = fakeSpawn(child => child.emit('error', Object.assign(new Error('EACCES'), { code: 'EACCES' })));
  try { await assert.rejects(launchChromeSetup(process.execPath), /Não foi possível abrir o Chrome: EACCES/); }
  finally { mocked.mock.restore(); }
  const exited = fakeSpawn(child => { child.emit('spawn'); child.emit('exit', 1, null); });
  try { await assert.rejects(launchChromeSetup(process.execPath), /código 1/); }
  finally { exited.mock.restore(); }
});

test('Chrome setup opens the existing last profile visibly without sidecar runtime settings', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'elektron-launch-test-'));
  const names = ['LOCALAPPDATA', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'ANTIGRAVITY_SIDECAR_UI_TOKEN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let received;
  const mocked = fakeSpawn((child, executable, args, options) => {
    received = { executable, args, options };
    child.emit('spawn'); child.emit('exit', 0, null);
  });
  try {
    process.env.LOCALAPPDATA = root;
    process.env.ELECTRON_RUN_AS_NODE = '1'; process.env.NODE_OPTIONS = '--some-host-loader'; process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN = 'private-test-marker';
    const data = path.join(root, 'Google/Chrome/User Data');
    await mkdir(path.join(data, 'Profile 3'), { recursive: true });
    await writeFile(path.join(data, 'Profile 3/Preferences'), '{}');
    await writeFile(path.join(data, 'Local State'), JSON.stringify({ profile: { last_used: 'Profile 3' } }));
    await launchChromeSetup(path.join(root, 'Google/Chrome/Application/chrome.exe'));
    assert.deepEqual(received.args, ['--new-window', '--profile-directory=Profile 3', 'chrome://extensions/']);
    assert.equal(received.options.windowsHide, false);
    for (const name of names.slice(1)) assert.equal(received.options.env[name], undefined);
    assert.equal(received.options.env.LOCALAPPDATA, root);
    await writeFile(path.join(data, 'Local State'), JSON.stringify({ profile: { last_used: '../System Profile' } }));
    await launchChromeSetup(path.join(root, 'Google/Chrome/Application/chrome.exe'));
    assert.deepEqual(received.args, ['--new-window', 'chrome://extensions/'], 'Untrusted directory identifiers cannot select arbitrary profiles');
  } finally {
    mocked.mock.restore();
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    await rm(root, { recursive: true, force: true });
  }
});

test('repeated launch clicks share one request and the agent cannot open the setup window', async () => {
  let launches = 0;
  const mocked = fakeSpawn(child => { launches++; setTimeout(() => { child.emit('spawn'); child.emit('exit', 0, null); }, 20); });
  const controller = new BrowserController({ profileDir: 'unused-test-profile', executablePath: process.execPath });
  try {
    await assert.rejects(controller.call('chrome_open', {}, true), /reservada/);
    const results = await Promise.all(Array.from({ length: 6 }, () => controller.call('chrome_open')));
    assert.equal(launches, 1);
    assert.ok(results.every(result => result.launched === true));
  } finally { await controller.close(); mocked.mock.restore(); }
});

test('Connect Chrome opens a short-lived local handoff instead of extensions or a JSON prompt',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'elektron-connect-launch-'));let target;
  const mocked=fakeSpawn((child,executable,args)=>{target=args.at(-1);child.emit('spawn');child.emit('exit',0,null);});
  const controller=new BrowserController({profileDir:root,mode:'chrome',executablePath:process.execPath});
  try {
    await controller.start();await controller.call('chrome_open',{connect:true});
    assert.match(target,/^http:\/\/127\.0\.0\.1:\d+\/elektron\/connect#key=[a-f0-9]{64}$/);
    assert.ok(!target.includes(JSON.parse(controller.relay.pairing()).token));
    await assert.rejects(launchChromeSetup(process.execPath,'https://untrusted.example'),/Destino/);
  }finally{await controller.close();mocked.mock.restore();await rm(root,{recursive:true,force:true});}
});

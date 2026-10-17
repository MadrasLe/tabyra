import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const executable = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Programs/Antigravity IDE/Antigravity IDE.exe');
await mkdir('.test-user-data', { recursive: true });
const data = await mkdtemp(path.resolve('.test-user-data', 'antigravity-'));
await mkdir(path.join(data, 'User'), { recursive: true });
await writeFile(path.join(data, 'User/settings.json'), JSON.stringify({ 'security.workspace.trust.enabled': false, 'workbench.startupEditor': 'none', 'update.mode': 'none', 'extensions.autoUpdate': false }));
// A disposable Windows user profile avoids importing the user's old IDE settings
// or triggering its migration dialog. The actual account and IDE profile are untouched.
const taskTestProfile = path.join(data, 'test-profile');
const taskTestAppData = path.join(taskTestProfile, 'AppData/Roaming');
await mkdir(taskTestAppData, { recursive: true });
const env = { ...process.env, ELEKTRON_TEST_DATA: data, ...(process.platform === 'win32' ? { USERPROFILE: taskTestProfile, APPDATA: taskTestAppData } : {}) };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VSCODE_IPC_HOOK_CLI;
const child = spawn(executable, [
  '--user-data-dir', data,
  '--extensions-dir', path.join(data, 'extensions'),
  '--extensionDevelopmentPath', process.cwd(),
  '--extensionTestsPath', path.resolve('test/extension-smoke.cjs'),
  '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-telemetry', '--disable-extensions', '--disable-extension', 'google.antigravity', '--disable-extension', 'vscode.github', '--new-window'
], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk.toString(); });
const timeout = setTimeout(() => {
  if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill();
}, 150000);
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
clearTimeout(timeout);
await writeFile(path.join(data, 'host.log'), log);
try { console.log(await readFile(path.join(data, 'result.json'), 'utf8')); }
catch { console.error(log.slice(-8000)); console.error(`No result. Diagnostics: ${data}`); process.exitCode = 1; }
if (code !== 0) process.exitCode = 1;

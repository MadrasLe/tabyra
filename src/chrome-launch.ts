import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Read only the directory identifier, never account names or credentials. */
async function lastProfile(executable: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const normalized = executable.replaceAll('\\', '/').toLowerCase();
  let dataDir: string | undefined;
  if (process.platform === 'win32') {
    if (/\/google\/chrome\/application\/chrome\.exe$/.test(normalized)) dataDir = path.join(env.LOCALAPPDATA || '', 'Google/Chrome/User Data');
    else if (/\/microsoft\/edge\/application\/msedge\.exe$/.test(normalized)) dataDir = path.join(env.LOCALAPPDATA || '', 'Microsoft/Edge/User Data');
  }
  if (!dataDir || !env.LOCALAPPDATA) return;
  try {
    const value = JSON.parse(await readFile(path.join(dataDir, 'Local State'), 'utf8')).profile?.last_used;
    if (typeof value !== 'string' || value.length > 80 || !/^[\w .-]+$/.test(value) || ['.', '..', 'System Profile', 'Guest Profile'].includes(value)) return;
    if (existsSync(path.join(dataDir, value, 'Preferences'))) return value;
  } catch { /* A fresh or custom installation can choose its profile normally. */ }
}

/** Open a visible, ordinary browser window independently of the sidecar. */
export async function launchChromeSetup(executable: string, target = 'chrome://extensions/'): Promise<{ launched: true }> {
  if (target !== 'chrome://extensions/' && !/^http:\/\/127\.0\.0\.1:\d+\/elektron\/connect#key=[a-f0-9]{64}$/.test(target)) throw new Error('Destino de conexão Chrome inválido.');
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(ELECTRON_|ANTIGRAVITY_|NODE_OPTIONS$|NODE_CHANNEL_|NODE_UNIQUE_ID$)/i.test(key)) delete env[key];
  }
  const profile = await lastProfile(executable, env);
  const args = [...(target === 'chrome://extensions/' ? ['--new-window'] : []), ...(profile ? ['--profile-directory=' + profile] : []), target];
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    const child = spawn(executable, args, { env, windowsHide: false, detached: true, stdio: 'ignore' });
    const failed = (reason: string) => { clearTimeout(timer); reject(new Error('Não foi possível abrir o Chrome: ' + reason + '. Abra seu Chrome e acesse chrome://extensions manualmente.')); };
    child.once('error', error => failed(error.message));
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ launched: true });
      else failed(signal || 'o processo encerrou com código ' + code);
    });
    child.once('spawn', () => {
      // Existing Chrome instances may accept the URL and exit immediately.
      // A new process remaining alive is a launch request, not proof of a rendered UI.
      timer = setTimeout(() => resolve({ launched: true }), 750);
      child.unref();
    });
  });
}

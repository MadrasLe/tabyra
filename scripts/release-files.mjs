import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packaging = createRequire(require.resolve('@vscode/vsce/package.json'));
export const { ZipFile } = packaging('yazl');
const yauzl = packaging('yauzl');

export async function filesIn(directory, prefix = '') {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isSymbolicLink()) throw new Error('Release symlink refused: ' + name);
    if (item.isDirectory()) result.push(...await filesIn(path.join(directory, item.name), name + '/'));
    else result.push(name);
  }
  return result.sort();
}

export async function zipEntries(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = [];
      zip.on('error', reject);
      zip.on('entry', entry => {
        if (entry.uncompressedSize > 25 * 1024 * 1024) { zip.close(); reject(new Error('Oversized release entry: ' + entry.fileName)); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error) { zip.close(); reject(error); return; }
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', () => { entries.push({ name: entry.fileName, data: Buffer.concat(chunks) }); zip.readEntry(); });
        });
      });
      zip.on('end', () => resolve(entries));
      zip.readEntry();
    });
  });
}

export function checkEntries(entries) {
  for (const { name, data } of entries) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('Unsafe archive path: ' + name);
    if (/(^|\/)(?:\.git|\.env[^/]*|\.test[^/]*|output|profiles?|sessions?)(\/|$)|\.(?:log|bak|sqlite|vscdb|tmp)$|(^|\/)(?:VALIDATION\.md|RELEASE-VALIDATION\.md|session\.json|chrome-connection\.json|mcp_config\.json|config\.json)$/.test(name)) throw new Error('Private/development file in release: ' + name);
    if (/\.(?:[cm]?js|json|md|txt|html|css|ts)$/.test(name)) {
      const text = data.toString('utf8');
      if (/c:[/\\]+users[/\\]+gabri[/\\]/i.test(text) || /Bearer [a-f0-9]{64}\b/.test(text) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) throw new Error('Local path or credential pattern in release: ' + name);
    }
  }
}

export async function manifest() {
  const ide = JSON.parse(await readFile('package.json', 'utf8'));
  const app = JSON.parse(await readFile('app/plugin.json', 'utf8'));
  const chrome = JSON.parse(await readFile('chrome-extension/manifest.json', 'utf8'));
  return { brand: 'Tabyra', channel: 'beta', versions: { browser: ide.version, app: app.version, connect: chrome.version },
    compatibility: { extension: ide.publisher + '.' + ide.name, plugin: app.name, appMcp: 'elektron-app_elektron-app' },
    contact: 'abrakasfrosken@gmail.com', files: { browser: `tabyra-browser-${ide.version}.vsix`, app: `tabyra-app-${app.version}.zip`, connect: `tabyra-connect-${chrome.version}.zip` } };
}

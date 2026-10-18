import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'app-plugin', 'elektron-app');
const sidecar = path.join(target, 'sidecars', 'browser');
await mkdir(path.join(sidecar, 'media'), { recursive: true });
await mkdir(path.join(target, 'dist'), { recursive: true });
await mkdir(path.join(target, 'node_modules'), { recursive: true });
await cp(path.join(root, 'app', 'plugin.json'), path.join(target, 'plugin.json'));
await cp(path.join(root, 'app', 'sidecar.json'), path.join(sidecar, 'sidecar.json'));
await cp(path.join(root, 'app', 'skills'), path.join(target, 'skills'), { recursive: true });
await cp(path.join(root, 'chrome-extension'), path.join(target, 'chrome-extension'), { recursive: true });
await cp(path.join(root, 'dist', 'app.mjs'), path.join(sidecar, 'elektron.mjs'));
await cp(path.join(root, 'dist', 'mcp.cjs'), path.join(target, 'dist', 'mcp.cjs'));
await cp(path.join(root, 'dist', 'install.mjs'), path.join(target, 'install.mjs'));
const toolSource = await readFile(path.join(root, 'src', 'tools.ts'), 'utf8');
const toolNames = [...toolSource.matchAll(/tool\('(browser_[a-z_]+)'/g)].map(match => match[1]);
if (toolNames.length !== 16) throw new Error('Manifesto de ferramentas inconsistente.');
await writeFile(path.join(target, 'tool-manifest.json'), JSON.stringify(toolNames, null, 2) + '\n');
for (const name of ['browser.html', 'browser.css', 'browser.js', 'app.css', 'app-guard.js', 'app-bridge.js']) {
  await cp(path.join(root, 'media', name), path.join(sidecar, 'media', name));
}
await cp(path.join(root, 'node_modules', 'playwright-core'), path.join(target, 'node_modules', 'playwright-core'), { recursive: true });
await cp(path.join(root, 'node_modules', 'ws'), path.join(target, 'node_modules', 'ws'), { recursive: true });
await cp(path.join(root, 'LICENSE'), path.join(target, 'LICENSE'));
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(target, 'THIRD_PARTY_NOTICES.md'));
await cp(path.join(root, 'APP.md'), path.join(target, 'README.md'));
await cp(path.join(root, 'AUTOMATION.md'), path.join(target, 'AUTOMATION.md'));
await cp(path.join(root, 'CHROME.md'), path.join(target, 'CHROME.md'));
for (const name of ['PRIVACY.md', 'SECURITY.md', 'SUPPORT.md', 'MIGRATION.md']) await cp(path.join(root, name), path.join(target, name));
await cp(path.join(root, 'third-party-licenses'), path.join(target, 'third-party-licenses'), { recursive: true });
const versions = { elektronApp: JSON.parse(await readFile(path.join(target, 'plugin.json'), 'utf8')).version,
  playwright: JSON.parse(await readFile(path.join(target, 'node_modules/playwright-core/package.json'), 'utf8')).version };
await writeFile(path.join(target, 'versions.json'), JSON.stringify(versions, null, 2));
console.log(JSON.stringify({ package: target, ...versions }));

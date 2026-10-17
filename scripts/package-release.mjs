import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile, filesIn, manifest } from './release-files.mjs';
import { checkRelease } from './check-release.mjs';

const info = await manifest();
const directory = path.resolve('release', 'tabyra-beta-' + info.versions.browser);
await mkdir(directory, { recursive: true });

async function archive(name, files) {
  const zip = new ZipFile();
  const output = pipeline(zip.outputStream, createWriteStream(path.join(directory, name)));
  for (const [source, target] of files) zip.addFile(source, target);
  zip.end();
  await output;
}

await cp(info.files.browser, path.join(directory, info.files.browser));
const appRoot = path.resolve('app-plugin', 'elektron-app');
const appPaths = (await filesIn(appRoot)).filter(name => /^(?:plugin\.json|versions\.json|tool-manifest\.json|install\.mjs|LICENSE|THIRD_PARTY_NOTICES\.md|README\.md|AUTOMATION\.md|CHROME\.md|PRIVACY\.md|SECURITY\.md|SUPPORT\.md|MIGRATION\.md)$/.test(name) || /^(?:dist|skills|sidecars|chrome-extension|node_modules|third-party-licenses)\//.test(name));
await archive(info.files.app, appPaths.map(name => [path.join(appRoot, name), name]));
const chromeFiles = (await filesIn('chrome-extension')).map(name => [path.resolve('chrome-extension', name), name]);
for (const name of ['LICENSE', 'PRIVACY.md', 'SECURITY.md', 'SUPPORT.md']) chromeFiles.push([path.resolve(name), name]);
await archive(info.files.connect, chromeFiles);
for (const name of ['PRIVACY.md', 'SUPPORT.md', 'MIGRATION.md']) await cp(name, path.join(directory, name));
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(info, null, 2) + '\n');
const report = await checkRelease(directory);
const names = [...Object.values(info.files), 'manifest.json', 'PRIVACY.md', 'SUPPORT.md', 'MIGRATION.md'];
const checksums = [];
for (const name of names) checksums.push(createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex') + '  ' + name);
await writeFile(path.join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
await writeFile(path.join(directory, 'RELEASE-CHECK.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ directory, ...report }, null, 2));

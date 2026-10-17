import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function collectLicenses(builds) {
  const roots = new Set(['node_modules/playwright-core', 'node_modules/ws']);
  for (const build of builds) for (const input of Object.keys(build.metafile.inputs)) {
    const marker = input.lastIndexOf('node_modules/');
    if (marker < 0) continue;
    const prefix = input.slice(0, marker + 13), parts = input.slice(marker + 13).split('/');
    roots.add(prefix + (parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]));
  }
  const packages = [];
  for (const root of [...roots].sort()) {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const licenses = (await readdir(root)).filter(name => /^(LICENSE|LICENCE|COPYING|NOTICE)(\..*)?$/i.test(name));
    if (!licenses.length) throw new Error('Missing license file for bundled dependency: ' + pkg.name);
    const folder = pkg.name.replaceAll('/', '__').replace(/^@/, '');
    await mkdir(path.join('third-party-licenses', folder), { recursive: true });
    for (const file of licenses) await cp(path.join(root, file), path.join('third-party-licenses', folder, file));
    packages.push({ name: pkg.name, version: pkg.version, license: pkg.license, files: licenses.map(file => folder + '/' + file) });
  }
  await writeFile('third-party-licenses/index.json', JSON.stringify(packages, null, 2) + '\n');
  return packages.length;
}

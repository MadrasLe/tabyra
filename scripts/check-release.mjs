import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { zipEntries, checkEntries, manifest } from './release-files.mjs';

export async function checkRelease(directory) {
  const info = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const archives = {};
  for (const [kind, file] of Object.entries(info.files)) {
    const entries = await zipEntries(path.join(directory, file));
    checkEntries(entries);
    const prefix = kind === 'browser' ? 'extension/' : '';
    const get = name => entries.find(entry => entry.name === prefix + name)?.data;
    assert.ok(get('PRIVACY.md'), kind + ' privacy policy');
    assert.ok(get('SUPPORT.md'), kind + ' support');
    if (kind === 'browser') {
      const pkg = JSON.parse(get('package.json'));
      assert.equal(pkg.displayName, 'Tabyra Browser');
      assert.equal(pkg.publisher + '.' + pkg.name, 'gabrielyogi.elektron-browser');
      assert.equal(pkg.version, info.versions.browser);
      assert.ok(get(pkg.icon), 'store icon');
      assert.ok(get('third-party-licenses/index.json'), 'bundled license inventory');
      assert.ok(entries.find(entry => entry.name === 'extension.vsixmanifest').data.toString().includes('Microsoft.VisualStudio.Code.PreRelease'));
    } else if (kind === 'app') {
      assert.equal(JSON.parse(get('plugin.json')).displayName, 'Tabyra');
      assert.equal(JSON.parse(get('plugin.json')).version, info.versions.app);
      assert.ok(get('install.mjs'), 'self-contained installer');
      assert.equal(JSON.parse(get('tool-manifest.json')).length, 16);
      assert.ok(get('third-party-licenses/index.json'), 'bundled license inventory');
    } else {
      const chrome = JSON.parse(get('manifest.json'));
      assert.equal(chrome.name, 'Tabyra Connect');
      assert.equal(chrome.version, info.versions.connect);
      for (const icon of Object.values(chrome.icons)) assert.ok(get(icon), icon);
      assert.ok(get('connect.js'));
    }
    archives[kind] = { file, entries: entries.length };
  }
  return { passed: true, brand: info.brand, archives, noPrivateDevelopmentFiles: true, stableLegacyIdentity: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const info = await manifest();
  const directory = process.argv[2] || path.resolve('release', 'tabyra-beta-' + info.versions.browser);
  console.log(JSON.stringify(await checkRelease(directory), null, 2));
}

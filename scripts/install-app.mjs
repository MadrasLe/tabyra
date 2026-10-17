import { cp, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, modify, applyEdits } from 'jsonc-parser';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultSource = path.basename(fileURLToPath(import.meta.url)) === 'install.mjs'
  ? here : path.resolve(here, '..', 'app-plugin', 'elektron-app');

/** Stable legacy IDs preserve existing profiles, MCP connections and grants. */
export async function installApp({ source = defaultSource, home = os.homedir(), allowTools = false } = {}) {
  source = path.resolve(source);
  const configDir = path.join(home, '.gemini', 'config');
  const target = path.join(configDir, 'plugins', 'elektron-app');
  const dataDir = path.join(home, '.gemini', 'elektron-app');
  const configPath = path.join(configDir, 'config.json');
  const manifest = JSON.parse(await readFile(path.join(source, 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'elektron-app', 'O pacote não corresponde ao Tabyra App.');
  const names = JSON.parse(await readFile(path.join(source, 'tool-manifest.json'), 'utf8'));
  assert.ok(Array.isArray(names) && names.length === 16 && new Set(names).size === names.length && names.every(name => /^browser_[a-z_]+$/.test(name)), 'Manifesto de ferramentas inválido.');
  await readFile(path.join(source, 'sidecars', 'browser', 'elektron.mjs'));
  await readFile(path.join(source, 'dist', 'mcp.cjs'));
  let original = '{}\n', existed = false;
  try { original = await readFile(configPath, 'utf8'); existed = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const errors = [];
  const before = parse(original, errors, { allowTrailingComma: true });
  assert.equal(errors.length, 0, 'Configuração existente inválida. Instalação não iniciada.');
  assert.ok(before && typeof before === 'object' && !Array.isArray(before), 'Formato de configuração não reconhecido.');
  for (const key of ['plugins', 'sidecars', 'userSettings']) assert.ok(before[key] === undefined || before[key] && typeof before[key] === 'object' && !Array.isArray(before[key]), `Formato inválido: ${key}.`);
  const rule = 'mcp(elektron-app_elektron-app/*)';
  const grants = before.userSettings?.globalPermissionGrants || {};
  for (const key of ['allow', 'ask', 'deny']) assert.ok(grants[key] === undefined || Array.isArray(grants[key]) && grants[key].every(value => typeof value === 'string'), 'Lista de permissões inválida.');
  if (allowTools) {
    const conflicts = [...(grants.ask || []), ...(grants.deny || [])].filter(value => value === 'mcp(*)' || value === rule || value.startsWith('mcp(elektron-app_elektron-app/'));
    assert.equal(conflicts.length, 0, 'Há regras Ask/Deny para este MCP. Foram preservadas; resolva o conflito no Antigravity.');
  }
  const changes = [[['plugins', 'elektron-app', 'enabled'], true], [['sidecars', 'elektron-app/browser', 'enabled'], true]];
  if (allowTools && !(grants.allow || []).includes(rule)) changes.push([['userSettings', 'globalPermissionGrants', 'allow'], [...(grants.allow || []), rule]]);
  let updated = original;
  const expected = structuredClone(before);
  for (const [keys, value] of changes) {
    updated = applyEdits(updated, modify(updated, keys, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: original.includes('\r\n') ? '\r\n' : '\n' } }));
    let parent = expected;
    for (const part of keys.slice(0, -1)) parent = parent[part] ??= {};
    parent[keys.at(-1)] = value;
  }
  assert.deepEqual(parse(updated), expected, 'As outras preferências devem ser preservadas.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(3).toString('hex');
  const backupDir = path.join(configDir, 'tabyra-backups', stamp);
  let previousPluginBackup, backupPath;
  try {
    await readFile(path.join(target, 'plugin.json'));
    previousPluginBackup = path.join(backupDir, 'elektron-app');
    await mkdir(backupDir, { recursive: true });
    await cp(target, previousPluginBackup, { recursive: true, errorOnExist: true, force: false });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(path.dirname(target), { recursive: true });
  if (source !== path.resolve(target)) await cp(source, target, { recursive: true });
  const sidecarPath = path.join(target, 'sidecars', 'browser', 'sidecar.json');
  const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'));
  sidecar.env = { ...sidecar.env, ELEKTRON_APP_DATA_DIR: dataDir };
  await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');
  await writeFile(path.join(target, 'mcp_config.json'), JSON.stringify({ mcpServers: {
    'elektron-app': { command: process.execPath, args: [path.join(target, 'dist', 'mcp.cjs'), path.join(dataDir, 'session.json')],
      env: { ELEKTRON_MCP_NAME: 'elektron-app' }, tools: Object.fromEntries(names.map(name => [name, { eager: true }])) }
  } }, null, 2) + '\n');
  let current;
  try { current = await readFile(configPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.equal(current, existed ? original : undefined, 'Preferências mudaram durante a instalação; não foram sobrescritas.');
  if (updated !== original || !existed) {
    await mkdir(configDir, { recursive: true });
    if (existed) {
      await mkdir(backupDir, { recursive: true });
      backupPath = path.join(backupDir, 'config.json');
      await cp(configPath, backupPath, { errorOnExist: true, force: false });
    }
    const temporary = configPath + '.tabyra-' + stamp + '.tmp';
    await writeFile(temporary, updated, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, configPath);
  }
  return { installed: target, dataDir, configPath, backupPath, previousPluginBackup, version: manifest.version,
    enabled: true, addedAutoApproval: allowTools && !(grants.allow || []).includes(rule),
    preservedOtherPreferences: true, preservedIdeMcp: true, preservedLegacyProfiles: true };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Tabyra App — node install.mjs [--allow-tools]\nInstala e habilita o plugin no perfil atual. Permissões MCP existentes são preservadas.\n--allow-tools autoriza explicitamente somente este MCP; regras Ask/Deny conflitantes são respeitadas.');
    return;
  }
  if (args.some(arg => arg !== '--allow-tools')) throw new Error('Opção desconhecida. Use --help.');
  console.log(JSON.stringify(await installApp({ allowTools: args.includes('--allow-tools') }), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });

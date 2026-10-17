const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { parse, modify, applyEdits } = require('jsonc-parser');

async function main() {
  const configPath = path.join(os.homedir(), '.gemini/config/config.json');
  const original = await fs.readFile(configPath, 'utf8');
  const errors = [];
  const before = parse(original, errors, { allowTrailingComma: true });
  assert.equal(errors.length, 0, 'Configuração existente tem erros. Nenhuma alteração foi feita.');
  assert.ok(before.userSettings && typeof before.userSettings === 'object', 'Formato de preferências não reconhecido.');
  const grants = before.userSettings.globalPermissionGrants || {};
  const rule = 'mcp(elektron-browser/*)';
  const conflicts = [...(grants.ask || []), ...(grants.deny || [])].filter(value => value === 'mcp(*)' || value === rule || value.startsWith('mcp(elektron-browser/'));
  assert.equal(conflicts.length, 0, 'Há regras Ask/Deny conflitantes. Elas foram preservadas; revise-as pela IDE.');
  const allow = [...(grants.allow || [])];
  if (allow.includes(rule)) { console.log(JSON.stringify({ configPath, changed: false, rule })); return; }
  allow.push(rule);
  const updated = applyEdits(original, modify(original, ['userSettings', 'globalPermissionGrants', 'allow'], allow, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: original.includes('\r\n') ? '\r\n' : '\n' }
  }));
  const expected = structuredClone(before);
  expected.userSettings.globalPermissionGrants = { ...grants, allow };
  assert.deepEqual(parse(updated), expected);
  const backupPath = configPath + '.elektron-permissions-' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak';
  await fs.copyFile(configPath, backupPath, 1);
  assert.equal(await fs.readFile(configPath, 'utf8'), original, 'O arquivo mudou durante o ajuste.');
  await fs.writeFile(configPath, updated, 'utf8');
  console.log(JSON.stringify({ configPath, changed: true, rule, backupPath, preservedOtherPreferences: true }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

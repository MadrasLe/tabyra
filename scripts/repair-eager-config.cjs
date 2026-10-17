const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { parse, modify, applyEdits } = require('jsonc-parser');

async function main() {
  const installed = process.argv[2];
  if (!installed) throw new Error('Informe o caminho instalado da versão da extensão.');
  await fs.access(path.join(installed, 'dist/mcp.cjs'));
  const schemaPath = path.join(process.env.LOCALAPPDATA, 'Programs/Antigravity IDE/resources/app/extensions/antigravity/schemas/mcp_config.schema.json');
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  assert.equal(schema.properties.mcpServers.additionalProperties.properties.tools.additionalProperties.properties.eager.type, 'boolean');
  const source = await fs.readFile(path.join(__dirname, '../src/tools.ts'), 'utf8');
  const names = [...source.matchAll(/tool\('(browser_[a-z_]+)'/g)].map(match => match[1]);
  assert.equal(names.length, 16);
  const configs = process.argv.slice(3);
  if (!configs.length) configs.push(path.join(os.homedir(), '.gemini/config/mcp_config.json'), path.join(os.homedir(), '.gemini/antigravity/mcp_config.json'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const configPath of configs) {
    let original;
    try { original = await fs.readFile(configPath, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const errors = [];
    const before = parse(original, errors, { allowTrailingComma: true });
    assert.equal(errors.length, 0, 'Configuração existente tem erros; nenhuma alteração foi feita.');
    const entry = before.mcpServers?.['elektron-browser'];
    if (!entry) continue;
    assert.ok(Array.isArray(entry.args) && entry.args[0]?.endsWith('mcp.cjs'), 'Entrada não corresponde ao Elektron esperado.');
    let updated = original;
    const base = ['mcpServers', 'elektron-browser'];
    const formattingOptions = { insertSpaces: true, tabSize: 2, eol: original.includes('\r\n') ? '\r\n' : '\n' };
    const replace = (keys, value) => { updated = applyEdits(updated, modify(updated, [...base, ...keys], value, { formattingOptions })); };
    replace(['args', 0], path.join(installed, 'dist/mcp.cjs'));
    for (const name of names) replace(['tools', name, 'eager'], true);
    const after = parse(updated, [], { allowTrailingComma: true });
    // Preserve all other servers, fields, permissions, and individual tool settings.
    for (const [name, value] of Object.entries(before.mcpServers)) if (name !== 'elektron-browser') assert.deepEqual(after.mcpServers[name], value);
    const expected = structuredClone(before);
    expected.mcpServers['elektron-browser'].args[0] = path.join(installed, 'dist/mcp.cjs');
    expected.mcpServers['elektron-browser'].tools ||= {};
    for (const name of names) expected.mcpServers['elektron-browser'].tools[name] = { ...expected.mcpServers['elektron-browser'].tools[name], eager: true };
    assert.deepEqual(after, expected);
    if (original === updated) { console.log(JSON.stringify({ configPath, changed: false })); continue; }
    const backupPath = `${configPath}.elektron-${stamp}.bak`;
    await fs.copyFile(configPath, backupPath, 1);
    // Refuse to overwrite a concurrent edit made by the IDE or the user.
    assert.equal(await fs.readFile(configPath, 'utf8'), original, 'O arquivo mudou durante o reparo.');
    await fs.writeFile(configPath, updated, 'utf8');
    console.log(JSON.stringify({ configPath, changed: true, eagerTools: names.length, backupPath }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

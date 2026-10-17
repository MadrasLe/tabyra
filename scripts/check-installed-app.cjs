const { readFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function main() {
  const folder = path.join(os.homedir(), '.gemini/config/plugins/elektron-app');
  const config = JSON.parse(await readFile(path.join(folder, 'mcp_config.json'), 'utf8')).mcpServers['elektron-app'];
  const client = new Client({ name: 'elektron-installed-app-check', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: config.command, args: config.args, env: { ...process.env, ...config.env }, stderr: 'pipe' });
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, result.content[0]?.text);
    return JSON.parse(result.content[0].text);
  };
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 16);
    assert.ok(tools.every(tool => config.tools?.[tool.name]?.eager));
    const before = await call('browser_tabs');
    if (process.argv.includes('--status-only')) {
      console.log(JSON.stringify({ server: client.getServerVersion(), tools: tools.length, eagerTools: tools.length,
        running: before.running, mode: before.mode, connected: before.connected, agentEnabled: before.agentEnabled, tabs: before.tabs.length }, null, 2));
      return;
    }
    const result = await call('browser_evaluate', { script: '() => ({ document: typeof document, node: typeof process, answer: 6 * 7 })' });
    assert.deepEqual(result.value, { document: 'object', node: 'undefined', answer: 42 });
    const after = await call('browser_tabs');
    assert.deepEqual(after.tabs, before.tabs, 'O diagnóstico deve preservar as páginas abertas.');
    assert.equal(after.activeId, before.activeId);
    console.log(JSON.stringify({ server: client.getServerVersion(), tools: tools.length, eagerTools: tools.length,
      javascript: result.value, sameTabsPreserved: true, tabs: after.tabs.length }, null, 2));
  } finally { await client.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

const vscode = require('vscode');
const assert = require('node:assert/strict');
const { readdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

exports.run = async function () {
  const extension = vscode.extensions.getExtension('gabrielyogi.elektron-browser');
  assert.ok(extension, 'Extension is discoverable in Antigravity');
  assert.equal(extension.packageJSON.displayName, 'Tabyra Browser');
  await extension.activate();
  const commands = await vscode.commands.getCommands();
  assert.ok(commands.includes('elektron.open'));
  for (const command of ['elektron.newTab', 'elektron.connect', 'elektron.toggleAgent', 'elektron.settings']) assert.ok(commands.includes(command));
  assert.equal(extension.packageJSON.contributes.viewsContainers.activitybar[0].id, 'elektron');
  assert.equal(extension.packageJSON.contributes.views.elektron[0].id, 'elektron.launcher');
  await vscode.commands.executeCommand('workbench.view.extension.elektron');
  await vscode.commands.executeCommand('elektron.open');
  const storage = path.join(process.env.ELEKTRON_TEST_DATA, 'User', 'globalStorage', 'gabrielyogi.elektron-browser', 'sessions');
  const files = await readdir(storage);
  const discovery = JSON.parse(await readFile(path.join(storage, files.find(f => f.endsWith('.json'))), 'utf8'));
  async function call(method, args = {}) {
    const response = await fetch(`http://127.0.0.1:${discovery.port}/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${discovery.token}` },
      body: JSON.stringify({ method, args })
    });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  }
  const tabs = await call('tabs');
  assert.equal(tabs.tabs.length, 1);
  await vscode.commands.executeCommand('elektron.newTab');
  assert.equal((await call('tabs')).tabs.length, 2);
  await vscode.commands.executeCommand('elektron.toggleAgent');
  const blocked = await fetch(`http://127.0.0.1:${discovery.port}/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${discovery.token}` }, body: JSON.stringify({ method: 'tabs', args: {} })
  });
  assert.equal(blocked.status, 400);
  await vscode.commands.executeCommand('elektron.toggleAgent');
  const screenshot = await call('screenshot');
  assert.equal(screenshot.type, 'image');
  const previousClipboard = await vscode.env.clipboard.readText();
  try {
    await vscode.commands.executeCommand('elektron.copyMcpConfig');
    const config = JSON.parse(await vscode.env.clipboard.readText());
    const antigravity = vscode.env.appName.toLowerCase().includes('antigravity');
    const entry = (config.mcpServers || config.servers)['elektron-browser'];
    assert.ok(entry.args[0].endsWith('mcp.cjs'));
    if (antigravity) {
      assert.equal(Object.keys(entry.tools).length, 16);
      assert.ok(Object.values(entry.tools).every(tool => tool.eager === true));
    } else {
      assert.equal(entry.type, 'stdio');
      assert.equal(entry.tools, undefined);
    }
    const client = new Client({ name: 'elektron-host-test', version: '1.0.0' });
    try {
      await client.connect(new StdioClientTransport({ command: entry.command, args: entry.args, env: entry.env, stderr: 'pipe' }));
      assert.equal((await client.listTools()).tools.length, 16);
      const evaluated = await client.callTool({ name: 'browser_evaluate', arguments: { script: '() => ({ url: location.href, node: typeof process })' } });
      assert.ok(!evaluated.isError, evaluated.content[0]?.text);
      assert.deepEqual(JSON.parse(evaluated.content[0].text).value, { url: 'about:blank', node: 'undefined' });
      assert.equal((await client.callTool({ name: 'browser_tabs', arguments: {} })).isError, undefined);
    } finally { await client.close(); }
  } finally { await vscode.env.clipboard.writeText(previousClipboard); }
  await vscode.commands.executeCommand('elektron.stop');
  await assert.rejects(readFile(path.join(storage, files[0])));
  const result = { app: vscode.env.appName, version: vscode.version, extension: extension.packageJSON.version, launcher: true, commands: true, tabs: true, pause: true, browser: true, bridge: true, mcpConfig: true, electronMcpRuntime: true, shutdown: true };
  await writeFile(path.join(process.env.ELEKTRON_TEST_DATA, 'result.json'), JSON.stringify(result, null, 2));
};

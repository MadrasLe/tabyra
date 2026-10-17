const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, writeFile, cp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parse } = require('jsonc-parser');
const execute = promisify(execFile);
const moduleReady = import(pathToFileURL(path.resolve('scripts/install-app.mjs')).href);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tabyra-install-'));
  const home = path.join(root, 'Pessoa com espaços ç'), source = path.join(root, 'release');
  await mkdir(path.join(source, 'sidecars/browser'), { recursive: true });
  await mkdir(path.join(source, 'dist'), { recursive: true });
  await writeFile(path.join(source, 'plugin.json'), JSON.stringify({ name:'elektron-app',displayName:'Tabyra',version:'0.6.0' }));
  await writeFile(path.join(source, 'sidecars/browser/sidecar.json'), JSON.stringify({command:'node',args:['elektron.mjs']}));
  await writeFile(path.join(source, 'sidecars/browser/elektron.mjs'), '// fixture');
  await writeFile(path.join(source, 'dist/mcp.cjs'), '// fixture');
  const tools = [...(await readFile('src/tools.ts','utf8')).matchAll(/tool\('(browser_[a-z_]+)'/g)].map(match=>match[1]);
  await writeFile(path.join(source,'tool-manifest.json'),JSON.stringify(tools));
  return { root,home,source,config:path.join(home,'.gemini/config/config.json'),target:path.join(home,'.gemini/config/plugins/elektron-app'),data:path.join(home,'.gemini/elektron-app') };
}

test('public installer creates current-user paths on a clean profile without adding MCP approvals',async()=>{
  const f=await fixture();
  try {
    const {installApp}=await moduleReady;const result=await installApp(f);
    const config=JSON.parse(await readFile(f.config,'utf8'));
    assert.deepEqual(config,{plugins:{'elektron-app':{enabled:true}},sidecars:{'elektron-app/browser':{enabled:true}}});
    assert.equal(result.addedAutoApproval,false);
    const mcp=JSON.parse(await readFile(path.join(f.target,'mcp_config.json'),'utf8')).mcpServers['elektron-app'];
    assert.deepEqual(mcp.args,[path.join(f.target,'dist/mcp.cjs'),path.join(f.data,'session.json')]);
    assert.equal(Object.keys(mcp.tools).length,16);
    const sidecar=JSON.parse(await readFile(path.join(f.target,'sidecars/browser/sidecar.json'),'utf8'));
    assert.equal(sidecar.env.ELEKTRON_APP_DATA_DIR,f.data);
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('Tabyra upgrade preserves legacy profile bytes, pairing, pause and unrelated JSONC settings',async()=>{
  const f=await fixture();
  try {
    await mkdir(f.target,{recursive:true});await mkdir(path.join(f.data,'profile-chrome'),{recursive:true});
    await writeFile(path.join(f.target,'plugin.json'),'{"name":"elektron-app","version":"0.5.0"}');
    const original='// keep my settings\n'+JSON.stringify({plugins:{'elektron-app':{enabled:false},other:{enabled:true}},sidecars:{other:{enabled:true}},mcpServers:{other:{command:'untouched'}},userSettings:{globalPermissionGrants:{allow:['mcp(elektron-app_elektron-app/*)','mcp(other/*)'],ask:['mcp(private/*)'],deny:['mcp(untrusted/*)']},theme:'dark'}},null,2);
    await writeFile(f.config,original);
    const profile=Buffer.from('existing-profile-bytes\0\xff','binary');await writeFile(path.join(f.data,'profile-marker'),profile);
    const settings='{"economy":false,"agentEnabled":false,"mode":"chrome"}';await writeFile(path.join(f.data,'settings.json'),settings);
    const pairing=JSON.stringify({port:23456,token:'a'.repeat(64)});await writeFile(path.join(f.data,'profile-chrome/chrome-connection.json'),pairing);
    const {installApp}=await moduleReady;const result=await installApp(f);
    assert.deepEqual(await readFile(path.join(f.data,'profile-marker')),profile);
    assert.equal(await readFile(path.join(f.data,'settings.json'),'utf8'),settings);
    assert.equal(await readFile(path.join(f.data,'profile-chrome/chrome-connection.json'),'utf8'),pairing);
    const expected=parse(original);expected.plugins['elektron-app'].enabled=true;expected.sidecars['elektron-app/browser']={enabled:true};
    const updated=await readFile(f.config,'utf8');assert.ok(updated.startsWith('// keep my settings'));assert.deepEqual(parse(updated),expected);
    assert.equal(result.addedAutoApproval,false);
    assert.equal(await readFile(result.backupPath,'utf8'),original);
    assert.equal(JSON.parse(await readFile(path.join(result.previousPluginBackup,'plugin.json'),'utf8')).version,'0.5.0');
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('automatic approval is explicit, idempotent and refuses Ask/Deny conflicts before installing',async()=>{
  const f=await fixture();
  try {
    await mkdir(path.dirname(f.config),{recursive:true});
    const original=JSON.stringify({userSettings:{globalPermissionGrants:{allow:['mcp(other/*)'],deny:['mcp(*)']}}});await writeFile(f.config,original);
    const {installApp}=await moduleReady;await assert.rejects(installApp({...f,allowTools:true}),/Ask\/Deny/);
    assert.equal(await readFile(f.config,'utf8'),original);await assert.rejects(readFile(path.join(f.target,'plugin.json')),{code:'ENOENT'});
    await writeFile(f.config,JSON.stringify({userSettings:{globalPermissionGrants:{allow:['mcp(other/*)'],deny:[]}}}));
    assert.equal((await installApp({...f,allowTools:true})).addedAutoApproval,true);
    assert.equal((await installApp({...f,allowTools:true})).addedAutoApproval,false);
    assert.deepEqual(JSON.parse(await readFile(f.config,'utf8')).userSettings.globalPermissionGrants.allow,['mcp(other/*)','mcp(elektron-app_elektron-app/*)']);
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('bundled App installer runs outside the repository without node_modules and uses the target user profile',async()=>{
  const f=await fixture();
  try {
    await mkdir(f.home,{recursive:true});await cp('dist/install.mjs',path.join(f.source,'install.mjs'));
    const {stdout}=await execute(process.execPath,[path.join(f.source,'install.mjs')],{cwd:f.source,windowsHide:true,env:{...process.env,USERPROFILE:f.home,HOME:f.home},timeout:15000});
    const result=JSON.parse(stdout);assert.equal(result.installed,f.target);assert.equal(result.dataDir,f.data);assert.equal(result.addedAutoApproval,false);
    assert.equal(JSON.parse(await readFile(path.join(f.target,'plugin.json'),'utf8')).displayName,'Tabyra');
  } finally {await rm(f.root,{recursive:true,force:true});}
});

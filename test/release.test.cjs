const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const ready=import(pathToFileURL(path.resolve('scripts/release-files.mjs')).href);

test('distribution guard refuses private sessions, development logs and unsafe archive paths',async()=>{
  const {checkEntries}=await ready;
  for(const name of ['../profile','/absolute.txt','folder\\profile','extension/.env','extension/output/run.log','profiles/Default/Cookies','node_modules/ws/.env','session.json','folder/chrome-connection.json','extension/VALIDATION.md']) assert.throws(()=>checkEntries([{name,data:Buffer.from('private')}]),undefined,name);
  assert.doesNotThrow(()=>checkEntries([{name:'PRIVACY.md',data:Buffer.from('Public contact: abrakasfrosken@gmail.com')}])) ;
});

test('distribution guard detects machine paths and embedded credentials without rejecting runtime token templates',async()=>{
  const {checkEntries}=await ready;
  for(const text of ['C:\\Users\\gabri\\private','C:/Users/gabri/private','Bearer '+'a'.repeat(64),'-----BEGIN PRIVATE KEY-----']) assert.throws(()=>checkEntries([{name:'dist/server.cjs',data:Buffer.from(text)}]));
  assert.doesNotThrow(()=>checkEntries([{name:'dist/server.cjs',data:Buffer.from('Authorization: `Bearer ${state.token}`')}])) ;
});

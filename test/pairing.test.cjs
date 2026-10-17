const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtemp,rm} = require('node:fs/promises');
const os = require('node:os'),path = require('node:path');
const {WebSocket} = require('ws');
const {ChromeRelay} = require('../dist/core.cjs');
let root,relay;
before(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'elektron-pairing-'));relay=new ChromeRelay(root);await relay.start();});
after(async()=>{await relay?.close();await rm(root,{recursive:true,force:true});});
const attempt = token => new Promise((resolve,reject)=>{
  const ws = new WebSocket(JSON.parse(relay.pairing()).endpoint,{origin:'chrome-extension://'+'a'.repeat(32)});
  const timer=setTimeout(()=>{ws.terminate();reject(Error('Handshake timed out'));},3000);
  ws.on('open',()=>ws.send(JSON.stringify({type:'hello',token,tabs:[],version:'0.2.0'})));
  ws.once('message',raw=>{clearTimeout(timer);resolve({message:JSON.parse(raw),ws});});
  ws.once('close',()=>{clearTimeout(timer);resolve({closed:true});});ws.on('error',reject);
});
const close = ws => new Promise(resolve=>{ws.once('close',()=>setTimeout(resolve,30));ws.close();});
test('pairing page exposes no token and rejects foreign origin and Host headers',async()=>{
  const url=new URL(relay.connectionUrl());
  const response=await fetch(url);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const html=await response.text();assert.ok(!html.includes(JSON.parse(relay.pairing()).token));assert.ok(!html.includes(url.hash.slice(5)));
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await fetch(url,{headers:{Origin:'https://untrusted.example'}})).status,404);
  const badHost=await new Promise((resolve,reject)=>{require('node:http').get(url.origin+url.pathname,{headers:{Host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(badHost,404);
});
test('one-click handoff is single-use, exchanges for a saved credential and expires',async()=>{
  const url=new URL(relay.connectionUrl()),key=new URLSearchParams(url.hash.slice(1)).get('key');
  const first=await attempt(key);assert.equal(first.message.type,'ready');assert.equal(first.message.token,JSON.parse(relay.pairing()).token);
  await close(first.ws);assert.equal((await attempt(key)).closed,true);
  const reconnect=await attempt(first.message.token);assert.equal(reconnect.message.type,'ready');assert.equal(reconnect.message.token,undefined);await close(reconnect.ws);
  const expired=new URL(relay.connectionUrl());relay.handoff.expires=Date.now()-1;
  assert.equal((await attempt(new URLSearchParams(expired.hash.slice(1)).get('key'))).closed,true);
});

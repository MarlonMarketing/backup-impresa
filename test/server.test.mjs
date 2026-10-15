import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApplication,passwordHash,passwordMatches} from '../server.mjs';
import {Notifier} from '../lib/notify.mjs';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

test('watchdog checks enabled jobs with copy history and sends one stale alert per day',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'backup-watchdog-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sent=[];
  const app=createApplication({quiet:true,sources:[],env:{DATA_DIR:root,RESTORE_ROOT:path.join(root,'restore')},notifier:{send:async run=>sent.push(run)}});
  t.after(()=>app.close());
  const now=new Date('2026-10-15T12:00:00Z');
  app.store.state.jobs=[{id:'stale',name:'Stale',enabled:true,lastScheduled:{copy:'2026-10-15'},schedule:'00:00',verifyEnabled:false,createdAt:'2026-10-01T00:00:00Z'}];
  app.store.state.runs=[{jobId:'stale',mode:'copy',status:'success',finishedAt:'2026-10-12T00:00:00Z'}];
  await app.tick(now);
  assert.equal(sent.length,1);
  assert.equal(sent[0].mode,'monitor');
  assert.equal(sent[0].status,'failed');
  await app.tick(now);
  assert.equal(sent.length,1);
  app.store.state.jobs[0].lastStaleAlert=null;
  app.store.state.runs.unshift({jobId:'stale',mode:'copy',status:'success',finishedAt:now.toISOString()});
  await app.tick(now);
  assert.equal(sent.length,1);
});

test('native entrypoint starts through a release symlink',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'backup-symlink-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const entry=path.join(root,'server.mjs');fs.symlinkSync(fileURLToPath(new URL('../server.mjs',import.meta.url)),entry);
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,[entry],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:path.join(root,'data'),RESTORE_ROOT:path.join(root,'restores'),BACKUP_SOURCES:'[]'},stdio:'ignore'});
  t.after(async()=>{if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;}});
  let healthy=false;
  for(let i=0;i<40;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok){healthy=true;break;}}catch{}await delay(100);}
  assert(healthy,'Symlink entrypoint exited without starting the HTTP server');
});

test('password con salt e confronto corretto',()=>{
  const hash=passwordHash('password-di-prova-123');assert(passwordMatches('password-di-prova-123',hash));
  assert(!passwordMatches('errata',hash));assert.notEqual(hash,passwordHash('password-di-prova-123'));
});
test('API: primo accesso, login, CSRF, dati riservati, sessione e persistenza',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'backup-api-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const app=createApplication({quiet:true,sources:[],env:{DATA_DIR:root,RESTORE_ROOT:path.join(root,'restore'),TARGET_ROOT:path.join(root,'missing'),SETUP_TOKEN:'un-token-di-prova-lungo-1234'}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  const request=(p,body,headers={})=>fetch(origin+p,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
  assert.equal((await request('/api/status')).status,401);
  let response=await request('/api/setup',{token:'wrong',username:'admin',password:'password-lunga-di-prova'});assert.equal(response.status,400);
  response=await request('/api/setup',{token:'un-token-di-prova-lungo-1234',username:'admin',password:'password-lunga-di-prova'});assert.equal(response.status,200);
  assert(!fs.existsSync(path.join(root,'setup-token')));
  response=await request('/api/login',{username:'admin',password:'errata'});assert.equal(response.status,401);
  response=await request('/api/login',{username:'admin',password:'password-lunga-di-prova'});
  const cookie=response.headers.get('set-cookie').split(';')[0],{csrf}=await response.json();
  assert(cookie.includes('backup_session='));
  response=await request('/api/status',null,{Cookie:cookie});assert.equal(response.status,200);
  const payload=await response.json();assert.equal(payload.target.online,false);assert(!JSON.stringify(payload).includes('password-lunga-di-prova'));
  response=await request('/api/jobs',{id:'a'},{Cookie:cookie});assert.equal(response.status,403);
  response=await request('/api/jobs',{id:'a'},{Cookie:cookie,'X-CSRF-Token':csrf,Origin:'https://evil.example'});assert.equal(response.status,403);
  response=await request('/api/notifications/test',{}, {Cookie:cookie,'X-CSRF-Token':csrf});assert.equal(response.status,200);
  response=await request('/api/logout',{}, {Cookie:cookie,'X-CSRF-Token':csrf});assert.equal(response.status,200);
  assert.equal((await request('/api/status',null,{Cookie:cookie})).status,401);
  const saved=JSON.parse(fs.readFileSync(path.join(root,'state.json'),'utf8'));assert(saved.admin.password.includes(':'));assert(!saved.admin.password.includes('password-lunga-di-prova'));
});
test('notifiche: Telegram e webhook vengono tentati anche se un canale fallisce',async t=>{
  const original=globalThis.fetch,urls=[];t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async url=>{urls.push(String(url));return {ok:false,json:async()=>({ok:false})};};
  const notifier=new Notifier({TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'1',RESULT_WEBHOOK_URL:'https://example.test/result'});
  await assert.rejects(notifier.send({name:'Test',mode:'copy',status:'failed',error:'Errore prova'}));
  assert.equal(urls.length,2);assert.equal(notifier.last.telegram.ok,false);assert.equal(notifier.last.webhook.ok,false);
});

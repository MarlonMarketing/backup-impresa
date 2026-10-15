// Run only on an isolated CI Linux/systemd host after the native installer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const base='http://127.0.0.1:9899';
let online=false;
for(let i=0;i<40;i++){
  try{if((await fetch(base+'/api/health')).ok){online=true;break;}}catch{}
  await delay(500);
}
assert(online,'Native service did not become healthy');
const password=crypto.randomBytes(24).toString('hex');
let cookie='',csrf='';
async function api(route,body){
 const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});
 const result=await response.json();assert(response.ok,result.error||`HTTP ${response.status}`);return {response,result};
}
await api('/api/setup',{token:fs.readFileSync('/var/lib/backup-impresa/setup-token','utf8').trim(),username:'ci-native',password});
const login=await api('/api/login',{username:'ci-native',password});
cookie=login.response.headers.get('set-cookie').split(';')[0];csrf=login.result.csrf;
await api('/api/jobs',{id:'native-smoke',name:'Native smoke test',sourceId:'files',time:'18:00',enabled:false,verifyEnabled:false,verifyDay:0,verifyTime:'12:30'});
for(const mode of ['copy','verify','restore']){
 const {result}=await api('/api/run',{jobId:'native-smoke',mode,...(mode==='restore'?{relative:'sample.txt'}:{})});
 let finished;
 for(let i=0;i<100;i++){
  const state=(await api('/api/status')).result;
  const run=state.runs.find(r=>r.id===result.run.id);
  if(run&&['success','failed','interrupted'].includes(run.status)){finished=run;break;}
  await delay(100);
 }
 assert(finished,`${mode} did not finish`);assert.equal(finished.status,'success',finished.error);
 if(mode==='restore')assert.equal(fs.readFileSync(finished.restorePath+'/sample.txt','utf8'),'Native installation test\n');
}
assert.equal(fs.readFileSync('/srv/backup-impresa/target/current/native-smoke/sample.txt','utf8'),'Native installation test\n');
console.log('Native systemd: health, authentication, rsync copy, verification and recovery passed.');

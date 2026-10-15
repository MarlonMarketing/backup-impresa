import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Engine, Store, safeExisting, mkdirSafe, rsyncArgs, rsyncProcess, dueJobs, validateJob } from '../lib/core.mjs';

function fixture(t,options={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'backup-impresa-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),target=path.join(root,'target'),restore=path.join(root,'restore'),data=path.join(root,'data');
  for(const dir of [source,target,restore,data])fs.mkdirSync(dir);
  fs.writeFileSync(path.join(target,'.backup-impresa-target'),'test-v1');
  const store=new Store(data),sources=[{id:'demo',name:'Prova',path:source,requiredPaths:['foto.txt']}];
  const job=validateJob({id:'demo',name:'Demo',sourceId:'demo'},sources);store.state.jobs.push(job);store.save();
  fs.writeFileSync(path.join(source,'foto.txt'),'prima fotografia');
  const engine=new Engine({store,sources,targetRoot:target,targetId:'test-v1',restoreRoot:restore,dataDir:data,minFreeBytes:0,...options});
  return{root,source,target,restore,data,store,engine,job};
}
async function finish(engine){const start=Date.now();while(engine.queue.length||engine.active){if(Date.now()-start>30000)throw Error('Timeout test');await new Promise(r=>setTimeout(r,10));}}
test('i percorsi non possono uscire dalla cartella consentita',t=>{
  const f=fixture(t);assert.throws(()=>safeExisting(f.source,'../target'));assert.throws(()=>mkdirSafe(f.target,'../source'));
});
test('symlink e directory simboliche verso altri volumi vengono rifiutati',{skip:process.platform==='win32'},t=>{
  const f=fixture(t);fs.symlinkSync(f.source,path.join(f.target,'current'));
  assert.throws(()=>mkdirSafe(f.target,'current/demo'));fs.symlinkSync(f.target,path.join(f.source,'fuori'));
  assert.throws(()=>safeExisting(f.source,'fuori'));
});
test('nessuna opzione delete, inplace o conservazione proprietari nelle copie',()=>{
  const args=rsyncArgs('copy','/sources/foto;echo x','/target/current','/target/versions');
  assert(args.includes('--backup'));assert(args.includes('--no-owner'));assert(args.includes('--no-group'));
  assert(!args.includes('--delete'));assert(!args.includes('--inplace'));assert(args.includes('/sources/foto;echo x/'));
  assert(rsyncArgs('verify','a','b','').includes('--checksum'));
});
test('disco assente o marker errato bloccano le scritture prima del trasferimento',async t=>{
  let called=false;const f=fixture(t,{runner:async()=>{called=true;return{diffCount:0};}});
  fs.unlinkSync(path.join(f.target,'.backup-impresa-target'));f.engine.enqueue(f.job,'copy');await finish(f.engine);
  assert.equal(called,false);assert.equal(f.store.state.runs[0].status,'failed');assert(!fs.existsSync(path.join(f.target,'current')));
});
test('spazio insufficiente blocca la copia senza avviare rsync',async t=>{
  let called=false;const f=fixture(t,{minFreeBytes:100,statfs:()=>({bavail:1,bsize:1,blocks:1000}),runner:async()=>{called=true;}});
  f.engine.enqueue(f.job,'copy');await finish(f.engine);assert.equal(called,false);assert.equal(f.store.state.runs[0].status,'failed');
});
test('la stima dei file nuovi evita una copia troppo grande per il disco',async t=>{
  let calls=0;const f=fixture(t,{statfs:()=>({bavail:100,bsize:1,blocks:1000}),runner:async(args,line)=>{
    calls++;line('Total transferred file size: 1,000 bytes');return{diffCount:0};
  }});
  f.engine.enqueue(f.job,'copy');await finish(f.engine);assert.equal(calls,1);assert.equal(f.store.state.runs[0].status,'failed');
});
test('un marker sbagliato e una sorgente non montata vengono rifiutati',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.target,'.backup-impresa-target'),'altro-disco');assert.throws(()=>f.engine.targetCheck(),/identificativo/);
  fs.unlinkSync(path.join(f.source,'foto.txt'));assert.throws(()=>f.engine.sourceCheck(f.job));
});
test('il cambio sorgente di un lavoro esistente è impedito',t=>{
  const f=fixture(t);assert.throws(()=>validateJob({...f.job,sourceId:'altra'},[...f.engine.sources,{id:'altra'}],f.job),/nuovo lavoro/);
});
test('un errore del processo non viene segnato come successo',async t=>{
  const f=fixture(t,{runner:async()=>{throw Error('errore simulato rsync23');}});f.engine.enqueue(f.job,'copy');await finish(f.engine);
  assert.equal(f.store.state.runs[0].status,'failed');assert.match(f.store.state.runs[0].error,/rsync23/);
});
test('una verifica con differenze non viene segnata come riuscita',async t=>{
  const f=fixture(t,{runner:async()=>({diffCount:1})});fs.mkdirSync(path.join(f.target,'current','demo'),{recursive:true});
  f.engine.enqueue(f.job,'verify');await finish(f.engine);assert.equal(f.store.state.runs[0].status,'failed');
});
test('esecuzioni sovrapposte dello stesso lavoro sono rifiutate',async t=>{
  const f=fixture(t,{runner:async()=>({diffCount:0})});f.engine.enqueue(f.job,'copy');assert.throws(()=>f.engine.enqueue(f.job,'copy'),/già/);await finish(f.engine);
});
test('le esecuzioni interrotte non risultano riuscite dopo il riavvio',t=>{
  const f=fixture(t);f.store.state.runs.push({id:'test',status:'running'});f.store.save();
  const recovered=new Store(f.data);assert.equal(recovered.state.runs.at(-1).status,'interrupted');
});
test('il recupero non parte se i file selezionati superano lo spazio disponibile',async t=>{
  let calls=0;const f=fixture(t,{statfs:p=>({bavail:p===f.restore?1:100000,bsize:1,blocks:100000}),runner:async()=>{calls++;return{diffCount:0};}});
  const current=path.join(f.target,'current','demo');fs.mkdirSync(current,{recursive:true});fs.writeFileSync(path.join(current,'grande.txt'),'file troppo grande per un byte');
  f.engine.enqueue(f.job,'restore',{relative:'grande.txt'});await finish(f.engine);assert.equal(calls,0);assert.equal(f.store.state.runs[0].status,'failed');
});
test('pianificazione locale, recupero della giornata e protezione dalla doppia esecuzione DST',()=>{
  const job={id:'demo',enabled:true,time:'02:30',lastScheduled:{}};
  const first=dueJobs([job],new Date('2026-10-25T00:30:00Z'),'Europe/Budapest');assert.equal(first.length,1);
  job.lastScheduled.copy=first[0].date;
  assert.equal(dueJobs([job],new Date('2026-10-25T01:30:00Z'),'Europe/Budapest').length,0);
  assert.equal(dueJobs([{...job,lastScheduled:{}}],new Date('2026-10-25T18:00:00Z'),'Europe/Budapest').length,1);
});
test('dump assente o vecchio blocca una sorgente che richiede il database',t=>{
  const f=fixture(t);f.engine.sources[0].dumpDirectory='backups';fs.mkdirSync(path.join(f.source,'backups'));
  assert.throws(()=>f.engine.sourceCheck(f.job),/Dump/);
  const dump=path.join(f.source,'backups','dump.sql.gz');fs.writeFileSync(dump,'fixture');
  fs.utimesSync(dump,new Date(0),new Date(0));assert.throws(()=>f.engine.sourceCheck(f.job),/vecchio/);
});
test('fallimento notifiche è visibile senza cambiare il successo del backup',async t=>{
  const f=fixture(t,{runner:async()=>({diffCount:0}),notify:async()=>{throw Error('SMTP indisponibile');}});
  f.engine.enqueue(f.job,'copy');await finish(f.engine);const run=f.store.state.runs[0];
  assert.equal(run.status,'success');assert.match(run.notificationError,/SMTP/);assert(f.store.state.alerts.length);
});
const rsyncAvailable=spawnSync('rsync',['--version']).status===0;
test('rsync reale: copia incrementale, due versioni, file eliminato conservato, verifica e recupero',{skip:!rsyncAvailable},async t=>{
  const f=fixture(t);
  const preview=f.engine.enqueue(f.job,'preview');await finish(f.engine);assert.equal(preview.status,'success');
  assert(!fs.existsSync(path.join(f.target,'current')),'simulazione non crea la copia');
  const a=f.engine.enqueue(f.job,'copy');await finish(f.engine);assert.equal(a.status,'success');
  const current=path.join(f.target,'current','demo','foto.txt');assert.equal(fs.readFileSync(current,'utf8'),'prima fotografia');
  fs.writeFileSync(path.join(f.source,'foto.txt'),'seconda fotografia più lunga');
  const b=f.engine.enqueue(f.job,'copy');await finish(f.engine);assert.equal(b.status,'success');
  assert.equal(fs.readFileSync(path.join(f.target,'versions','demo',b.id,'foto.txt'),'utf8'),'prima fotografia');
  fs.writeFileSync(path.join(f.source,'foto.txt'),'terza fotografia ancora diversa e lunga');
  const c=f.engine.enqueue(f.job,'copy');await finish(f.engine);assert.equal(c.status,'success');
  assert.equal(fs.readFileSync(path.join(f.target,'versions','demo',c.id,'foto.txt'),'utf8'),'seconda fotografia più lunga');
  const good=f.engine.enqueue(f.job,'verify');await finish(f.engine);assert.equal(good.status,'success');
  // Same byte length and same timestamp: --checksum must still detect corruption.
  const stat=fs.statSync(current),buf=fs.readFileSync(current);buf[0]=buf[0]===65?66:65;fs.writeFileSync(current,buf);fs.utimesSync(current,stat.atime,stat.mtime);
  const bad=f.engine.enqueue(f.job,'verify');await finish(f.engine);assert.equal(bad.status,'failed');assert(bad.diffCount>0);
  const recovery=f.engine.enqueue(f.job,'restore',{relative:'foto.txt',versionId:b.id});await finish(f.engine);
  assert.equal(recovery.status,'success');assert.equal(fs.readFileSync(path.join(recovery.restorePath,'foto.txt'),'utf8'),'prima fotografia');
  const folderRecovery=f.engine.enqueue(f.job,'restore',{relative:'',versionId:c.id});await finish(f.engine);assert.equal(folderRecovery.status,'success');
  fs.unlinkSync(path.join(f.source,'foto.txt'));f.engine.sources[0].requiredPaths=[];
  const removed=f.engine.enqueue(f.job,'copy');await finish(f.engine);assert.equal(removed.status,'success');assert(fs.existsSync(current));
});
test('processo rsync fallito restituisce errore',{skip:!rsyncAvailable},async()=>{
  await assert.rejects(rsyncProcess(['--not-a-real-option'],()=>{}),/codice/);
});

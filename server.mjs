import http from 'node:http';
import {localizePayload} from './lib/i18n.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store, Engine, validateJob, dueJobs, idPattern } from './lib/core.mjs';
import { Notifier } from './lib/notify.mjs';

const base=path.dirname(fileURLToPath(import.meta.url));
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
export function passwordHash(password,salt=crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
}
export function passwordMatches(password,stored) {
  try { const [salt,key]=stored.split(':'); const actual=passwordHash(password,salt).split(':')[1];
    return crypto.timingSafeEqual(Buffer.from(key,'hex'),Buffer.from(actual,'hex')); } catch{return false;}
}
export function createApplication(options={}) {
  const env=options.env||process.env;
  const dataDir=path.resolve(env.DATA_DIR||'/data');
  const store=options.store||new Store(dataDir);
  const sources=options.sources||JSON.parse(env.BACKUP_SOURCES||'[]');
  for(const source of sources){
    if(!idPattern.test(source.id||'')||!path.isAbsolute(source.path)||!source.name)throw Error('Configurazione sorgenti non valida');
    if(!options.sources && !path.resolve(source.path).startsWith(path.resolve('/sources')+path.sep))throw Error('Sorgenti consentite solo sotto /sources');
  }
  const timezone=env.TZ||'Europe/Budapest';
  new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date());
  const notifier=options.notifier||new Notifier(env);
  const engine=options.engine||new Engine({store,sources,dataDir,targetRoot:env.TARGET_ROOT||'/destinations/usb',
    targetId:env.TARGET_ID||'impresa-usb-v1',restoreRoot:env.RESTORE_ROOT||'/restores',
    minFreeBytes:Number(env.MIN_FREE_GB??10)*1024**3,notify:run=>notifier.send(run)});
  const tokenFile=path.join(dataDir,'setup-token');
  let setupToken='';
  if(!store.state.admin){
    setupToken=env.SETUP_TOKEN|| (fs.existsSync(tokenFile)?fs.readFileSync(tokenFile,'utf8').trim():crypto.randomBytes(24).toString('hex'));
    if(setupToken.length<20)throw Error('SETUP_TOKEN deve avere almeno 20 caratteri');
    fs.writeFileSync(tokenFile,setupToken,{mode:0o600});
    if(!options.quiet)console.log(`Primo accesso: leggere /data/setup-token nella console del container. Non condividere il token.`);
  }
  const sessions=new Map(), attempts=new Map();
  let timer,watchdogBusy=false;
  const cookieSecure=env.COOKIE_SECURE==='true';
  function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(localizePayload(body,res.backupLanguage)));}
  async function readBody(req){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('Richiesta troppo grande');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw Error('JSON non valido');}
  }
  function session(req){
    const value=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('backup_session='))?.slice(15);
    const item=sessions.get(value);
    if(!item||item.expires<Date.now()){if(item)sessions.delete(value);return null;}return {...item,key:value};
  }
  function sameOrigin(req){
    if(req.headers['sec-fetch-site']==='cross-site')return false;
    if(req.headers.origin){try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
    return true;
  }
  function rateLimit(req){
    const key=req.socket.remoteAddress||'unknown',now=Date.now();
    const entry=attempts.get(key)||{since:now,count:0};
    if(now-entry.since>15*60000){entry.since=now;entry.count=0;}
    entry.count++;attempts.set(key,entry);
    if(attempts.size>1000)for(const[k,v]of attempts)if(now-v.since>15*60000)attempts.delete(k);
    return entry.count<=15;
  }
  const server=http.createServer(async(req,res)=>{
    res.backupLanguage=req.headers['accept-language']||'en';
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const url=new URL(req.url,'http://localhost');
    try{
      if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{status:'ok',version:'0.1.4'});
      if(req.method==='GET'&&url.pathname==='/api/auth'){
        const current=session(req);return send(res,200,{setup:!store.state.admin,authenticated:Boolean(current),csrf:current?.csrf||null});
      }
      if(req.method==='POST'&&['/api/login','/api/setup'].includes(url.pathname)){
        if(!sameOrigin(req))return send(res,403,{error:'Origine non consentita'});
        if(!rateLimit(req))return send(res,429,{error:'Troppi tentativi. Riprovare tra 15 minuti.'});
        const body=await readBody(req);
        if(url.pathname==='/api/setup'){
          if(store.state.admin)throw Error('Primo accesso già completato');
          if(typeof body.token!=='string'||!crypto.timingSafeEqual(crypto.createHash('sha256').update(body.token).digest(),crypto.createHash('sha256').update(setupToken).digest()))throw Error('Token non valido');
          if(typeof body.username!=='string'||!/^[a-zA-Z0-9_.-]{3,40}$/.test(body.username))throw Error('Nome utente da 3 a 40 caratteri');
          if(typeof body.password!=='string'||body.password.length<12||body.password.length>200)throw Error('Password da 12 a 200 caratteri');
          store.state.admin={username:body.username,password:passwordHash(body.password)};store.save();
          fs.rmSync(tokenFile,{force:true}); setupToken='';return send(res,200,{ok:true});
        }
        const valid=typeof body.password==='string'&&body.password.length<=200&&body.username===store.state.admin?.username&&passwordMatches(body.password,store.state.admin.password);
        if(!valid)return send(res,401,{error:'Credenziali non valide'});
        for(const[k,v]of sessions)if(v.expires<Date.now())sessions.delete(k);
        const key=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');
        sessions.set(key,{csrf,expires:Date.now()+8*3600000});
        res.setHeader('Set-Cookie',`backup_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${cookieSecure?'; Secure':''}`);
        return send(res,200,{ok:true,csrf});
      }
      if(!url.pathname.startsWith('/api/')){
        const routes={'/':'index.html','/i18n.js':'i18n.js','/app.js':'app.js','/style.css':'style.css'};
        const file=routes[url.pathname];if(!file||req.method!=='GET')return send(res,404,{error:'Non trovato'});
        res.writeHead(200,{'Content-Type':contentTypes[path.extname(file)],'Cache-Control':'no-cache'});
        return fs.createReadStream(path.join(base,'public',file)).pipe(res);
      }
      const auth=session(req);if(!auth)return send(res,401,{error:'Accesso richiesto'});
      if(req.method!=='GET'&&(!sameOrigin(req)||req.headers['x-csrf-token']!==auth.csrf))return send(res,403,{error:'Richiesta non valida. Ricaricare la pagina.'});
      if(req.method==='POST'&&url.pathname==='/api/logout'){
        sessions.delete(auth.key);res.setHeader('Set-Cookie','backup_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});
      }
      if(req.method==='GET'&&url.pathname==='/api/status'){
        let target;try{target={online:true,...engine.targetCheck()};delete target.root;}catch(e){target={online:false,error:e.message};}
        return send(res,200,{version:'0.1.4',timezone,pilot:env.PILOT_MODE==='true',targetName:env.TARGET_NAME||'Backup destination',sources:sources.map(s=>({id:s.id,name:s.name})),
          target,jobs:store.state.jobs,runs:store.state.runs.slice(0,200),alerts:store.state.alerts,
          active:engine.active,notifications:notifier.channels(),policies:{delete:false,versions:'Conservate tutte; nessuna pulizia automatica',catchup:'Esegue il lavoro giornaliero arretrato della giornata alla riaccensione'}});
      }
      if(req.method==='POST'&&url.pathname==='/api/jobs'){
        const body=await readBody(req),existing=store.state.jobs.find(j=>j.id===body.id);
        if(existing&&store.state.runs.some(r=>r.jobId===existing.id&&['running','queued'].includes(r.status)))throw Error('Attendere la fine del lavoro prima di modificarlo');
        const job=validateJob(body,sources,existing);
        if(!existing&&store.state.jobs.length>=30)throw Error('Massimo 30 lavori');
        if(existing)store.state.jobs[store.state.jobs.indexOf(existing)]=job;else store.state.jobs.push(job);
        store.save();return send(res,200,{job});
      }
      if(req.method==='POST'&&url.pathname==='/api/run'){
        const body=await readBody(req),job=store.state.jobs.find(j=>j.id===body.jobId);
        if(!job)throw Error('Lavoro non trovato');
        if(body.mode==='restore'&&typeof body.relative!=='string')throw Error('Percorso recupero obbligatorio');
        const run=engine.enqueue(job,body.mode,{relative:body.relative,versionId:body.versionId});return send(res,202,{run});
      }
      if(req.method==='GET'&&url.pathname==='/api/log')return send(res,200,{text:engine.log(url.searchParams.get('id'))});
      if(req.method==='GET'&&url.pathname==='/api/files'){
        const jobId=url.searchParams.get('jobId');if(!store.state.jobs.some(j=>j.id===jobId))throw Error('Lavoro non trovato');
        return send(res,200,{files:engine.browse(jobId,url.searchParams.get('versionId'),url.searchParams.get('path')||''),versions:engine.versions(jobId)});
      }
      if(req.method==='POST'&&url.pathname==='/api/notifications/test')return send(res,200,await notifier.send({name:'Prova manuale',mode:'test',status:'success',finishedAt:new Date().toISOString()},true));
      return send(res,404,{error:'Operazione non disponibile'});
    }catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.end();}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  async function tick(now=new Date()){
    for(const {job,mode,date}of dueJobs(store.state.jobs,now,timezone)){
      if(store.state.runs.some(r=>r.jobId===job.id&&['queued','running'].includes(r.status)))continue;
      try{engine.enqueue(job,mode,{},'schedule');job.lastScheduled[mode]=date;store.save();}
      catch(e){store.alert(`Pianificazione ${job.name}: ${e.message}`);}
    }
    // A second, independent check within the application detects failed/stale copies.
    // It cannot detect this application itself being down: external monitoring is still needed.
    if(watchdogBusy)return;watchdogBusy=true;
    try{
      for(const job of store.state.jobs.filter(j=>j.enabled)){
        const copies=store.state.runs.filter(r=>r.jobId===job.id&&r.mode==='copy');
        const last=copies.find(r=>r.status==='success');
        const since=last?.finishedAt||job.createdAt;
        const key=now.toISOString().slice(0,10);
        if(now-new Date(since)>30*3600000&&job.lastStaleAlert!==key){
          job.lastStaleAlert=key;store.save();
          const message=`Nessuna copia riuscita nelle ultime 30 ore: ${job.name}`;
          store.alert(message);
          try{await notifier.send({name:job.name,mode:'monitor',status:'failed',error:message,finishedAt:now.toISOString()});}
          catch(e){store.alert(`Notifica controllo: ${e.message}`);}
        }
      }
    }finally{watchdogBusy=false;}
  }
  function startScheduler(){timer=setInterval(()=>tick().catch(e=>store.alert(e.message)),60000);timer.unref();tick().catch(e=>store.alert(e.message));}
  return {server,store,engine,tick,startScheduler,close:()=>{clearInterval(timer);server.close();}};
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApplication();app.server.listen(Number(process.env.PORT||9899),process.env.HOST||'0.0.0.0',()=>{
    console.log('Backup Impresa 0.1.4 in ascolto');app.startScheduler();
  });
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;app.close();
    const wait=setInterval(()=>{if(!app.engine.active){clearInterval(wait);process.exit(0);}},500);wait.unref();
    if(!app.engine.active)process.exit(0);
    setTimeout(()=>process.exit(1),25000).unref();
  };
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}

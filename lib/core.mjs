import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export const idPattern = /^[a-z][a-z0-9-]{0,39}$/;
export function within(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export function safeExisting(root, relative = '') {
  const candidate = path.resolve(root, relative);
  if (!within(root, candidate)) throw Error('Percorso fuori dalla cartella consentita');
  const real = fs.realpathSync(candidate);
  if (!within(fs.realpathSync(root), real)) throw Error('Collegamento simbolico fuori dalla cartella consentita');
  if (fs.lstatSync(candidate).isSymbolicLink()) throw Error('Collegamento simbolico non consentito');
  return real;
}
export function mkdirSafe(root, relative) {
  let current = safeExisting(root);
  for (const part of relative.split('/').filter(Boolean)) {
    if (part === '.' || part === '..' || part.includes('\\')) throw Error('Percorso non valido');
    current = path.join(current, part);
    try { fs.mkdirSync(current); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    if (fs.lstatSync(current).isSymbolicLink() || !fs.statSync(current).isDirectory()) throw Error('Destinazione non sicura');
  }
  return current;
}
async function fileDigest(file) {
  const hash=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
async function restoreBytes(file, limit) {
  const pending=[file];let total=0;
  while(pending.length){
    const current=pending.pop(),stat=await fs.promises.lstat(current);
    if(stat.isSymbolicLink())continue;
    if(stat.isDirectory())for(const entry of await fs.promises.readdir(current))pending.push(path.join(current,entry));
    else if(stat.isFile())total+=stat.size;
    if(total>limit)throw Error('Spazio insufficiente nel volume di recupero per i file selezionati');
  }
  return total;
}
export class Store {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, 'state.json');
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { schema: 1, admin: null, jobs: [], runs: [], alerts: [] };
    if (this.state.schema !== 1) throw Error('Versione archivio non supportata');
    for (const run of this.state.runs) if (['queued', 'running'].includes(run.status)) {
      run.status = 'interrupted'; run.finishedAt = new Date().toISOString(); run.error = 'Servizio riavviato: esecuzione non completata';
    }
    this.save();
  }
  save() {
    const tmp = `${this.file}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.state, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
  }
  alert(message) {
    this.state.alerts.unshift({ at: new Date().toISOString(), message });
    this.state.alerts = this.state.alerts.slice(0, 100); this.save();
  }
}
export function validateJob(input, sources, existing) {
  const id = existing?.id ?? input.id;
  if (!idPattern.test(id || '')) throw Error('ID: lettere minuscole, numeri e trattini; deve iniziare con una lettera');
  if (!sources.some(s => s.id === input.sourceId)) throw Error('Sorgente non disponibile');
  if (existing && existing.sourceId !== input.sourceId) throw Error('Per cambiare sorgente creare un nuovo lavoro: le copie non devono mescolarsi');
  const name = String(input.name || '').trim();
  if (!name || name.length > 100) throw Error('Nome obbligatorio, massimo 100 caratteri');
  const time = input.time || '18:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Orario non valido');
  const verifyTime = input.verifyTime || '12:30';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(verifyTime)) throw Error('Orario verifica non valido');
  const verifyDay = Number(input.verifyDay ?? 0);
  if (!Number.isInteger(verifyDay) || verifyDay < 0 || verifyDay > 6) throw Error('Giorno verifica non valido');
  return { id, name, sourceId: input.sourceId, time, enabled: input.enabled === true,
    verifyEnabled: input.verifyEnabled === true, verifyTime, verifyDay,
    lastScheduled: existing?.lastScheduled ?? {}, lastStaleAlert:existing?.lastStaleAlert, createdAt: existing?.createdAt ?? new Date().toISOString() };
}
export function localClock(date, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(date).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`,
    weekday: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday) };
}
export function dueJobs(jobs, date, timezone) {
  const clock = localClock(date, timezone), due = [];
  for (const job of jobs) {
    if (job.enabled && clock.time >= job.time && job.lastScheduled?.copy !== clock.date) due.push({job, mode: 'copy', date: clock.date});
    if (job.verifyEnabled && clock.weekday === job.verifyDay && clock.time >= job.verifyTime && job.lastScheduled?.verify !== clock.date) due.push({job, mode: 'verify', date: clock.date});
  }
  return due;
}
export function rsyncArgs(mode, source, destination, versionDir) {
  const args = ['--recursive', '--times', '--modify-window=1', '--no-perms', '--no-owner', '--no-group', '--omit-dir-times',
    '--no-links', '--safe-links', '--itemize-changes', '--out-format=%i %n%L', '--stats'];
  if (mode === 'copy') args.push('--backup', `--backup-dir=${versionDir}`, '--delay-updates');
  else args.push('--dry-run');
  if (mode === 'verify') args.push('--checksum');
  args.push('--', source.replace(/[\\/]$/, '') + '/', destination.replace(/[\\/]$/, '') + '/');
  return args;
}
export function rsyncProcess(args, onLine, { binary = 'rsync', timeoutMs = 24*3600*1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, env: { ...process.env, LC_ALL: 'C', LANG: 'C' } });
    let remaining = '', diffCount = 0, ended = false, timedOut = false;
    const consume = text => {
      remaining += text;
      if (remaining.length > 1024*1024) remaining = remaining.slice(-1024*1024);
      const lines = remaining.split(/\r?\n/); remaining = lines.pop();
      for (const line of lines) { if (/^[<>ch.*][fdLDS]/.test(line)) diffCount++; onLine(line); }
    };
    child.stdout.setEncoding('utf8').on('data', consume);
    // Keep stdout framing independent from stderr.
    child.stderr.setEncoding('utf8').on('data', text => onLine(`[stderr] ${text.trim()}`));
    const timer = setTimeout(() => {
      timedOut = true; child.kill('SIGTERM');
      setTimeout(() => { if (!ended) child.kill('SIGKILL'); }, 5000).unref();
    }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', (code, signal) => {
      ended = true; clearTimeout(timer);
      if (remaining) { if (/^[<>ch.*][fdLDS]/.test(remaining)) diffCount++; onLine(remaining); }
      if (timedOut) reject(Error('Tempo massimo superato: trasferimento interrotto'));
      else if (code !== 0) reject(Error(`rsync terminato con codice ${code ?? signal}; consultare il log`));
      else resolve({ code, diffCount });
    });
  });
}
export class Engine {
  constructor({ store, sources, targetRoot, targetId, restoreRoot, dataDir, minFreeBytes = 10*1024**3,
    runner = rsyncProcess, notify = async()=>{}, statfs = fs.statfsSync }) {
    Object.assign(this, { store, sources, targetRoot, targetId, restoreRoot, dataDir, minFreeBytes, runner, notify, statfs });
    this.queue = []; this.active = null;
    fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(restoreRoot, { recursive: true });
  }
  targetCheck() {
    const root = safeExisting(this.targetRoot);
    const marker = safeExisting(root, '.backup-impresa-target');
    if (fs.readFileSync(marker, 'utf8').trim() !== this.targetId) throw Error('Disco di destinazione assente o identificativo errato');
    const space = this.statfs(root);
    return { root, free: Number(space.bavail)*Number(space.bsize), total: Number(space.blocks)*Number(space.bsize) };
  }
  sourceCheck(job) {
    const config = this.sources.find(s => s.id === job.sourceId);
    if (!config) throw Error('Sorgente non configurata');
    const source = safeExisting(config.path);
    if (within(source, this.targetRoot) || within(this.targetRoot, source)) throw Error('Sorgente e destinazione sovrapposte');
    for (const relative of config.requiredPaths || []) safeExisting(source, relative);
    if (config.dumpDirectory) {
      const dir = safeExisting(source, config.dumpDirectory);
      const dumps = fs.readdirSync(dir).filter(n => n.endsWith('.sql.gz')).map(n => fs.statSync(safeExisting(dir,n)).mtimeMs);
      if (!dumps.length || Date.now()-Math.max(...dumps) > (config.maxDumpAgeHours || 26)*3600000)
        throw Error('Dump database assente o troppo vecchio: aggiornare il dump prima della copia');
    }
    return source;
  }
  enqueue(job, mode, extra = {}, trigger = 'manual') {
    if (!['copy','preview','verify','restore'].includes(mode)) throw Error('Operazione non valida');
    if (this.store.state.runs.some(r => r.jobId === job.id && ['queued','running'].includes(r.status))) throw Error('Questo lavoro ha già una esecuzione in corso o in coda');
    if (this.queue.length >= 20) throw Error('Coda piena');
    const id = `${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`;
    const run = { id, jobId: job.id, name: job.name, mode, trigger, status: 'queued', queuedAt: new Date().toISOString(), extra };
    this.store.state.runs.unshift(run); this.store.save(); this.queue.push({ run, job: structuredClone(job) });
    queueMicrotask(()=>this.drain()); return run;
  }
  async drain() {
    if (this.active || !this.queue.length) return;
    const item = this.queue.shift(); this.active = item.run.id;
    try { await this.execute(item); }
    catch (error) { this.store.alert(`Errore interno esecuzione: ${error.message}`); }
    finally { this.active = null; if (this.queue.length) queueMicrotask(()=>this.drain()); }
  }
  async execute({run,job}) {
    run.status = 'running'; run.startedAt = new Date().toISOString(); this.store.save();
    const logFile = path.join(this.dataDir, 'logs', `${run.id}.log`);
    let logBytes = 0;
    const log = line => {
      if (logBytes > 8*1024*1024) return;
      const text = String(line).replace(/[\x00-\x08\x0B-\x1F\x7F]/g,'').slice(0,16000)+'\n';
      fs.appendFileSync(logFile, text, { mode:0o600 }); logBytes += Buffer.byteLength(text);
    };
    try {
      const target = this.targetCheck();
      if (run.mode === 'copy' && target.free < this.minFreeBytes) throw Error('Spazio libero sotto la soglia: operazione bloccata');
      log(`Operazione ${run.mode}; nessuna cancellazione automatica dei file o delle versioni.`);
      if (run.mode === 'restore') {
        const base = run.extra.versionId ? `versions/${job.id}/${run.extra.versionId}` : `current/${job.id}`;
        if (run.extra.versionId && !/^[0-9TZ-]+-[a-f0-9]{6}$/.test(run.extra.versionId)) throw Error('Versione non valida');
        const root = safeExisting(target.root, base);
        const src = safeExisting(root, run.extra.relative || '');
        const restoreSpace = this.statfs(this.restoreRoot);
        const restoreAvailable=Number(restoreSpace.bavail)*Number(restoreSpace.bsize)-this.minFreeBytes;
        if (restoreAvailable < 0) throw Error('Spazio insufficiente nel volume di recupero');
        await restoreBytes(src,restoreAvailable);
        const out = mkdirSafe(this.restoreRoot, run.id);
        // Recovery never overwrites an active source. A fresh directory is always used.
        const isDir = fs.statSync(src).isDirectory();
        const args = ['--recursive','--times','--no-perms','--no-owner','--no-group','--omit-dir-times','--no-links','--',
          isDir ? src + '/' : src, out + '/'];
        await this.runner(args, log);
        if (isDir) {
          const check=await this.runner(rsyncArgs('verify',src,out,''),log);
          if(check.diffCount)throw Error('Il controllo dei contenuti recuperati segnala differenze');
        } else {
          if(await fileDigest(src)!==await fileDigest(path.join(out,path.basename(src))))throw Error('Checksum del file recuperato non corrispondente');
        }
        run.restorePath = out;
      } else {
        const source = this.sourceCheck(job);
        const destPath=path.join(target.root,'current',job.id);
        const destination = run.mode === 'copy' ? mkdirSafe(target.root,`current/${job.id}`)
          : run.mode==='preview' && !fs.existsSync(destPath) ? path.join(target.root,`.preview-${run.id}`)
          : safeExisting(target.root,`current/${job.id}`);
        const versions = run.mode === 'copy' ? mkdirSafe(target.root,`versions/${job.id}/${run.id}`) : '';
        if(run.mode==='copy'){
          let plannedBytes=null;
          await this.runner(rsyncArgs('preview',source,destination,''),line=>{
            const match=/^Total transferred file size:\s*([\d,]+) bytes/.exec(line);
            if(match)plannedBytes=Number(match[1].replaceAll(',',''));
          });
          const available=this.targetCheck().free;
          if(plannedBytes!==null && plannedBytes+this.minFreeBytes>available)throw Error('Spazio insufficiente per i nuovi file e le modifiche: copia bloccata');
          run.plannedBytes=plannedBytes;
          log(`Byte previsti dal controllo iniziale: ${plannedBytes??'non disponibili'}.`);
        }
        const result = await this.runner(rsyncArgs(run.mode,source,destination,versions), log);
        run.diffCount = result.diffCount;
        if (run.mode === 'verify' && result.diffCount) throw Error(`Verifica: ${result.diffCount} differenze tra sorgente attuale e copia; può essere necessario aggiornare il backup`);
        // Recheck identity after transfer, so disk removal isn't reported as success.
        this.targetCheck();
      }
      run.status = 'success'; log('Operazione completata.');
    } catch (e) { run.status = 'failed'; run.error = e.message; log(`ERRORE: ${e.message}`); }
    run.finishedAt = new Date().toISOString(); this.store.save();
    try { await this.notify(run); }
    catch (e) { run.notificationError = e.message; this.store.alert(`Notifica non consegnata per ${job.name}: ${e.message}`); }
    this.store.save();
  }
  browse(jobId, versionId, relative='') {
    if (!idPattern.test(jobId)) throw Error('Lavoro non valido');
    if (versionId && !/^[0-9TZ-]+-[a-f0-9]{6}$/.test(versionId)) throw Error('Versione non valida');
    const target = this.targetCheck();
    const root = safeExisting(target.root, versionId ? `versions/${jobId}/${versionId}` : `current/${jobId}`);
    const dir = safeExisting(root, relative);
    if (!fs.statSync(dir).isDirectory()) throw Error('Selezionare una cartella');
    return fs.readdirSync(dir,{withFileTypes:true}).slice(0,1000).filter(d=>!d.isSymbolicLink()).map(d=>{
      const file = safeExisting(dir,d.name), stat = fs.statSync(file);
      return { name:d.name, directory:d.isDirectory(), bytes:stat.size, modifiedAt:stat.mtime.toISOString() };
    }).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
  }
  versions(jobId) {
    const target=this.targetCheck();
    const candidate=path.join(target.root,'versions',jobId);
    if (!fs.existsSync(candidate)) return [];
    return fs.readdirSync(safeExisting(target.root,`versions/${jobId}`),{withFileTypes:true})
      .filter(d=>d.isDirectory()&&!d.isSymbolicLink()).map(d=>d.name).sort().reverse();
  }
  log(runId) {
    if (!this.store.state.runs.some(r=>r.id===runId)) throw Error('Esecuzione non trovata');
    const p=path.join(this.dataDir,'logs',`${runId}.log`);
    return fs.existsSync(p)?fs.readFileSync(p,'utf8').slice(-200000):'In attesa di esecuzione';
  }
}

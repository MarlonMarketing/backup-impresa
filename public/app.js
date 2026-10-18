import {mountExtended} from '/extended.js';
import {mountShell} from '/shell.js';
import {guideForm} from '/wizard.js';
import {mountControl} from '/control.js';
import {normalizeLanguage,translate,localeFor} from '/i18n.js';
let language=normalizeLanguage(localStorage.getItem('backup-language')||navigator.language);
const t=(key,values)=>translate(language,key,values);
const label=key=>t(key==='queued'?'queuedStatus':key==='verify'?'verifyMode':key);
let csrf='',setup=false,state=null,editing=false,browser={jobId:'',versionId:'',path:''},logRunId='';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bytes(n){if(!Number.isFinite(n))return'—';if(n===0)return'0 B';const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return`${(n/1024**i).toFixed(i?1:0)} ${['B','KiB','MiB','GiB','TiB'][i]}`;}
function date(s){return s?new Date(s).toLocaleString(localeFor(language),{timeZone:state?.timezone||'Europe/Budapest',dateStyle:'short',timeStyle:'short'}):'—';}
let messageTimer;
function message(text,error=false){$('#message').textContent=text;$('#message').className=error?'error':'';$('#message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('#message').hidden=true,9000);}
async function api(url,body){const response=await fetch(url,{method:body?'POST':'GET',headers:{'Accept-Language':language,...(body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok){if(response.status===401&&!url.includes('login'))await init();throw Error(data.error||t('requestFailed'));}return data;}
async function init(){const auth=await api('/api/auth');csrf=auth.csrf||'';setup=auth.setup;$('#auth').hidden=auth.authenticated;$('#dashboard').hidden=!auth.authenticated;$('#header-actions').hidden=!auth.authenticated;$('#token-label').hidden=!setup;$('#auth-title').textContent=setup?t('setupTitle'):t('loginTitle');$('#auth-help').textContent=setup?t('setupHelp'):t('loginHelp');$('#auth-form').password.autocomplete=setup?'new-password':'current-password';shell.auth();if(auth.authenticated)await refresh();}
function badge(status){return`<span class="badge ${esc(status)}">${esc(label(status))}</span>`;}
async function refresh(){if($('#dashboard').hidden)return;state=await api('/api/status');render();if(logRunId&&$('#log-dialog').open)await loadLog(logRunId);}
const shell=mountShell({language:()=>language,onNewJob:()=>openJob()});
let resetJobWizard;
const renderControl=mountControl({api,refresh,message,language:()=>language});
const renderExtended=mountExtended({api,refresh,message,language:()=>language});
function render(){
  renderControl(state.control,state.sources);
  shell.render(state);
  renderExtended(state);
  document.body.classList.toggle('restricted-account',!state.access.principal.owner);
  $('#clock').textContent=state.timezone;
  const allRuns=[...state.runs,...(state.control?.runs||[]),...(state.transports?.runs||[])].sort((a,b)=>String(b.finishedAt||b.queuedAt).localeCompare(String(a.finishedAt||a.queuedAt))),copies=allRuns.filter(r=>['copy','pull','backup'].includes(r.mode)),last=copies.find(r=>r.status==='success'),failures=allRuns.filter(r=>['failed','interrupted'].includes(r.status)).length;
  $('#stats').innerHTML=[[state.targetName,state.target.online?t('connected'):t('attention'),state.target.online?t('space',{free:bytes(state.target.free),total:bytes(state.target.total)}):t('writesBlocked')],[t('lastCopy'),last?date(last.finishedAt):t('notRun'),last?.name||t('noCopy')],[t('configuredJobs'),String(state.jobs.length+(state.control?.tasks.length||0)+(state.transports?.plans.length||0)),t('activeSchedules',{n:state.jobs.filter(j=>j.enabled).length+(state.control?.tasks.filter(j=>j.enabled).length||0)+(state.transports?.plans.filter(j=>j.enabled).length||0)})],[t('issues'),String(failures),(state.active||state.control?.active||state.transports?.active)?t('runningJob'):t('nothingRunning')]].map(([label,value,note])=>`<div class="stat"><span class="label">${esc(label)}</span><div class="value">${esc(value)}</div><small>${esc(note)}</small></div>`).join('');
  $('#target-warning').hidden=state.target.online&&!state.pilot;$('#target-warning').textContent=!state.target.online?t('diskError',{error:state.target.error||''}):t('pilot');
  $('#jobs').innerHTML=state.jobs.length?state.jobs.map(job=>{
    const recent=state.runs.find(r=>r.jobId===job.id),busy=state.runs.some(r=>r.jobId===job.id&&['queued','running'].includes(r.status));
    return`<article class="card job"><div class="job-top"><div><h3>${esc(job.name)}</h3><span class="source">${esc(state.sources.find(s=>s.id===job.sourceId)?.name||job.sourceId)}</span></div>${badge(recent?.status||'ready')}</div><div class="job-detail"><p><span>${t('automaticCopy')}</span><strong>${job.enabled?t('daily',{time:esc(job.time)}):t('disabled')}</strong></p><p><span>${t('weeklyVerify')}</span><strong>${job.verifyEnabled?t('weekly',{day:weekday(job.verifyDay,true),time:esc(job.verifyTime)}):t('disabled')}</strong></p><p><span>${t('lastRun')}</span><strong>${date(recent?.finishedAt||recent?.startedAt)}</strong></p></div><div class="actions"><button class="primary" data-run="copy" data-id="${job.id}" ${busy?'disabled':''}>${t('copyNow')}</button><button class="ghost" data-run="preview" data-id="${job.id}" ${busy?'disabled':''}>${t('simulate')}</button><button class="ghost" data-run="verify" data-id="${job.id}" ${busy?'disabled':''}>${t('verify')}</button><button class="ghost" data-files="${job.id}">${t('filesVersions')}</button><button class="ghost" data-edit="${job.id}" ${busy?'disabled':''}>${t('configure')}</button></div></article>`;
  }).join(''):`<div class="card empty">${t('noJobs')}</div>`;
  $('#runs').innerHTML=state.runs.slice(0,30).map(r=>`<tr><td>${date(r.startedAt||r.queuedAt)}</td><td>${esc(r.name)}</td><td>${esc(label(r.mode))}</td><td>${badge(r.status)}</td><td><button class="ghost" data-log="${r.id}">${t('details')}</button></td></tr>`).join('');$('#no-runs').hidden=state.runs.length>0;
  $('#notifications').innerHTML=[['email','Email'],['telegram','Telegram'],['webhook','Webhook / n8n']].map(([key,name])=>`<div class="notice-row"><span>${name}</span><span>${state.notifications[key]?t('configured'):t('notConfigured')}${state.notifications.last[key]?` · ${state.notifications.last[key].ok?t('lastSent'):t('lastFailed')}`:''}</span></div>`).join('');
  $('#alerts-section').hidden=!state.alerts.length;$('#alerts').innerHTML=state.alerts.slice(0,10).map(a=>`<p class="muted">${date(a.at)} · ${esc(a.message)}</p>`).join('');shell.updateView();
}
function openJob(job){editing=Boolean(job);const f=$('#job-form');f.reset();f.elements.id.value=job?.id||'';f.elements.id.disabled=editing;f.elements.name.value=job?.name||'';f.sourceId.innerHTML=state.sources.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');if(job)f.sourceId.value=job.sourceId;f.time.value=job?.time||'18:00';f.enabled.checked=job?.enabled||false;f.verifyEnabled.checked=job?.verifyEnabled||false;f.verifyTime.value=job?.verifyTime||'12:30';f.verifyDay.value=String(job?.verifyDay??0);$('#schedule-help').textContent=t('timezoneHelp',{zone:state.timezone});$('#job-destination').textContent=t('target')+': '+state.targetName+' · '+t('readableHelp');if(!resetJobWizard)resetJobWizard=guideForm(f,[{title:'sourceStep',fields:['id','name','sourceId']},{title:'destinationStep',fields:['#job-destination']},{title:'scheduleStep',fields:['time','enabled','verifyDay','verifyTime','verifyEnabled','#schedule-help','.warning']}],t);resetJobWizard();$('#job-dialog').showModal();}
async function loadLog(id){logRunId=id;const data=await api(`/api/log?id=${encodeURIComponent(id)}`);const run=state.runs.find(r=>r.id===id);$('#log-summary').textContent=`${run?.name||''} · ${run?label(run.mode):''} · ${run?label(run.status):''}${run?.error?' · '+run.error:''}${run?.restorePath?' · '+t('recoveryPath',{path:run.restorePath}):''}${run?.notificationError?' · '+t('notificationIssue',{error:run.notificationError}):''}`;$('#log').textContent=data.text;}
async function loadFiles(){const params=new URLSearchParams({jobId:browser.jobId,path:browser.path,versionId:browser.versionId});const data=await api(`/api/files?${params}`);$('#version-select').innerHTML=`<option value="">${t('currentCopy')}</option>`+data.versions.map(v=>`<option value="${esc(v)}">${t('replacedFiles',{id:esc(v)})}</option>`).join('');$('#version-select').value=browser.versionId;$('#file-path').textContent='/'+browser.path;$('#up-folder').disabled=!browser.path;$('#file-list').innerHTML=data.files.length?data.files.map(f=>{const relative=[browser.path,f.name].filter(Boolean).join('/');return`<div class="file-row"><div class="file-name">${f.directory?`<button data-folder="${esc(relative)}">▣ ${esc(f.name)}</button>`:esc(f.name)}<span class="file-meta">${f.directory?t('folder'):bytes(f.bytes)} · ${date(f.modifiedAt)}</span></div><button class="ghost" data-restore="${esc(relative)}">${t('recover')}</button></div>`;}).join(''):`<p class="empty">${t('emptyFolder')}</p>`;}
$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{if(setup){await api('/api/setup',{username:f.username.value,password:f.password.value,token:f.token.value});setup=false;f.token.value='';}const result=await api('/api/login',{username:f.username.value,password:f.password.value});csrf=result.csrf;f.password.value='';await init();}catch(error){message(error.message,true);}});
$('#job-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{await api('/api/jobs',{id:f.elements.id.value,name:f.elements.name.value,sourceId:f.sourceId.value,time:f.time.value,enabled:f.enabled.checked,verifyEnabled:f.verifyEnabled.checked,verifyDay:Number(f.verifyDay.value),verifyTime:f.verifyTime.value});$('#job-dialog').close();message(t('saved'));await refresh();}catch(error){message(error.message,true);}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
  if(b.dataset.close){$('#'+b.dataset.close).close();if(b.dataset.close==='log-dialog')logRunId='';}
  if(b.dataset.edit)openJob(state.jobs.find(j=>j.id===b.dataset.edit));
  if(b.dataset.run){b.disabled=true;await api('/api/run',{jobId:b.dataset.id,mode:b.dataset.run});message(t('queued'));await refresh();}
  if(b.dataset.log){await loadLog(b.dataset.log);$('#log-dialog').showModal();}
  if(b.dataset.files){browser={jobId:b.dataset.files,versionId:'',path:''};await loadFiles();$('#files-dialog').showModal();}
  if(b.dataset.folder){browser.path=b.dataset.folder;await loadFiles();}
  if(b.dataset.restore){if(!confirm(t('restoreConfirm')))return;await api('/api/run',{jobId:browser.jobId,mode:'restore',versionId:browser.versionId,relative:b.dataset.restore});message(t('restoreStarted'));await refresh();}
}catch(error){message(error.message,true);await refresh().catch(()=>{});}});
$('#new-job').onclick=()=>shell.choose();$('#refresh').onclick=()=>refresh().catch(e=>message(e.message,true));
$('#logout').onclick=async()=>{try{await api('/api/logout',{});await init();}catch(e){message(e.message,true);}};
$('#test-notifications').onclick=async()=>{try{const result=await api('/api/notifications/test',{});message(result.sent.length?t('testSent',{channels:result.sent.join(', ')}):t('noChannels'));await refresh();}catch(e){message(e.message,true);}};
$('#version-select').onchange=async e=>{browser.versionId=e.target.value;browser.path='';try{await loadFiles();}catch(error){message(error.message,true);}};
$('#up-folder').onclick=async()=>{browser.path=browser.path.split('/').slice(0,-1).join('/');try{await loadFiles();}catch(error){message(error.message,true);}};
setInterval(()=>{if(!document.hidden)refresh().catch(e=>message(e.message,true));},5000);
function weekday(day,short=false){return new Intl.DateTimeFormat(localeFor(language),{weekday:short?'short':'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,0,4+Number(day))));}
function translatePage(){document.documentElement.lang=language;$('#language').value=language;document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));const select=$('#job-form').verifyDay;const selected=select.value;select.innerHTML=Array.from({length:7},(_,i)=>'<option value="'+i+'">'+weekday(i)+'</option>').join('');select.value=selected||'0';}
$('#language').onchange=async e=>{language=normalizeLanguage(e.target.value);localStorage.setItem('backup-language',language);translatePage();try{await init();if($('#files-dialog').open)await loadFiles();}catch(error){message(error.message,true);}};
translatePage();
init().catch(e=>message(e.message,true));

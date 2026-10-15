import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dictionaries,normalizeLanguage,translate} from '../public/i18n.js';
import {localize,localizePayload} from '../lib/i18n.mjs';
import {createApplication} from '../server.mjs';
import os from 'node:os';
import path from 'node:path';

test('translation keys and interpolation placeholders match in all languages',()=>{
 const keys=Object.keys(dictionaries.en).sort();
 for(const [lang,dict]of Object.entries(dictionaries)){
  assert.deepEqual(Object.keys(dict).sort(),keys);
  for(const key of keys){assert(dict[key].trim(),`${lang}.${key}`);assert.deepEqual([...dict[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),[...dictionaries.en[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort());}
 }
 assert.equal(normalizeLanguage('es-ES,es;q=0.9'),'es');
 assert.equal(normalizeLanguage('fr-FR'),'en');
 assert.equal(translate('es','space',{free:'1 GB',total:'2 GB'}),'1 GB libres de 2 GB');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const [,key]of html.matchAll(/data-i18n="(\w+)"/g))assert(keys.includes(key),key);
});
test('localized diagnostics preserve user names and original payload',()=>{
 const original={error:'Credenziali non valide',name:'Nome utente da 3 a 40 caratteri',runs:[{error:'Coda piena'}]};
 const result=localizePayload(original,'es');assert.equal(result.error,'Credenciales no válidas');assert.equal(result.runs[0].error,'Cola llena');assert.equal(result.name,original.name);assert.equal(original.error,'Credenziali non valide');
 assert.equal(localize('Nessuna copia riuscita nelle ultime 30 ore: Photos','en'),'No successful copy in the last 30 hours: Photos');
});
test('API honors browser language and serves the translation module',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'backup-language-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const app=createApplication({quiet:true,sources:[],env:{DATA_DIR:root,SETUP_TOKEN:'test-initial-token-123456789'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const origin=`http://127.0.0.1:${app.server.address().port}`;
 const es=await fetch(origin+'/api/status',{headers:{'Accept-Language':'es-ES'}});assert.equal(es.status,401);assert.equal((await es.json()).error,'Debes iniciar sesión');
 const en=await fetch(origin+'/api/status',{headers:{'Accept-Language':'en'}});assert.equal((await en.json()).error,'Sign in required');
 const module=await fetch(origin+'/i18n.js');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);assert.match(await module.text(),/Copias legibles/);
});

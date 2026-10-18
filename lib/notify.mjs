import {translate,normalizeLanguage} from '../public/i18n.js';
import {localize} from './i18n.mjs';
export class Notifier {
  constructor(env = process.env) { this.env=env; this.last={}; }
  channels() {
    return { email: Boolean(this.env.SMTP_HOST && this.env.SMTP_FROM && this.env.MAIL_TO),
      telegram:Boolean(this.env.TELEGRAM_BOT_TOKEN && this.env.TELEGRAM_CHAT_ID),
      webhook:Boolean(this.env.RESULT_WEBHOOK_URL), last:this.last };
  }
  async send(run, force=false) {
    if (!force && run.status==='success' && this.env.NOTIFY_SUCCESS!=='true') return;
    const language=normalizeLanguage(this.env.NOTIFICATION_LANGUAGE||'en');
    const t=key=>translate(language,key);
    const title=force?`Backup Impresa · ${t('sendTest')}`:`Backup Impresa · ${t(run.status==='success'?'success':'attention')}`;
    const text=`${title}\n${t('job')}: ${run.name}\n${t('operation')}: ${t(run.mode==='verify'?'verifyMode':run.mode)}\n${t('result')}: ${t(run.status)}\n${run.error?localize(run.error,language):t('success')}\n${run.finishedAt||new Date().toISOString()}`;
    const tasks=[];
    if (this.channels().email) tasks.push(['email',async()=>{
      const {default:nodemailer}=await import('nodemailer');
      const port=Number(this.env.SMTP_PORT||587);
      const transport=nodemailer.createTransport({host:this.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,
        connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,
        auth:this.env.SMTP_USER?{user:this.env.SMTP_USER,pass:this.env.SMTP_PASSWORD}:undefined,
        tls:{rejectUnauthorized:true}});
      try { await transport.sendMail({from:this.env.SMTP_FROM,to:this.env.MAIL_TO,subject:title,text}); }
      finally { transport.close(); }
    }]);
    if (this.channels().telegram) tasks.push(['telegram',async()=>{
      const response=await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),
        body:JSON.stringify({chat_id:this.env.TELEGRAM_CHAT_ID,text,disable_web_page_preview:true})});
      if (!response.ok || !(await response.json()).ok) throw Error('Consegna Telegram non riuscita');
    }]);
    if (this.channels().webhook) tasks.push(['webhook',async()=>{
      const url=new URL(this.env.RESULT_WEBHOOK_URL);
      if (url.protocol!=='https:' && this.env.ALLOW_HTTP_WEBHOOK!=='true') throw Error('Il webhook richiede HTTPS');
      if (url.username||url.password) throw Error('Usare il token dedicato per il webhook');
      const payload={event:'backup.result',eventId:run.id||undefined,job:run.name,mode:run.mode,status:run.status,at:run.finishedAt,error:run.error||null};
      if(this.webhookTransport)return this.webhookTransport({url:String(url),token:this.env.RESULT_WEBHOOK_TOKEN,payload});
      const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',
        ...(this.env.RESULT_WEBHOOK_TOKEN?{Authorization:`Bearer ${this.env.RESULT_WEBHOOK_TOKEN}`}:{})},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('Consegna webhook non riuscita');
    }]);
    const results=await Promise.allSettled(tasks.map(async([name,action])=>{
      try { await action(); this.last[name]={at:new Date().toISOString(),ok:true}; }
      catch(e){this.last[name]={at:new Date().toISOString(),ok:false};throw Error(`${name}: ${e.code||'consegna fallita'}`);}
    }));
    const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason.message);
    if(errors.length) throw Error(errors.join('; '));
    return {sent:tasks.map(([name])=>name)};
  }
}

// Turns existing, validated forms into steps; never saves or runs a backup implicitly.
export function guideForm(form, groups, t, {reviewHelp='reviewHelp'}={}) {
  form.classList.add('guided-form');
  const heading=form.querySelector('.section-head');
  const submit=form.querySelector('button[type=submit]');
  const fields=[...form.children].filter(el=>el!==heading&&el!==submit&&!el.matches('[data-form-error]'));
  const assigned=new Set();
  const panes=groups.map(group=>{
    const pane=document.createElement('section');pane.className='wizard-pane';
    pane.dataset.title=group.title;
    for(const field of fields)if(!assigned.has(field)&&group.fields.some(name=>/^[.#\[]/.test(name)?field.matches(name):(field.matches(`[name="${name}"]`)||field.querySelector(`[name="${name}"]`)))){pane.append(field);assigned.add(field);}
    return pane;
  });
  // Place explanatory content not assigned to a specific field in the first step.
  for(const field of fields)if(field.parentElement===form)panes[0].append(field);
  const review=document.createElement('section');review.className='wizard-pane';review.dataset.title='reviewStep';panes.push(review);
  const progress=document.createElement('div');progress.className='wizard-progress';progress.setAttribute('aria-live','polite');
  const nav=document.createElement('div');nav.className='wizard-actions';
  const back=document.createElement('button');back.type='button';back.className='ghost';back.textContent=t('back');
  const next=document.createElement('button');next.type='button';next.className='primary';next.textContent=t('next');
  nav.append(back,next,submit);form.append(progress,...panes,nav);
  let step=0;
  function visibleControl(el){return !el.closest('label[hidden]')&&!el.closest('[data-conditional-hidden]');}
  function validate(pane){
    for(const el of pane.querySelectorAll('input,select,textarea'))if(visibleControl(el)&&!el.disabled&&!el.checkValidity()){if(!pane.hidden)el.reportValidity();return false;}
    return true;
  }
  function render(){
    progress.replaceChildren();
    const title=document.createElement('strong');title.textContent=t('stepOf',{n:step+1,total:panes.length})+' · '+t(panes[step].dataset.title);progress.append(title);
    const track=document.createElement('div');track.className='step-track';
    panes.forEach((p,i)=>{const dot=document.createElement('span');dot.className=i<=step?'done':'';track.append(dot);p.hidden=i!==step;});progress.append(track);
    back.hidden=step===0;next.hidden=step===panes.length-1;submit.hidden=step!==panes.length-1;
    if(step===panes.length-1){
      review.replaceChildren();
      const help=document.createElement('p');help.className='warning';help.textContent=t(reviewHelp);review.append(help);
      const dl=document.createElement('dl');dl.className='review-list';
      for(const el of form.querySelectorAll('input,select,textarea')){
        if(!el.name||/password|privatekey|token|secret|hostkey/i.test(el.name)||!visibleControl(el))continue;
        const label=el.closest('label');if(!label)continue;
        const dt=document.createElement('dt');dt.textContent=[...label.childNodes].filter(n=>n.nodeType===3||n.nodeName==='SPAN').map(n=>n.textContent.trim()).join(' ')||el.name;
        const dd=document.createElement('dd');dd.textContent=el.type==='checkbox'?t(el.checked?'configured':'disabled'):el.tagName==='SELECT'?(el.selectedOptions[0]?.textContent||'—'):(el.value||'—');dl.append(dt,dd);
      }
      review.append(dl);const privacy=document.createElement('p');privacy.className='muted';privacy.textContent=t('noSecretSummary');review.append(privacy);
    }
  }
  back.onclick=()=>{step--;render();};next.onclick=()=>{if(validate(panes[step])){step++;render();}};
  // Enter must advance the current step, not submit hidden required fields.
  form.addEventListener('submit',e=>{if(step!==panes.length-1){e.preventDefault();e.stopImmediatePropagation();next.click();return;}for(let i=0;i<panes.length-1;i++)if(!validate(panes[i])){e.preventDefault();e.stopImmediatePropagation();step=i;render();validate(panes[i]);break;}},true);
  form.noValidate=true;
  render();
  return ()=>{step=0;render();};
}

import {createWellbeingDialog} from './wellbeing-entry.js?h=2ad04c8200';

export function todayInSaoPaulo(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=type=>parts.find(p=>p.type===type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function mountDailyMood({user,backendUrl,isCurrent=()=>true}){
  const controller=new AbortController(),buttons=[...document.querySelectorAll('#moodPicker [data-mood]')];
  const footer=document.getElementById('moodFooter'),message=document.getElementById('moodSaved'),edit=document.getElementById('moodWellbeing');
  const key=`ep:humor:today:${user.uid}`;
  let record=null,pending=null,loading=true,disposed=false,confirmed=false,loadFailed=false,viewPending=false;
  const current=()=>!disposed&&isCurrent();
  const complete=metrics=>['anxiety','energy','sleep'].every(id=>Number.isInteger(metrics?.[id])&&metrics[id]>=0&&metrics[id]<=10);
  try{localStorage.removeItem(`ep:humor:cache:${user.uid}`);}catch{}
  function paint(){
    const saved=record?.date===todayInSaoPaulo();
    for(const button of buttons){button.classList.toggle('is-selected',saved&&Number(button.dataset.mood)===Number(record.mood));button.disabled=loading||saved;button.style.opacity=saved&&!button.classList.contains('is-selected')?'.55':'';button.style.cursor=saved?'default':'';}
    footer.classList.toggle('is-visible',saved);
    edit.hidden=!saved;
    edit.setAttribute('aria-busy',String(loading));
    edit.textContent='Ver registro';
    message.textContent=loadFailed?'Não foi possível carregar o registro. Toque em “Ver registro” para tentar novamente.':saved?(complete(record.wellbeing)?'✓ Dia registrado':'✓ Humor registrado'):'';
  }
  async function request(path,options={}){
    if(!current())throw Error('SESSION_CHANGED');
    const token=await user.getIdToken();if(!current())throw Error('SESSION_CHANGED');
    const response=await fetch(backendUrl+path,{...options,signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{})}});
    const data=await response.json().catch(()=>({}));
    if(!current()||!response.ok||!data.ok)throw Object.assign(Error('SAVE_FAILED'),{status:response.status,code:data.error});
    return data;
  }
  const entry=createWellbeingDialog({
    save:async({metrics,note})=>{
      if(!pending)throw Error('READ_ONLY');
      const mood=Number(pending.dataset.mood);
      let data;
      try{data=await request('/therapy/paciente/humor',{method:'POST',body:JSON.stringify({mood,wellbeing:metrics,...(note?{note}:{})})});}
      catch(error){
        if(error.status!==409||error.code!=='REGISTRO_JA_SALVO')throw error;
        const saved=await request('/therapy/paciente/humor?days=1');
        record=saved.items?.find(item=>item.date===todayInSaoPaulo());
        if(!record)throw error;confirmed=true;loadFailed=false;pending=null;paint();return;
      }
      if(data.date!==todayInSaoPaulo())throw Error('DAY_CHANGED');
      record={date:data.date,mood,wellbeing:data.wellbeing||metrics,note:note||null};confirmed=true;loadFailed=false;pending=null;
      try{sessionStorage.setItem(key,JSON.stringify({date:record.date,mood:String(mood)}));localStorage.setItem('ep:dirtyAt',String(Date.now()));}catch{}
      paint();
    },
    onCancel:()=>{pending=null;if(current())paint();}
  });
  function openMood(event){
    if(!current()||loading)return;
    if(record?.date!==todayInSaoPaulo())record=null;
    if(record)return;
    pending=event.currentTarget;
    buttons.forEach(button=>button.classList.toggle('is-selected',button===pending));
    entry.open({moodLabel:pending.querySelector('.a-mood__name')?.textContent||pending.title,withNote:true});
  }
  async function openView(){
    if(!current()||viewPending)return;
    viewPending=true;
    try{
      if(loading)await ready;
      else if(!confirmed)await loadToday();
      if(current()&&confirmed&&record?.date===todayInSaoPaulo()){pending=null;entry.open({readOnly:true,metrics:record.wellbeing,note:record.note,date:record.date,moodLabel:buttons.find(button=>Number(button.dataset.mood)===Number(record.mood))?.querySelector('.a-mood__name')?.textContent||''});}
    }finally{viewPending=false;}
  }
  buttons.forEach(button=>button.addEventListener('click',openMood));edit.addEventListener('click',openView);
  try{const cached=JSON.parse(sessionStorage.getItem(key)||'null');if(cached?.date===todayInSaoPaulo())record=cached;}catch{}
  paint();
  async function loadToday(){
    loading=true;loadFailed=false;paint();
    try{
      const data=await request('/therapy/paciente/humor?days=1');
      record=data.items?.find(item=>item.date===todayInSaoPaulo())||null;
      confirmed=true;
      try{if(record)sessionStorage.setItem(key,JSON.stringify({date:record.date,mood:String(record.mood)}));else sessionStorage.removeItem(key);}catch{}
    }catch{if(current()){confirmed=false;loadFailed=true;}}
    finally{if(current()){loading=false;paint();}}
  }
  const ready=loadToday();
  return {ready,destroy(){disposed=true;controller.abort();entry.destroy();buttons.forEach(button=>button.removeEventListener('click',openMood));edit.removeEventListener('click',openView);}};
}

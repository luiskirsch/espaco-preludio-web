import {createWellbeingDialog} from './wellbeing-entry.js?h=926be1a2b1';

export function todayInSaoPaulo(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=type=>parts.find(p=>p.type===type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function mountDailyMood({user,backendUrl,isCurrent=()=>true}){
  const controller=new AbortController(),buttons=[...document.querySelectorAll('#moodPicker [data-mood]')];
  const footer=document.getElementById('moodFooter'),message=document.getElementById('moodSaved'),edit=document.getElementById('moodWellbeing');
  const key=`ep:humor:today:${user.uid}`;
  let record=null,pending=null,loading=true,disposed=false;
  const current=()=>!disposed&&isCurrent();
  const complete=metrics=>['anxiety','energy','sleep'].every(id=>Number.isInteger(metrics?.[id])&&metrics[id]>=0&&metrics[id]<=10);
  try{localStorage.removeItem(`ep:humor:cache:${user.uid}`);}catch{}
  function paint(){
    const saved=record?.date===todayInSaoPaulo();
    for(const button of buttons){button.classList.toggle('is-selected',saved&&Number(button.dataset.mood)===Number(record.mood));button.disabled=loading||saved;button.style.opacity=saved&&!button.classList.contains('is-selected')?'.55':'';button.style.cursor=saved?'default':'';}
    footer.classList.toggle('is-visible',saved);
    edit.hidden=!saved||loading;
    edit.textContent=complete(record?.wellbeing)?'Editar bem-estar':'Completar bem-estar';
    message.textContent=saved?(complete(record.wellbeing)?'✓ Dia registrado':'✓ Humor registrado'):'';
  }
  async function request(path,options={}){
    if(!current())throw Error('SESSION_CHANGED');
    const token=await user.getIdToken();if(!current())throw Error('SESSION_CHANGED');
    const response=await fetch(backendUrl+path,{...options,signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{})}});
    const data=await response.json().catch(()=>({}));
    if(!current()||!response.ok||!data.ok)throw Error('SAVE_FAILED');
    return data;
  }
  const entry=createWellbeingDialog({
    save:async({metrics,note})=>{
      const creating=!!pending,mood=creating?Number(pending.dataset.mood):record?.mood;
      if(!creating&&record?.date!==todayInSaoPaulo())throw Error('DAY_CHANGED');
      const data=await request(creating?'/therapy/paciente/humor':'/therapy/paciente/humor/bem-estar',{
        method:creating?'POST':'PATCH',body:JSON.stringify(creating?{mood,wellbeing:metrics,...(note?{note}:{})}:metrics)
      });
      if(data.date!==todayInSaoPaulo())throw Error('DAY_CHANGED');
      record={date:data.date,mood,wellbeing:data.wellbeing||data.metrics||metrics};pending=null;
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
  function openEdit(){if(current()&&record?.date===todayInSaoPaulo()){pending=null;entry.open({metrics:record.wellbeing});}}
  buttons.forEach(button=>button.addEventListener('click',openMood));edit.addEventListener('click',openEdit);
  try{const cached=JSON.parse(sessionStorage.getItem(key)||'null');if(cached?.date===todayInSaoPaulo())record=cached;}catch{}
  paint();
  const ready=(async()=>{
    try{
      const data=await request('/therapy/paciente/humor?days=1');
      record=data.items?.find(item=>item.date===todayInSaoPaulo())||null;
    }catch{if(current()&&!record){message.textContent='Não foi possível consultar o registro de hoje.';}}
    finally{if(current()){loading=false;paint();}}
  })();
  return {ready,destroy(){disposed=true;controller.abort();entry.destroy();buttons.forEach(button=>button.removeEventListener('click',openMood));edit.removeEventListener('click',openEdit);}};
}

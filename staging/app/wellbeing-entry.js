const QUESTIONS = [
  {id:'anxiety',title:'Como está sua ansiedade?',hint:'Pense em como você se sentiu ao longo do dia.',icon:'🌿',options:[
    [0,'Tranquilo','Sem ansiedade'],[2,'Um pouco ansioso','Leve e passageira'],[5,'Ansiedade moderada','Apareceu algumas vezes'],[8,'Muito ansioso','Difícil de desacelerar'],[10,'Ansiedade intensa','Tomou boa parte do dia']]},
  {id:'energy',title:'Como está sua energia?',hint:'Considere sua disposição física e mental.',icon:'⚡',options:[
    [0,'Sem energia','Foi difícil começar'],[2,'Pouca energia','Precisei me poupar'],[5,'Energia razoável','Deu para seguir o dia'],[8,'Com disposição','Me senti ativo'],[10,'Muita energia','Me senti revigorado']]},
  {id:'sleep',title:'Como foi seu sono?',hint:'Pense na qualidade da sua última noite.',icon:'🌙',options:[
    [0,'Muito ruim','Quase não descansei'],[2,'Ruim','Acordei cansado'],[5,'Razoável','Descansei em parte'],[8,'Bom','Acordei descansado'],[10,'Restaurador','Dormi e recuperei as energias']]}
];

export function createWellbeingDialog({save,onCancel=()=>{}}) {
  const dialog=document.createElement('dialog');
  dialog.className='wbe-dialog';
  dialog.setAttribute('aria-labelledby','wbeTitle');
  dialog.setAttribute('aria-describedby','wbeIntro');
  dialog.innerHTML=`<form class="wbe-form" novalidate>
    <header class="wbe-head"><span class="wbe-eyebrow">UM MOMENTO PARA VOCÊ</span><button type="button" class="wbe-close" aria-label="Fechar sem concluir o registro">×</button>
      <h2 id="wbeTitle">Seu dia, além do humor</h2><p id="wbeIntro"></p>
      <p class="wbe-progress" role="status">0 de 3 respostas</p></header>
    <div class="wbe-body">${QUESTIONS.map(q=>`<fieldset class="wbe-question" data-question="${q.id}"><legend><span aria-hidden="true">${q.icon}</span> ${q.title}</legend><p class="wbe-hint">${q.hint}</p><div class="wbe-options" data-options="${q.id}"></div><p class="wbe-field-error" hidden>Escolha a opção que mais se aproxima do seu dia.</p></fieldset>`).join('')}
      <details class="wbe-note"><summary>Quer acrescentar uma anotação? <span>Opcional</span></summary><label for="wbeNote">O que marcou seu dia?</label><textarea id="wbeNote" maxlength="600" rows="3" placeholder="Escreva do seu jeito. Esta anotação é pessoal."></textarea><span class="wbe-note-count">0/600</span></details>
    </div><footer class="wbe-footer"><p class="wbe-status" role="status" aria-live="polite" tabindex="-1"></p><button type="submit" class="wbe-submit">Salvar meu dia</button></footer>
  </form>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form'),status=dialog.querySelector('.wbe-status'),submit=dialog.querySelector('.wbe-submit'),close=dialog.querySelector('.wbe-close'),note=dialog.querySelector('textarea');
  let saving=false,epoch=0,trigger=null,includeNote=false;
  function selected(){return Object.fromEntries(QUESTIONS.map(q=>[q.id,form.querySelector(`input[name="${q.id}"]:checked`)?.value]).map(([id,v])=>[id,v===undefined?null:Number(v)]));}
  function progress(){const count=Object.values(selected()).filter(v=>v!==null).length;dialog.querySelector('.wbe-progress').textContent=`${count} de 3 respostas`;}
  function setBusy(busy){saving=busy;close.disabled=busy;submit.disabled=busy;form.querySelectorAll('input,textarea').forEach(input=>input.disabled=busy);submit.textContent=busy?'Salvando seu registro…':includeNote?'Salvar meu dia':'Salvar bem-estar';}
  function clear(){epoch++;saving=false;note.value='';dialog.querySelector('.wbe-note-count').textContent='0/600';dialog.querySelector('.wbe-note').open=false;form.querySelectorAll('input').forEach(input=>input.checked=false);status.textContent='';}
  function dismiss(cancel=true,restoreFocus=true){
    if(dialog.open)dialog.close();document.body.classList.remove('wbe-open');clear();
    if(cancel)onCancel();
    if(restoreFocus){if(trigger?.isConnected&&!trigger.disabled)trigger.focus();else document.getElementById('moodWellbeing')?.focus();}
    trigger=null;
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!saving)dismiss();});
  close.addEventListener('click',()=>{if(!saving)dismiss();});
  form.addEventListener('change',event=>{if(event.target.type==='radio'){event.target.closest('fieldset').querySelector('.wbe-field-error').hidden=true;progress();status.textContent='';}});
  note.addEventListener('input',()=>{dialog.querySelector('.wbe-note-count').textContent=`${note.value.length}/600`;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;
    const metrics=selected(),missing=QUESTIONS.filter(q=>metrics[q.id]===null);
    for(const q of QUESTIONS)dialog.querySelector(`[data-question="${q.id}"] .wbe-field-error`).hidden=metrics[q.id]!==null;
    if(missing.length){status.textContent='Responda às três perguntas para concluir seu registro.';form.querySelector(`input[name="${missing[0].id}"]`).focus();return;}
    const ticket=epoch;setBusy(true);status.textContent='Salvando seu registro…';
    try{await save({metrics,note:includeNote?note.value.trim():undefined});if(ticket!==epoch)return;dismiss(false);}
    catch{if(ticket===epoch){status.textContent='Não foi possível salvar. Suas respostas continuam aqui; tente novamente.';status.focus();}}
    finally{if(ticket===epoch)setBusy(false);}
  });
  return {
    open({metrics={},moodLabel='',withNote=false}={}){
      if(dialog.open)return;clear();trigger=document.activeElement;includeNote=withNote;
      dialog.querySelector('#wbeIntro').textContent=moodLabel?`Você escolheu “${moodLabel}”. Complete as três perguntas para registrar seu dia.`:'Escolha uma resposta para cada pergunta. Você pode atualizar o registro de hoje.';
      dialog.querySelector('.wbe-note').hidden=!withNote;
      for(const q of QUESTIONS){
        const previous=metrics?.[q.id],options=[...q.options];
        if(Number.isInteger(previous)&&previous>=0&&previous<=10&&!options.some(o=>o[0]===previous))options.push([previous,'Manter registro anterior',`${previous}/10, informado anteriormente`]);
        const group=dialog.querySelector(`[data-options="${q.id}"]`);group.replaceChildren();
        for(const [value,label,description] of options){
          const option=document.createElement('label');option.className='wbe-option';
          const input=document.createElement('input');input.type='radio';input.name=q.id;input.value=value;input.required=true;input.checked=previous===value;
          const title=document.createElement('strong');title.textContent=label;
          const detail=document.createElement('span');detail.textContent=description;
          option.append(input,title,detail);group.append(option);
        }
        dialog.querySelector(`[data-question="${q.id}"] .wbe-field-error`).hidden=true;
      }
      setBusy(false);progress();document.body.classList.add('wbe-open');dialog.showModal();
    },
    reset(){dismiss(false,false);},
    destroy(){dismiss(false,false);dialog.remove();}
  };
}

const QUESTIONS = [
  {id:'anxiety',title:'Como está sua ansiedade?',hint:'Pense em como você se sentiu ao longo do dia.',icon:'🌿',options:[
    [0,'Tranquilo','Sem ansiedade'],[2,'Um pouco ansioso','Leve e passageira'],[5,'Ansiedade moderada','Apareceu algumas vezes'],[8,'Muito ansioso','Difícil de desacelerar'],[10,'Ansiedade intensa','Tomou boa parte do dia']]},
  {id:'energy',title:'Como está sua energia?',hint:'Considere sua disposição física e mental.',icon:'⚡',options:[
    [0,'Sem energia','Foi difícil começar'],[2,'Pouca energia','Precisei me poupar'],[5,'Energia razoável','Deu para seguir o dia'],[8,'Com disposição','Me senti ativo'],[10,'Muita energia','Me senti revigorado']]},
  {id:'sleep',title:'Como foi seu sono?',hint:'Pense na qualidade da sua última noite.',icon:'🌙',options:[
    [0,'Muito ruim','Quase não descansei'],[2,'Ruim','Acordei cansado'],[5,'Razoável','Descansei em parte'],[8,'Bom','Acordei descansado'],[10,'Restaurador','Dormi e recuperei as energias']]}
];

export function createWellbeingDialog({save,onCancel=()=>{}}={}) {
  const dialog=document.createElement('dialog');
  dialog.className='wbe-dialog';
  dialog.setAttribute('aria-labelledby','wbeTitle');
  dialog.setAttribute('aria-describedby','wbeIntro');
  dialog.innerHTML=`<form class="wbe-form" novalidate>
    <header class="wbe-head"><span class="wbe-eyebrow">UM MOMENTO PARA VOCÊ</span><button type="button" class="wbe-close" aria-label="Fechar sem concluir o registro">×</button>
      <h2 id="wbeTitle">Seu dia, além do humor</h2><p id="wbeIntro"></p>
      <p class="wbe-progress" role="status">0 de 3 respostas</p></header>
    <div class="wbe-body"><section class="wbe-record" hidden aria-label="Respostas salvas"></section>${QUESTIONS.map(q=>`<fieldset class="wbe-question" data-question="${q.id}"><legend><span aria-hidden="true">${q.icon}</span> ${q.title}</legend><p class="wbe-hint">${q.hint}</p><div class="wbe-options" data-options="${q.id}"></div><p class="wbe-field-error" hidden>Escolha a opção que mais se aproxima do seu dia.</p></fieldset>`).join('')}
      <section class="wbe-note" hidden aria-labelledby="wbeNoteTitle"><h3 id="wbeNoteTitle">Uma anotação sobre seu dia</h3><p class="wbe-hint">Opcional · escreva do seu jeito. Esta anotação é pessoal.</p><label for="wbeNote">O que marcou seu dia?</label><textarea id="wbeNote" maxlength="600" rows="3" placeholder="Algo que alegrou, preocupou ou chamou sua atenção…"></textarea><span class="wbe-note-count">0/600</span></section>
    </div><footer class="wbe-footer"><p class="wbe-status" role="status" aria-live="polite" tabindex="-1"></p><button type="button" class="wbe-add-note">Acrescentar anotação</button><button type="button" class="wbe-back" hidden>Voltar</button><button type="button" class="wbe-next" hidden>Continuar</button><button type="submit" class="wbe-submit">Salvar meu dia</button><button type="button" class="wbe-done" hidden>Fechar</button></footer>
  </form>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form'),status=dialog.querySelector('.wbe-status'),submit=dialog.querySelector('.wbe-submit'),close=dialog.querySelector('.wbe-close'),note=dialog.querySelector('textarea');
  const smallScreen=matchMedia('(max-width:640px), (max-height:680px)'),back=dialog.querySelector('.wbe-back'),next=dialog.querySelector('.wbe-next'),addNote=dialog.querySelector('.wbe-add-note');
  const done=dialog.querySelector('.wbe-done');
  let saving=false,epoch=0,trigger=null,includeNote=false,step=0,noteMode=false,viewOnly=false,hasSavedNote=false;
  function selected(){return Object.fromEntries(QUESTIONS.map(q=>[q.id,form.querySelector(`input[name="${q.id}"]:checked`)?.value]).map(([id,v])=>[id,v===undefined?null:Number(v)]));}
  function progress(){const count=Object.values(selected()).filter(v=>v!==null).length;dialog.querySelector('.wbe-progress').textContent=viewOnly?'Registro salvo · somente leitura':noteMode?'Anotação pessoal · opcional':smallScreen.matches?`Pergunta ${step+1} de 3 · ${count} respondidas`:`${count} de 3 respostas`;}
  function layout(focus=false){
    const stepped=smallScreen.matches;
    dialog.classList.toggle('is-stepped',stepped&&!viewOnly);dialog.classList.toggle('is-note',noteMode);
    dialog.classList.toggle('is-readonly',viewOnly);dialog.querySelector('.wbe-record').hidden=!viewOnly||noteMode;
    QUESTIONS.forEach((q,index)=>{dialog.querySelector(`[data-question="${q.id}"]`).hidden=viewOnly||noteMode||(stepped&&index!==step);});
    dialog.querySelector('.wbe-note').hidden=!noteMode;
    back.hidden=!noteMode&&(viewOnly||!stepped||step===0);back.textContent=noteMode?(viewOnly?'Voltar ao registro':'Voltar às respostas'):'Voltar';
    next.hidden=viewOnly||noteMode||!stepped||step===QUESTIONS.length-1;submit.hidden=viewOnly||!next.hidden;done.hidden=!viewOnly;
    addNote.textContent=viewOnly?'Ver anotação':'Acrescentar anotação';
    addNote.hidden=viewOnly?(!hasSavedNote||noteMode):!includeNote||noteMode||(stepped&&step<QUESTIONS.length-1);
    progress();
    if(focus){const target=noteMode?note:viewOnly?done:form.querySelector(`input[name="${QUESTIONS[step].id}"]:checked`)||form.querySelector(`input[name="${QUESTIONS[step].id}"]`);target?.focus({preventScroll:true});}
  }
  function setBusy(busy){saving=busy;form.querySelectorAll('button,input,textarea').forEach(input=>input.disabled=busy||(viewOnly&&input.type==='radio'));note.readOnly=viewOnly;submit.textContent=busy?'Salvando…':includeNote?'Salvar meu dia':'Salvar bem-estar';}
  function clear(){epoch++;saving=false;step=0;noteMode=false;note.value='';dialog.querySelector('.wbe-record').replaceChildren();dialog.querySelector('.wbe-note-count').textContent='0/600';form.querySelectorAll('input').forEach(input=>input.checked=false);status.textContent='';}
  function dismiss(cancel=true,restoreFocus=true){
    if(dialog.open)dialog.close();document.body.classList.remove('wbe-open');clear();
    if(cancel)onCancel();
    if(restoreFocus){if(trigger?.isConnected&&!trigger.disabled)trigger.focus();else document.getElementById('moodWellbeing')?.focus();}
    trigger=null;
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!saving)dismiss();});
  close.addEventListener('click',()=>{if(!saving)dismiss();});
  done.addEventListener('click',()=>dismiss(false));
  function advance(){
    const question=QUESTIONS[step];
    if(selected()[question.id]===null){dialog.querySelector(`[data-question="${question.id}"] .wbe-field-error`).hidden=false;status.textContent='Escolha uma resposta para continuar.';form.querySelector(`input[name="${question.id}"]`).focus({preventScroll:true});return;}
    step=Math.min(QUESTIONS.length-1,step+1);status.textContent='';layout(true);
  }
  next.addEventListener('click',advance);
  back.addEventListener('click',()=>{if(noteMode)noteMode=false;else step=Math.max(0,step-1);status.textContent='';layout(true);});
  addNote.addEventListener('click',()=>{noteMode=true;status.textContent='';layout(true);});
  const screenChanged=()=>{if(dialog.open)layout();};
  smallScreen.addEventListener('change',screenChanged);
  form.addEventListener('change',event=>{if(event.target.type==='radio'){event.target.closest('fieldset').querySelector('.wbe-field-error').hidden=true;progress();status.textContent='';}});
  note.addEventListener('input',()=>{dialog.querySelector('.wbe-note-count').textContent=`${note.value.length}/600`;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving||viewOnly)return;
    if(smallScreen.matches&&!noteMode&&step<QUESTIONS.length-1){advance();return;}
    const metrics=selected(),missing=QUESTIONS.filter(q=>metrics[q.id]===null);
    for(const q of QUESTIONS)dialog.querySelector(`[data-question="${q.id}"] .wbe-field-error`).hidden=metrics[q.id]!==null;
    if(missing.length){step=QUESTIONS.findIndex(q=>q.id===missing[0].id);noteMode=false;layout();status.textContent='Responda às três perguntas para concluir seu registro.';form.querySelector(`input[name="${missing[0].id}"]`).focus({preventScroll:true});return;}
    const ticket=epoch;setBusy(true);status.textContent='Salvando seu registro…';
    try{await save({metrics,note:includeNote?note.value.trim():undefined});if(ticket!==epoch)return;dismiss(false);}
    catch{if(ticket===epoch){status.textContent='Não foi possível salvar. Suas respostas continuam aqui; tente novamente.';status.focus();}}
    finally{if(ticket===epoch)setBusy(false);}
  });
  return {
    open({metrics={},moodLabel='',withNote=false,readOnly=false,note:savedNote='',date=''}={}){
      if(dialog.open)return;clear();trigger=document.activeElement;viewOnly=readOnly;includeNote=withNote;hasSavedNote=typeof savedNote==='string'&&savedNote.length>0;
      dialog.querySelector('#wbeTitle').textContent=viewOnly?'Seu registro salvo':'Seu dia, além do humor';
      close.setAttribute('aria-label',viewOnly?'Fechar registro':'Fechar sem concluir o registro');
      dialog.querySelector('#wbeIntro').textContent=viewOnly?`${moodLabel?'Humor: '+moodLabel+'. ':''}${/^\d{4}-\d{2}-\d{2}$/.test(date)?'Dia '+date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4)+'. ':''}Após salvar, as respostas não podem ser alteradas.`:moodLabel?`Você escolheu “${moodLabel}”. Complete as três perguntas para registrar seu dia.`:'Escolha uma resposta para cada pergunta para concluir seu registro.';
      if(viewOnly){
        const summary=dialog.querySelector('.wbe-record');
        for(const q of QUESTIONS){const value=metrics?.[q.id],choice=q.options.find(option=>option[0]===value),valid=Number.isInteger(value)&&value>=0&&value<=10;
          const card=document.createElement('article'),label=document.createElement('span'),answer=document.createElement('strong'),detail=document.createElement('p');
          label.textContent=`${q.icon} ${{anxiety:'Ansiedade',energy:'Energia',sleep:'Sono'}[q.id]}`;answer.textContent=choice?.[1]||(valid?`${value}/10`:'Não registrado');detail.textContent=choice?.[2]||(valid?'Valor informado no registro original.':'Este dado não foi informado neste dia.');card.append(label,answer,detail);summary.append(card);
        }
        note.value=hasSavedNote?savedNote:'';
      }
      dialog.querySelector('#wbeNoteTitle').textContent=viewOnly?'Sua anotação':'Uma anotação sobre seu dia';
      dialog.querySelector('.wbe-note .wbe-hint').textContent=viewOnly?'Anotação salva com o registro deste dia.':'Opcional · escreva do seu jeito. Esta anotação é pessoal.';
      dialog.querySelector('.wbe-note-count').hidden=viewOnly;
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
      setBusy(false);layout();document.body.classList.add('wbe-open');dialog.showModal();
    },
    reset(){dismiss(false,false);},
    destroy(){smallScreen.removeEventListener('change',screenChanged);dismiss(false,false);dialog.remove();}
  };
}

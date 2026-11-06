import { BACKEND_BASE_URL } from './firebase-config.js?h=69b74fc63a';
import { parseRosterCsv, rosterCsv } from './corporate-csv.js?h=428a058f07';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const initials = name => String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const types = { clt:'CLT', pj:'Pessoa jurídica', estagiario:'Estágio', aprendiz:'Aprendiz', estatutario:'Estatutário', outro:'Outro' };
const reasons = { demissao:'Desligamento pela empresa', pedido_colaborador:'Pedido do colaborador', fim_contrato:'Fim do contrato', outro:'Outro' };
const statuses = { ativo:'Ativo', pendente:'Pendente', inativo:'Encerrado' };
const eventTypes = { cadastro:'Cadastro recebido', admissao:'Admissão com benefício ativo', aprovacao:'Benefício aprovado', edicao:'Cadastro atualizado', desligamento:'Vínculo encerrado', readmissao:'Colaborador readmitido' };
const errors = { EMAIL_JA_CADASTRADO:'Este e-mail já está cadastrado. Localize a pessoa na lista; se estiver desligada, use Reativar.',
  LIMITE_COLABORADORES_ATINGIDO:'O limite de vagas foi atingido. Vínculos ativos e pendentes ocupam vagas.',
  CONFIRME_VINCULO_E_TIPO:'Selecione o tipo de vínculo e confirme que ele foi conferido.',
  CADASTRO_ALTERADO_RECARREGUE:'Este cadastro foi alterado em outra sessão. Feche esta janela, atualize a lista e tente novamente.',
  BENEFICIO_INATIVO:'O benefício da empresa está inativo. Entre em contato com o Espaço Prelúdio para liberar ativações.',
  EMPRESA_INATIVA:'O acesso desta empresa está inativo. Entre em contato com o Espaço Prelúdio.',
  DATA_INVALIDA:'Informe uma data válida, até hoje, no formato solicitado.',
  DESLIGAMENTO_ANTERIOR_ADMISSAO:'O desligamento não pode ser anterior à admissão.',
  EMAIL_REPETIDO_PLANILHA:'E-mail repetido na planilha.', NOME_OBRIGATORIO:'Informe o nome completo.', EMAIL_INVALIDO:'Confira o e-mail informado.',
  TIPO_VINCULO_INVALIDO:'Tipo de vínculo inválido. Use clt, pj, estagiario, aprendiz, estatutario ou outro.',
  TIPO_VINCULO_OBRIGATORIO:'Mantenha um tipo de vínculo válido para o benefício aprovado.',
  CAMPO_INVALIDO:'Confira o tamanho e o conteúdo dos campos. Não use quebras de linha nos dados.',
  IMPORTACAO_LIMITE_100:'Importe de 1 a 100 colaboradores por arquivo.', MUITAS_SOLICITACOES:'Muitas solicitações. Aguarde alguns minutos.',
  COLABORADOR_JA_ATIVO:'Este colaborador já está aprovado.', COLABORADOR_JA_INATIVO:'Este vínculo já foi encerrado.',
  COLABORADOR_NAO_ENCONTRADO:'Colaborador não encontrado.', GESTAO_INDISPONIVEL:'A gestão está temporariamente indisponível. Tente novamente.' };
const friendly = e => errors[e?.code || e] || e?.message || 'Não foi possível concluir. Tente novamente.';
const dateLabel = value => value ? value.split('-').reverse().join('/') : '—';
const timestamp = value => new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
localStorage.removeItem('ep:empresa:token'); localStorage.removeItem('ep:empresa:nome');
const token = sessionStorage.getItem('ep:empresa:token');
if (!token) location.replace('./empresa-login.html');
let view='people', status='all', page=1, total=0, items=[], selected=new Set(), registrationPath=null, editing=null;
let action=null, targets=[], importRows=null, importRequestId=null, historyCursor=null, listSequence=0, listLoaded=false, toastTimer;
let actionBusy=false;

async function api(path, { method='GET', body, signal }={}) {
  const response=await fetch(`${BACKEND_BASE_URL}${path}`,{ method, cache:'no-store',signal,
    headers:{ Authorization:`Bearer ${token}`, ...(body?{'Content-Type':'application/json'}:{}) }, ...(body?{body:JSON.stringify(body)}:{}) });
  const data=await response.json().catch(()=>({}));
  if (response.status===401) { sessionStorage.removeItem('ep:empresa:token'); location.replace('./empresa-login.html'); throw new Error('Sua sessão expirou. Entre novamente.'); }
  if (!response.ok || data.ok!==true) throw Object.assign(new Error(errors[data.error]||'Não foi possível concluir. Tente novamente.'),{code:data.error,status:response.status});
  return data;
}
function toast(text) { $('toast').textContent=text; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,6500); }
function pageError(error) { $('pageErrorText').textContent=friendly(error); $('pageError').hidden=false; }
function params(limit=25,currentPage=page) { return new URLSearchParams({status,q:$('searchInput').value.trim(),departamento:$('departmentFilter').value,page:String(currentPage),limit:String(limit)}); }
function selection() {
  $('bulkBar').hidden=!selected.size; $('selectedCount').textContent=`${selected.size} selecionado(s)`;
  const count=items.filter(i=>selected.has(i.id)).length;
  $('selectAll').checked=items.length>0 && count===items.length; $('selectAll').indeterminate=count>0&&count<items.length;
  $('bulkApprove').disabled=!items.some(i=>selected.has(i.id)&&i.status!=='inativo'&&!i.benefitEligible);
  $('bulkDeactivate').disabled=!items.some(i=>selected.has(i.id)&&i.status!=='inativo');
}
function renderTable() {
  $('tableBody').innerHTML=items.length ? items.map((item,index)=>`<tr><td class="check-cell"><input type="checkbox" data-select="${esc(item.id)}" aria-label="Selecionar ${esc(item.nome)}" ${selected.has(item.id)?'checked':''}></td><td><div class="person"><span class="avatar avatar--${index%4}" aria-hidden="true">${esc(initials(item.nome))}</span><div><strong>${esc(item.nome)}</strong><small>${esc(item.email)}</small></div></div></td><td>${esc(item.departamento||'Não informado')}<span class="cell-secondary">${esc(item.cargo||'—')}</span></td><td><span class="tag">${esc(types[item.employmentType]||'Não classificado')}</span></td><td><span class="badge badge--${item.status==='ativo'&&!item.benefitEligible?'review':esc(item.status)}">${item.status==='ativo'&&!item.benefitEligible?'Revisar benefício':statuses[item.status]||'Pendente'}</span></td><td>${esc(dateLabel(item.admissionDate))}</td><td><div class="row-actions"><button class="button small" data-edit="${esc(item.id)}" aria-label="Editar ${esc(item.nome)}">Editar</button>${item.status==='inativo'?`<button class="button small approve" data-action="reactivate" data-id="${esc(item.id)}">Reativar</button>`:!item.benefitEligible?`<button class="button small approve" data-action="approve" data-id="${esc(item.id)}">Aprovar</button><button class="button small danger-text" data-action="deactivate" data-id="${esc(item.id)}">Encerrar</button>`:`<button class="button small danger-text" data-action="deactivate" data-id="${esc(item.id)}">Encerrar</button>`}</div></td></tr>`).join('')
    : '<tr><td colspan="7" class="empty"><strong>Nenhum colaborador nesta lista.</strong>Adicione uma pessoa ou ajuste os filtros de busca.</td></tr>';
  $('resultCount').textContent=total?`${(page-1)*25+1}–${Math.min(page*25,total)} de ${total} colaborador(es)`:'Nenhum resultado';
  $('pageInfo').textContent=`${page} / ${Math.max(1,Math.ceil(total/25))}`;
  $('prevPage').disabled=page===1; $('nextPage').disabled=page*25>=total; selection();
}
async function loadList() {
  const sequence=++listSequence;
  $('tableBody').setAttribute('aria-busy','true');
  try {
    const data=await api(`/empresa/colaboradores?${params()}`);
    if (sequence!==listSequence) return;
    if (page>1 && (page-1)*25>=data.total) {page=Math.max(1,Math.ceil(data.total/25));return loadList();}
    items=data.items; total=data.total; selected.clear(); registrationPath=data.registrationPath; listLoaded=true;
    const s=data.summary;
    for (const [id,key] of Object.entries({countTotal:'total',countActive:'ativo',countPending:'pendente',countInactive:'inativo',navCount:'total'})) $(id).textContent=s[key];
    const name=data.company.nome||'Sua empresa'; $('nomeEmpresaTop').textContent=name; $('nomeEmpresaH1').textContent=name; $('companyInitial').textContent=initials(name);
    $('activeNote').textContent=`${s.elegiveis} com benefício liberado ↗`;
    $('seatTitle').textContent=s.limite?`${s.ocupadas} de ${s.limite} vagas ocupadas`:'O cuidado começa com a equipe em dia.';
    $('seatDetail').textContent=!data.company.benefitActive?'Benefício da empresa inativo. Ativações ficam indisponíveis até a regularização.':s.limite?`${s.disponiveis} vaga(s) disponível(is). Vínculos ativos e pendentes ocupam vagas; encerrados liberam espaço.`:'Adicione pessoas, aprove cadastros e acompanhe as movimentações.';
    $('reviewNotice').hidden=s.ativo===s.elegiveis; $('reviewText').textContent=`${s.ativo-s.elegiveis} cadastro(s) com status ativo ainda precisam de validação para liberar o benefício.`;
    const previousDepartment=$('departmentFilter').value;
    $('departmentFilter').innerHTML='<option value="">Todos os departamentos</option>'+data.departments.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
    $('departmentFilter').value=data.departments.includes(previousDepartment)?previousDepartment:'';
    $('departmentOptions').innerHTML=data.departments.map(d=>`<option value="${esc(d)}"></option>`).join('');
    $('pageError').hidden=true; renderTable();
  } catch(error) {if(sequence===listSequence){listLoaded=false;items=[];selected.clear();total=0;renderTable();pageError(error);}}
  finally {if(sequence===listSequence)$('tableBody').removeAttribute('aria-busy');}
}
function setFilter(next) {status=next;page=1;selected.clear();document.querySelectorAll('[data-status]').forEach(b=>{b.classList.toggle('is-active',b.dataset.status===status);b.setAttribute('aria-pressed',String(b.dataset.status===status));});loadList();}
function setView(next) {
  view=next;const labels={people:['Colaboradores','Sua equipe, em um só lugar.'],analytics:['Indicadores','Cuidado que faz parte da equipe.'],history:['Movimentações','Cada vínculo tem uma história.']};
  for(const [name,id] of Object.entries({people:'viewPeople',analytics:'viewAnalytics',history:'viewHistory'}))$(id).hidden=name!==next;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('is-active',b.dataset.view===next);if(b.dataset.view===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('breadcrumb').textContent=labels[next][0];$('pageTitle').textContent=labels[next][1];$('pageError').hidden=true;
  history.replaceState(null,'',`#${next}`);
  if(next==='analytics')loadAnalytics();if(next==='history')loadHistory();
}
function openMember(item=null) {
  editing=item;const form=$('memberForm');form.reset();$('memberError').textContent='';
  for(const key of ['nome','email','telefone','departamento','cargo','employmentType','admissionDate'])form.elements[key].value=item?.[key]||'';
  $('memberTitle').textContent=item?'Editar colaborador':'Adicionar colaborador';$('memberEmail').readOnly=!!item;
  $('emailHint').textContent=item?'O e-mail identifica a conta do colaborador e é preservado neste cadastro.':'Use o e-mail que a pessoa utilizará para acessar sua conta.';
  $('createStatusLabel').hidden=!!item;$('createConfirmLabel').hidden=true;$('createConfirm').required=false;
  $('memberEmployment').required=!!item?.benefitEligible;$('memberAdmission').max=today();$('memberFacts').hidden=!item;
  if(item)$('memberFacts').textContent=item.status==='inativo'?`Vínculo encerrado em ${dateLabel(item.departureDate)}. Motivo: ${reasons[item.departureReason]||'Não informado'}. Use Reativar na lista para uma readmissão.`:`Situação: ${statuses[item.status]}. ${item.benefitEligible?'Benefício liberado.':'Aprovação do benefício pendente.'}`;
  $('memberDialog').showModal();
}
function openAction(next, list) {
  const eligible=list.filter(i=>next==='deactivate'?i.status!=='inativo':next==='reactivate'?i.status==='inativo':i.status!=='inativo'&&!i.benefitEligible);
  if(!eligible.length){toast('Nenhum cadastro selecionado permite esta ação.');return;}
  targets=eligible;action=next;const off=next==='deactivate',readmit=next==='reactivate',missing=eligible.some(i=>!i.employmentType);
  $('actionForm').reset();$('actionError').textContent='';
  $('actionTitle').textContent=off?'Encerrar vínculo com a empresa':readmit?'Reativar colaborador':'Aprovar benefício';
  $('actionIntro').textContent=eligible.length===1?eligible[0].nome+' · '+eligible[0].email:`Esta ação será aplicada a ${eligible.length} colaborador(es) selecionado(s).`;
  $('actionEmploymentLabel').hidden=off||!missing;$('actionEmployment').required=!off&&missing;
  $('actionDateLabel').hidden=!off&&!readmit;$('actionDate').required=off||readmit;$('actionDate').max=today();$('actionDate').value=today();
  $('actionDateText').textContent=readmit?'Data da readmissão':'Data do desligamento';$('actionReasonLabel').hidden=!off;
  $('actionPolicy').textContent=off?'O bloqueio do benefício vale a partir da confirmação, mesmo que a data informada seja anterior. Novas solicitações corporativas serão bloqueadas. Consultas já confirmadas, conta pessoal e histórico de cuidado são preservados. Pedidos cobertos ainda pendentes não poderão ser aprovados.':'A aprovação libera o benefício corporativo para uma conta com este mesmo e-mail, após a verificação do e-mail pelo colaborador. O escopo de NR-1 continua sujeito à avaliação técnica.';
  $('actionConfirmText').textContent=off?'Confirmo o encerramento dos vínculos e o bloqueio do benefício empresarial.':'Conferi os vínculos com a empresa e autorizo a liberação do benefício.';
  $('confirmAction').textContent=off?'Confirmar desligamento':readmit?'Confirmar reativação':'Confirmar aprovação';$('confirmAction').classList.toggle('danger',off);$('actionDialog').showModal();
}
async function refreshAfterWrite(){await loadList();if(view==='analytics')await loadAnalytics();if(view==='history')await loadHistory();}
async function loadAnalytics(){
  $('analyticsStatus').hidden=false;$('analyticsStatus').textContent='Carregando indicadores…';
  for(const id of ['kpiSessoesMes','kpiAdesao','kpiSessoesTotal'])$(id).textContent='—';
  try{
    const d=await api('/empresa/dashboard'),k=d.kpis||{};
    $('kpiSessoesMes').textContent=k.sessoesMes??'—';$('kpiAdesao').textContent=k.taxaAdesao==null?'—':`${k.taxaAdesao}%`;$('kpiSessoesTotal').textContent=k.sessoesTotal??'—';
    $('periodLabel').textContent=d.periodo?new Date(`${d.periodo}-15T12:00:00-03:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}):'Mês atual';
    $('analyticsStatus').hidden=!d.mascarado&&!d.dadosIncompletos;
    $('analyticsStatus').textContent=d.dadosIncompletos?'Indicadores ocultados: existem registros pendentes de reconciliação.':'Indicadores ocultados para proteger grupos com menos de cinco colaboradores distintos. O cadastro da equipe continua disponível.';
    const entries=Object.entries(d.especialidades||{}).filter(([,n])=>Number.isFinite(n)&&n>=0),max=Math.max(1,...entries.map(([,n])=>n));
    $('specialties').classList.toggle('empty',!entries.length);
    $('specialties').innerHTML=entries.length?entries.map(([name,n])=>`<div class="specialty-row"><div><span>${esc(name)}</span><strong>${n}</strong></div><div class="track"><div style="width:${Math.round(n/max*100)}%"></div></div></div>`).join(''):`<strong>${d.mascarado?'Dados em proteção':'Nenhuma consulta registrada no mês.'}</strong>${d.mascarado?'A distribuição será exibida quando houver dados suficientes para preservar a privacidade.':'Os atendimentos concluídos aparecerão aqui de forma agregada.'}`;
    $('poolInfo').hidden=!d.banco;if(d.banco)$('poolInfo').textContent=`Banco mensal: ${d.banco.limite} sessões. ${d.banco.usadas==null?'Uso protegido por privacidade.':`${d.banco.usadas} utilizadas.${d.banco.emAlerta?' Atenção: uso acima de 80%.':''}`}`;
    $('atualizadoEm').textContent=`Indicadores atualizados em ${timestamp(d.geradoEm||Date.now())}.`;
  }catch(error){$('analyticsStatus').textContent=friendly(error);$('specialties').textContent='Não foi possível carregar os indicadores.';$('poolInfo').hidden=true;}
}
async function loadHistory(append=false){
  if(!append){historyCursor=null;$('historyList').innerHTML='<p class="empty">Carregando movimentações…</p>';}
  $('moreHistory').disabled=true;
  try{
    const d=await api('/empresa/colaboradores/movimentacoes'+(historyCursor?`?cursor=${encodeURIComponent(historyCursor)}`:''));
    const content=d.items.map(e=>{
      const changed=['nome','telefone','departamento','cargo','employmentType','admissionDate','status','departureDate','departureReason'].filter(key=>e.before&&e.before[key]!==e.after?.[key]);
      const labels={nome:'Nome',telefone:'Telefone',departamento:'Departamento',cargo:'Cargo',employmentType:'Vínculo',admissionDate:'Admissão',status:'Situação',departureDate:'Desligamento',departureReason:'Motivo'};
      const value=(key,v)=>key==='status'?statuses[v]||v:key==='employmentType'?types[v]||v:key==='departureReason'?reasons[v]||v:key.endsWith('Date')?dateLabel(v):v;
      return `<article class="history-item"><span class="avatar">${icon(e.type==='desligamento'?'exit':e.type==='edicao'?'people':'check')}</span><div><strong>${esc(eventTypes[e.type]||e.type)} · ${esc(e.nome)}</strong><p>${esc(e.email)} · Por ${esc(e.actor)}</p>${changed.length?`<details><summary>Ver alterações</summary>${changed.map(key=>`<p>${labels[key]}: ${esc(value(key,e.before[key])||'—')} → ${esc(value(key,e.after?.[key])||'—')}</p>`).join('')}</details>`:''}</div><time datetime="${new Date(e.createdAt).toISOString()}">${esc(timestamp(e.createdAt))}</time></article>`;
    }).join('');
    if(append)$('historyList').insertAdjacentHTML('beforeend',content);else $('historyList').innerHTML=content||'<p class="empty"><strong>As próximas movimentações começam aqui.</strong>Cadastros e alterações feitos por esta gestão ficam registrados automaticamente.</p>';
    historyCursor=d.nextCursor||null;$('moreHistory').hidden=!historyCursor;
  }catch(error){pageError(error);if(!append)$('historyList').innerHTML='<p class="empty">Não foi possível carregar o histórico.</p>';}
  finally{$('moreHistory').disabled=false;}
}
function openInvite(){
  if(!registrationPath){toast('O link de cadastro ainda não está configurado para esta empresa.');return;}
  const staging=location.pathname.startsWith('/staging/')?'/staging':'';
  $('inviteLink').value=new URL(staging+registrationPath,location.origin).href;$('inviteFeedback').textContent='';$('inviteDialog').showModal();
}
function download(name,content){const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}

document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-status]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.status)));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{setFilter(b.dataset.filter);$('rosterTitle').scrollIntoView({block:'start',behavior:'smooth'});}));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(!actionBusy)b.closest('dialog').close();}));
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('cancel',e=>{if(actionBusy)e.preventDefault();});d.setAttribute('aria-labelledby',d.querySelector('h2').id||`${d.id}Title`);if(!d.querySelector('h2').id)d.querySelector('h2').id=`${d.id}Title`;});
$('retry').onclick=()=>view==='people'?loadList():view==='analytics'?loadAnalytics():loadHistory();
$('btnAdd').onclick=()=>openMember();$('memberStatus').onchange=()=>{const active=$('memberStatus').value==='ativo';$('createConfirmLabel').hidden=!active;$('createConfirm').required=active;$('memberEmployment').required=active;};
$('memberForm').onsubmit=async e=>{
  e.preventDefault();if(actionBusy)return;const form=e.currentTarget,body=Object.fromEntries(new FormData(form));
  $('memberError').textContent='';$('saveMember').disabled=true;actionBusy=true;
  try{
    if(editing){delete body.email;delete body.status;body.version=editing.version;await api(`/empresa/colaboradores/${encodeURIComponent(editing.id)}`,{method:'PATCH',body});}
    else{body.confirmEligibility=$('createConfirm').checked;await api('/empresa/colaboradores',{method:'POST',body});}
    $('memberDialog').close();toast(editing?'Cadastro atualizado.':'Colaborador cadastrado.');await refreshAfterWrite();
  }catch(error){$('memberError').textContent=friendly(error);}finally{$('saveMember').disabled=false;actionBusy=false;}
};
$('tableBody').onclick=e=>{const edit=e.target.closest('[data-edit]'),act=e.target.closest('[data-action]');if(edit)openMember(items.find(i=>i.id===edit.dataset.edit));if(act)openAction(act.dataset.action,[items.find(i=>i.id===act.dataset.id)]);};
$('tableBody').onchange=e=>{if(e.target.dataset.select){if(e.target.checked)selected.add(e.target.dataset.select);else selected.delete(e.target.dataset.select);selection();}};
$('selectAll').onchange=e=>{selected=new Set(e.target.checked?items.map(i=>i.id):[]);renderTable();};
$('clearSelection').onclick=()=>{selected.clear();renderTable();};
$('bulkApprove').onclick=()=>openAction('approve',items.filter(i=>selected.has(i.id)));$('bulkDeactivate').onclick=()=>openAction('deactivate',items.filter(i=>selected.has(i.id)));
$('actionForm').onsubmit=async e=>{
  e.preventDefault();if(actionBusy)return;actionBusy=true;$('confirmAction').disabled=true;$('actionError').textContent='';
  let completed=0;const failed=[];
  try{
    for(const item of targets){
      const body={action,version:item.version};
      if(action==='deactivate')Object.assign(body,{confirmDeactivation:$('actionConfirm').checked,departureDate:$('actionDate').value,departureReason:$('actionReason').value});
      else Object.assign(body,{confirmEligibility:$('actionConfirm').checked,employmentType:item.employmentType||$('actionEmployment').value,...(action==='reactivate'?{admissionDate:$('actionDate').value}:{})});
      try{await api(`/empresa/colaboradores/${encodeURIComponent(item.id)}`,{method:'PATCH',body});completed++;}catch(error){failed.push({item,error});}
    }
    if(failed.length){targets=failed.map(f=>f.item);$('actionError').textContent=`${completed} concluído(s). ${failed.length} não concluído(s):\n`+failed.map(f=>`${f.item.nome}: ${friendly(f.error)}`).join('\n');}
    else{$('actionDialog').close();toast(`${completed} movimentação(ões) concluída(s).`);}
    await refreshAfterWrite();
  }finally{actionBusy=false;$('confirmAction').disabled=false;}
};
let searchTimer;$('searchInput').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;loadList();},250);};$('departmentFilter').onchange=()=>{page=1;loadList();};
$('prevPage').onclick=()=>{if(page>1){page--;loadList();}};$('nextPage').onclick=()=>{if(page*25<total){page++;loadList();}};$('reviewFilter').onclick=()=>setFilter('revisar');
$('btnInvite').onclick=openInvite;$('analyticsInvite').onclick=openInvite;
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('inviteFeedback').textContent='Link copiado. Compartilhe no canal interno da empresa.';}catch{$('inviteLink').focus();$('inviteLink').select();$('inviteFeedback').textContent='Selecione e copie o link acima.';}};
$('btnImport').onclick=()=>{importRows=null;importRequestId=null;$('importFile').value='';$('importPreview').innerHTML='';$('importError').textContent='';$('commitImport').disabled=true;$('importDialog').showModal();};
let importSequence=0;
$('importFile').onchange=async()=>{
  const seq=++importSequence;const file=$('importFile').files[0];importRows=null;importRequestId=null;$('commitImport').disabled=true;$('importPreview').innerHTML='';$('importError').textContent='';if(!file)return;
  try{if(file.size>262144)throw new Error('Arquivo muito grande. O limite é 256 KB.');const rows=parseRosterCsv(await file.text());const d=await api('/empresa/colaboradores/importar/preview',{method:'POST',body:{rows}});if(seq!==importSequence)return;
    $('importPreview').innerHTML=`<table><thead><tr><th>Linha</th><th>Nome</th><th>E-mail</th><th>Validação</th></tr></thead><tbody>${d.rows.map(r=>`<tr><td>${r.line}</td><td>${esc(r.item.nome)}</td><td>${esc(r.item.email)}</td><td class="${r.error?'danger-text':''}">${r.error?esc(friendly(r.error)):'Pronto para cadastrar'}</td></tr>`).join('')}</tbody></table>`;
    if(d.capacityExceeded)$('importError').textContent=`A planilha excede as ${d.summary.disponiveis} vaga(s) disponíveis.`;
    else if(!d.valid)$('importError').textContent='Corrija as linhas indicadas e selecione o arquivo novamente. Nenhum cadastro foi salvo.';
    if(d.valid){importRows=rows;importRequestId=crypto.randomUUID();$('commitImport').disabled=false;}
  }catch(error){if(seq===importSequence)$('importError').textContent=friendly(error);}
};
$('commitImport').onclick=async()=>{if(!importRows||actionBusy)return;actionBusy=true;$('commitImport').disabled=true;$('importFile').disabled=true;
  try{const d=await api('/empresa/colaboradores/importar',{method:'POST',body:{rows:importRows,requestId:importRequestId}});$('importDialog').close();toast(`${d.items.length} colaborador(es) importado(s), aguardando aprovação.`);await refreshAfterWrite();}
  catch(error){$('importError').textContent=friendly(error);$('commitImport').disabled=false;}finally{actionBusy=false;$('importFile').disabled=false;}
};
$('downloadTemplate').onclick=()=>download('modelo-colaboradores.csv',rosterCsv(['nome','email','telefone','departamento','cargo','employmentType','admissionDate'],[['Nome do colaborador','pessoa@exemplo.com','','Operações','Analista','clt','']]));
$('btnExport').onclick=async()=>{
  $('btnExport').disabled=true;
  try{if(!listLoaded)throw new Error('Atualize a lista antes de exportar.');const exported=[];let p=1;
    while(true){const d=await api(`/empresa/colaboradores?${params(100,p)}`);exported.push(...d.items);if(p*100>=d.total)break;p++;}
    if(!exported.length){toast('Nenhum colaborador para exportar com estes filtros.');return;}
    const columns=['nome','email','telefone','departamento','cargo','employmentType','status','admissionDate','departureDate'];
    download(`colaboradores-${today()}.csv`,rosterCsv(columns,exported.map(item=>columns.map(k=>item[k]))));toast(`${exported.length} colaborador(es) exportado(s).`);
  }catch(error){pageError(error);}finally{$('btnExport').disabled=false;}
};
$('refreshHistory').onclick=()=>loadHistory();$('moreHistory').onclick=()=>loadHistory(true);
$('btnTrocarSenha').onclick=()=>{$('passwordForm').reset();$('passwordError').textContent='';$('passwordDialog').showModal();};
$('passwordForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));$('passwordError').textContent='';if(data.novaSenha!==data.confirmar){$('passwordError').textContent='As senhas não conferem.';return;}$('savePassword').disabled=true;actionBusy=true;try{await api('/empresa/senha',{method:'PATCH',body:{senhaAtual:data.senhaAtual,novaSenha:data.novaSenha}});sessionStorage.removeItem('ep:empresa:token');location.replace('./empresa-login.html');}catch(error){$('passwordError').textContent=error.code==='SENHA_ATUAL_INCORRETA'?'Senha atual incorreta.':friendly(error);}finally{$('savePassword').disabled=false;actionBusy=false;}};
$('btnSair').onclick=()=>{sessionStorage.removeItem('ep:empresa:token');sessionStorage.removeItem('ep:empresa:nome');location.replace('./empresa-login.html');};
if(token){await loadList();if(['analytics','history'].includes(location.hash.slice(1)))setView(location.hash.slice(1));}

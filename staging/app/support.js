import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { auth, BACKEND_BASE_URL } from '../js/firebase-config.js?h=69b74fc63a';

// Sensitive drafts and request data exist only in this page's memory.
const $ = id => document.getElementById(id);
const base = '/therapy/paciente/apoio';
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const statusLabels = { open: 'Pedido recebido', in_progress: 'Em acompanhamento', waiting_employee: 'Aguardando você', resolved: 'Solução proposta', closed: 'Concluído', cancelled: 'Cancelado' };
const outcomeLabels = { helped: 'Ajudou', need_support: 'Ainda preciso de apoio', continues: 'O problema continua' };
const actionLabels = { planned: 'Planejada', in_progress: 'Em andamento', done: 'Concluída' };
const categoryCopy = {
  overload: { phrase: 'Minha rotina ficou difícil de sustentar.', description: 'Sobrecarga, tarefas e limites.', icon: '<path d="M4 18h16M7 14h10M9 10h6M12 3v3"/>' },
  leadership: { phrase: 'Preciso ter uma conversa difícil.', description: 'Relações, confiança e liderança.', icon: '<path d="M4 4h16v12H9l-5 4V4zM8 8h8M8 12h5"/>' },
  personal: { phrase: 'Algo fora do trabalho está pesando.', description: 'Vida pessoal e o que afeta sua rotina.', icon: '<path d="M12 21s-9-5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 12-9 12z"/>' }
};
let user, context = { companies: [], categories: [] }, requests = [], nextCursor = null, actionsCursor = null;
let selectedRequest = null, step = 1, draftId = null, pendingPayload = null, busy = false, loadSerial = 0, actionsSerial = 0;
let dialogOpener = null;

function date(value, time = true) {
  if (!value) return 'A informar';
  const parsed = new Date(typeof value === 'object' && value._seconds ? value._seconds * 1000 : value);
  if (Number.isNaN(parsed.getTime())) return 'A informar';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(parsed);
}
function categoryLabel(id) { return context.categories.find(item => item.id === id)?.label || 'Pedido de apoio'; }
function companyById(id) { return context.companies.find(item => item.id === id); }
function selectedCompany() { return companyById($('requestCompany').value); }
function selectedRecipient() { return $('requestForm').querySelector('input[name="recipient"]:checked')?.value; }
function routeName(recipient) { return recipient === 'company' ? 'Equipe da organização' : 'Equipe de cuidado'; }
function routeOwner(company, recipient) { return company?.config?.[recipient === 'company' ? 'companyOwnerName' : 'careOwnerName'] || routeName(recipient); }
function enabled(company, recipient) { return company?.config?.enabled === true && company.config[recipient === 'company' ? 'companyEnabled' : 'careEnabled'] === true; }
function hasRoute(company) { return enabled(company, 'care') || enabled(company, 'company'); }
function closed(item) { return ['closed', 'cancelled'].includes(item.status); }
function overdue(item) { return !closed(item) && !['resolved', 'waiting_employee'].includes(item.status) && item.dueAt && new Date(item.dueAt).getTime() < Date.now(); }
function dueLabel(item) { return item.firstResponseAt ? 'Próximo retorno previsto' : 'Primeira resposta prevista'; }
function badge(status) { const safeStatus = Object.hasOwn(statusLabels, status) ? status : 'open'; return `<span class="sp-status sp-status--${safeStatus}">${esc(statusLabels[safeStatus])}</span>`; }
function notice(message = '', isError = false) { $('supportNotice').textContent = message; $('supportNotice').hidden = !message; $('supportNotice').classList.toggle('is-error', isError); }
function wizardError(message = '') { $('wizardError').textContent = message; $('wizardError').hidden = !message; if (message) $('wizardError').scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
const errorMessages = {
  PEDIDO_ENCERRADO: 'Este pedido já foi encerrado. Você pode abrir um novo pedido sempre que precisar.',
  CAMINHO_INDISPONIVEL: 'Este caminho de atendimento foi pausado pela organização. Atualize a página para ver os caminhos disponíveis.',
  VINCULO_OBRIGATORIO: 'Não encontramos um vínculo ativo com esta organização. Atualize a página ou fale com o RH.',
  LIMITE_DO_ACOMPANHAMENTO: 'Este acompanhamento atingiu o limite de mensagens. Abra um novo pedido para continuar.',
  MUITAS_SOLICITACOES: 'Há muitas tentativas neste momento. Aguarde um pouco e tente novamente.',
  PEDIDO_NAO_ENCONTRADO: 'Não encontramos este pedido. Atualize a lista para conferir seus pedidos.',
  ROTA_NAO_ENCONTRADA: 'A Central de apoio ainda não está disponível. Tente novamente mais tarde.'
};
function friendlyError(error) {
  if (errorMessages[error.message]) return errorMessages[error.message];
  if (error.status === 404) return 'A Central de apoio ainda não está disponível. Tente novamente mais tarde.';
  if (error.name === 'AbortError') return 'O atendimento demorou para responder. Tente novamente; o mesmo pedido será usado para evitar duplicidade.';
  if (error.status === 409) return 'Este pedido foi atualizado. Confira a versão mais recente antes de continuar.';
  if (error.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
  if (error.status === 403) return 'Seu acesso ou o caminho de atendimento mudou. Atualize a página para conferir a disponibilidade.';
  if (error.status === 429) return 'Há muitas tentativas neste momento. Aguarde um pouco e tente novamente.';
  if (error.status === 400) return 'Confira as informações e o consentimento antes de enviar.';
  return 'Não foi possível concluir agora. Confira sua conexão e tente novamente.';
}
async function api(path, options = {}) {
  if (!user) throw new Error('AUTH_REQUIRED');
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${BACKEND_BASE_URL}${base}${path}`, { ...options, cache: 'no-store', signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) { const error = new Error(data.error || 'REQUEST_FAILED'); error.status = response.status; throw error; }
    return data;
  } finally { clearTimeout(timeout); }
}
function post(path, body) { return api(path, { method: 'POST', body: JSON.stringify(body) }); }

function renderCategories() {
  const available = context.companies.some(hasRoute);
  $('categoryShortcuts').innerHTML = context.categories.map(category => {
    const copy = categoryCopy[category.id] || { phrase: category.label, description: 'Escolha um caminho de apoio.', icon: '<path d="M12 4v16M4 12h16"/>' };
    return `<button class="sp-category" type="button" data-category="${esc(category.id)}"${available ? '' : ' disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${copy.icon}</svg><span class="sp-category-arrow" aria-hidden="true">↗</span><strong>${esc(copy.phrase)}</strong><small>${esc(copy.description)}</small></button>`;
  }).join('');
  $('wizardCategories').innerHTML = context.categories.map(category => `<label class="sp-radio"><input type="radio" name="category" value="${esc(category.id)}" required><span><b>${esc(category.label)}</b><small>${esc(categoryCopy[category.id]?.description || '')}</small></span></label>`).join('');
}
function renderRequests() {
  $('requestsList').innerHTML = requests.length ? requests.map(item => {
    return `<button class="sp-request-row" type="button" data-request="${esc(item.id)}"><span class="sp-row-top">${badge(item.status)}${overdue(item) ? '<span class="sp-due">Prazo de resposta ultrapassado</span>' : ''}</span><strong>${esc(categoryLabel(item.category))} <span aria-hidden="true">↗</span></strong><small data-no-i18n>${esc(item.ownerName || routeName(item.recipient))} · ${esc(companyById(item.companyId)?.name || '')}</small><small data-no-i18n>${esc(item.nextStep || (closed(item) ? 'Consulte o histórico deste pedido.' : 'Aguardando o próximo passo da equipe.'))}</small><small>Aberto em ${esc(date(item.createdAt))}${!closed(item) && item.dueAt ? ` · ${dueLabel(item)}: ${esc(date(item.dueAt))}` : ''}</small></button>`;
  }).join('') : '<div class="sp-empty"><span class="sp-empty-symbol" aria-hidden="true">↗</span><h3>Seu primeiro passo começa aqui.</h3><p>Quando você enviar um pedido, poderá acompanhar a resposta e continuar a conversa neste espaço.</p></div>';
  $('loadMore').hidden = !nextCursor;
}
async function loadRequests(append = false) {
  $('refreshRequests').disabled = true;
  $('loadMore').disabled = true;
  try {
    const data = await api(`/requests${append && nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ''}`);
    const incoming = Array.isArray(data.items) ? data.items : [];
    requests = append ? [...requests, ...incoming.filter(item => !requests.some(current => current.id === item.id))] : incoming;
    nextCursor = data.nextCursor || null;
    renderRequests();
  } finally { $('refreshRequests').disabled = false; $('loadMore').disabled = false; }
}
async function loadActions(append = false) {
  const sequence = ++actionsSerial;
  const companyId = $('actionsCompany').value;
  $('retryActions').hidden = true;
  $('moreActions').disabled = true;
  if (!companyId) { $('collectiveActions').innerHTML = '<p class="sp-muted">Nenhuma organização vinculada à sua conta neste momento.</p>'; $('moreActions').hidden = true; return; }
  if (!append) { actionsCursor = null; $('collectiveActions').innerHTML = '<p class="sp-muted">Consultando ações publicadas…</p>'; }
  try {
    const data = await api(`/actions?companyId=${encodeURIComponent(companyId)}${append && actionsCursor ? `&cursor=${encodeURIComponent(actionsCursor)}` : ''}`);
    if (sequence !== actionsSerial) return;
    const markup = (data.items || []).map(action => `<article class="sp-action"><span class="sp-status">${esc(actionLabels[action.status] || 'Planejada')}</span><h3 data-no-i18n>${esc(action.title)}</h3><p data-no-i18n>${esc(action.description)}</p><small>Responsável: <span data-no-i18n>${esc(action.ownerName || 'A informar')}</span> · Prazo: ${esc(date(action.dueDate ? `${String(action.dueDate).slice(0, 10)}T12:00:00` : null, false))}</small></article>`).join('');
    if (append) $('collectiveActions').insertAdjacentHTML('beforeend', markup);
    else $('collectiveActions').innerHTML = markup || '<p class="sp-muted">Ainda não há ações coletivas publicadas. Quando sua organização compartilhar uma iniciativa, você poderá acompanhá-la aqui.</p>';
    actionsCursor = data.nextCursor || null;
    $('moreActions').hidden = !actionsCursor;
  } catch (error) {
    if (sequence !== actionsSerial) return;
    if (!append) $('collectiveActions').innerHTML = `<p class="sp-muted">${esc(friendlyError(error))}</p>`;
    $('retryActions').hidden = false;
  } finally { if (sequence === actionsSerial) $('moreActions').disabled = false; }
}
async function load() {
  const serial = ++loadSerial;
  notice('Consultando os caminhos de apoio disponíveis para você…');
  $('retryLoad').hidden = true;
  $('startRequest').disabled = true;
  try {
    const data = await api('/context');
    if (serial !== loadSerial) return;
    context = { companies: Array.isArray(data.companies) ? data.companies : [], categories: Array.isArray(data.categories) ? data.categories : [] };
    $('requestCompany').replaceChildren(...context.companies.map(company => new Option(company.name, company.id)));
    $('actionsCompany').replaceChildren(...context.companies.map(company => new Option(company.name, company.id)));
    $('actionsCompany').disabled = !context.companies.length;
    const available = context.companies.some(hasRoute) && context.categories.length > 0;
    $('startRequest').disabled = !available;
    const firstAvailable = context.companies.find(hasRoute);
    if (firstAvailable) $('requestCompany').value = firstAvailable.id;
    renderCategories();
    notice(available ? '' : context.companies.length
      ? 'O atendimento pela Central de apoio ainda não está habilitado para sua organização. Seus pedidos anteriores continuam disponíveis abaixo.'
      : 'Sua conta não está vinculada a uma organização com a Central de apoio. Se você trabalha em uma empresa parceira, peça ao RH para confirmar seu cadastro com este e-mail.');
    const results = await Promise.allSettled([loadRequests(), loadActions()]);
    if (results[0].status === 'rejected') { $('requestsList').innerHTML = '<p class="sp-muted">Não foi possível consultar seus pedidos. Use Atualizar para tentar novamente.</p>'; notice(friendlyError(results[0].reason), true); }
  } catch (error) { notice(friendlyError(error), true); $('retryLoad').hidden = false; }
}

function renderRecipients() {
  const company = selectedCompany();
  const previous = selectedRecipient();
  const routes = ['care', 'company'].filter(recipient => enabled(company, recipient));
  $('recipientChoices').innerHTML = routes.map(recipient => `<label class="sp-radio"><input type="radio" name="recipient" value="${recipient}"${(previous === recipient || routes.length === 1) ? ' checked' : ''} required><span><b>${esc(routeName(recipient))}</b><small>${esc(routeOwner(company, recipient))}</small><small>${recipient === 'care' ? 'Seu relato e sua identificação serão enviados à equipe de cuidado habilitada. A equipe da organização não acessa esta conversa.' : 'Seu relato e sua identificação serão enviados à equipe da organização. Escolha este caminho se deseja conversar diretamente com ela.'}</small></span></label>`).join('');
  $('routeDetails').innerHTML = routes.length ? `<strong>Quando esperar uma resposta</strong>${Number(company.config.responseHours) > 0 ? `Primeira resposta prevista em até ${esc(company.config.responseHours)} horas corridas após o envio. O prazo inclui noites, fins de semana e feriados.` : 'Consulte a equipe sobre o prazo de resposta.'}${company.config.contact ? `<br>Contato informado: ${esc(company.config.contact)}` : ''}<br>Este canal não oferece resposta imediata.` : '<strong>Nenhum caminho habilitado nesta organização</strong>Escolha outra organização vinculada à sua conta ou consulte os atendimentos disponíveis no portal.';
}
function renderReview() {
  const company = selectedCompany(), recipient = selectedRecipient();
  const category = $('requestForm').querySelector('input[name="category"]:checked')?.value;
  $('sharingPreview').innerHTML = `<h3>Confira exatamente o que será enviado</h3><dl><dt>Destinatário</dt><dd>${esc(routeName(recipient))} · ${esc(routeOwner(company, recipient))}<br>${esc(company?.name)}</dd><dt>Sua identificação</dt><dd>${esc(user.displayName || 'Seu nome cadastrado')}<br>${esc(user.email || 'Seu e-mail cadastrado')}</dd><dt>Tema</dt><dd>${esc(categoryLabel(category))}</dd><dt>Seu relato</dt><dd data-no-i18n>${esc($('requestText').value.trim())}</dd><dt>O que ajudaria</dt><dd${$('requestNeed').value.trim() ? ' data-no-i18n' : ''}>${esc($('requestNeed').value.trim() || 'Você não preencheu este campo.')}</dd><dt>Quem pode acompanhar</dt><dd>${recipient === 'care' ? 'Você e a equipe de cuidado autorizada. A equipe da organização não acessa o relato.' : 'Você e a equipe autorizada da sua organização. Este pedido é identificado.'}</dd></dl>`;
  $('sharingConsentText').textContent = `Autorizo o envio do meu nome, e-mail, tema, relato e necessidade para ${routeName(recipient).toLowerCase()} (${routeOwner(company, recipient)}), para receber e acompanhar este apoio.`;
}
function showStep(next) {
  step = next;
  wizardError();
  for (let index = 1; index <= 3; index++) { $(`wizardStep${index}`).hidden = index !== step; $(`wizardStep${index}`).disabled = index !== step; }
  document.querySelectorAll('.sp-steps li').forEach(item => { if (Number(item.dataset.step) === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current'); });
  const titles = ['O que você está carregando?', 'Com quem você quer conversar?', 'Você decide o que compartilhar.'];
  const subtitles = ['Escreva apenas o que se sentir à vontade para compartilhar.', 'Escolha o caminho que faz sentido para esta situação.', 'Leia com calma. O envio acontece somente com sua autorização.'];
  $('wizardTitle').textContent = titles[step - 1]; $('wizardSubtitle').textContent = subtitles[step - 1];
  $('previousStep').hidden = step === 1 || !!pendingPayload;
  $('nextStep').hidden = step === 3; $('sendRequest').hidden = step !== 3;
  $('discardDraft').hidden = !!pendingPayload;
  if (step === 2) renderRecipients();
  if (step === 3) renderReview();
  $('wizardTitle').focus();
}
function openWizard(category) {
  dialogOpener = document.activeElement;
  if (!draftId) {
    draftId = crypto.randomUUID();
    $('requestForm').reset();
    const company = context.companies.find(hasRoute);
    if (company) $('requestCompany').value = company.id;
    step = 1;
  }
  if (category && !pendingPayload) { const radio = [...$('wizardCategories').querySelectorAll('input')].find(item => item.value === category); if (radio) radio.checked = true; }
  $('requestDialog').showModal();
  showStep(step);
}
function closeWizard() { if (busy) return; $('requestDialog').close(); dialogOpener?.focus(); }
function clearDraft() { draftId = null; pendingPayload = null; step = 1; $('requestForm').reset(); $('sharingConsent').disabled = false; $('aggregateConsent').disabled = false; $('sendRequest').textContent = 'Enviar meu pedido'; }
function validateStep() {
  if (step === 1) {
    if (!hasRoute(selectedCompany())) { wizardError('Esta organização ainda não tem um caminho de apoio habilitado.'); return false; }
    if (!$('requestForm').querySelector('input[name="category"]:checked')) { wizardError('Escolha o tema que mais se aproxima da sua situação.'); $('wizardCategories').querySelector('input')?.focus(); return false; }
    if ($('requestText').value.trim().length < 10) { wizardError('Conte um pouco mais sobre a situação, com pelo menos 10 caracteres.'); $('requestText').focus(); return false; }
    if ($('requestText').value.length > 4000 || $('requestNeed').value.length > 1000) { wizardError('Reduza o texto para respeitar o limite indicado.'); return false; }
  }
  if (step === 2 && !enabled(selectedCompany(), selectedRecipient())) { wizardError('Escolha um dos caminhos de atendimento disponíveis.'); $('recipientChoices').querySelector('input')?.focus(); return false; }
  return true;
}
async function submitRequest(event) {
  event.preventDefault();
  if (busy || step !== 3) return;
  if (!pendingPayload && !$('sharingConsent').checked) { wizardError('Marque a autorização de envio para compartilhar este pedido com o destinatário escolhido.'); $('sharingConsent').focus(); return; }
  if (!pendingPayload) pendingPayload = { requestId: draftId, companyId: $('requestCompany').value, category: $('requestForm').querySelector('input[name="category"]:checked')?.value, recipient: selectedRecipient(), text: $('requestText').value.trim(), need: $('requestNeed').value.trim(), consent: true, aggregateConsent: $('aggregateConsent').checked };
  busy = true; wizardError();
  $('sendRequest').disabled = true; $('sendRequest').textContent = 'Enviando seu pedido…';
  $('previousStep').hidden = true; $('discardDraft').hidden = true;
  $('sharingConsent').disabled = true; $('aggregateConsent').disabled = true; $('closeWizard').disabled = true;
  try {
    const data = await post('/requests', pendingPayload);
    if (!data.item?.id) throw new Error('INVALID_RESPONSE');
    busy = false;
    $('requestDialog').close(); clearDraft();
    upsertRequest(data.item);
    renderDetail(data.item);
    notice('Seu pedido foi recebido. Você pode acompanhar a resposta e os próximos passos aqui.');
  } catch (error) {
    wizardError(`${friendlyError(error)} Seu texto permanece nesta página. Ao tentar novamente, enviaremos o mesmo pedido.`);
    $('sendRequest').textContent = 'Tentar enviar novamente';
  } finally { busy = false; $('sendRequest').disabled = false; $('closeWizard').disabled = false; }
}
function upsertRequest(item) { const index = requests.findIndex(current => current.id === item.id); if (index < 0) requests.unshift(item); else requests[index] = item; renderRequests(); }
function eventLabel(event) {
  const map = { created: 'Pedido recebido', assigned: 'Responsável atualizado', status_changed: 'Andamento atualizado', updated: 'Próximo passo atualizado', message: 'Mensagem registrada', message_added: 'Mensagem registrada', feedback: 'Seu retorno foi registrado', employee_feedback: 'Seu retorno foi registrado', cancelled: 'Pedido cancelado', cancel: 'Pedido cancelado', update: 'Próximo passo atualizado', resolved: 'Solução proposta', closed: 'Pedido concluído', reopened: 'Acompanhamento retomado' };
  const label = map[event.type] || 'Acompanhamento atualizado';
  return `${label}${event.status && statusLabels[event.status] ? ` · ${statusLabels[event.status]}` : ''}`;
}
function renderDetail(item) {
  selectedRequest = item;
  $('supportHome').hidden = true; $('requestDetail').hidden = false;
  const terminal = closed(item);
  $('requestDetail').innerHTML = `<button id="backToRequests" class="sp-text-button" type="button">← Voltar para a central</button><div class="sp-detail-head"><div>${badge(item.status)}<h2 id="detailTitle" tabindex="-1">${esc(categoryLabel(item.category))}</h2><p class="sp-muted">${esc(companyById(item.companyId)?.name || '')} · Aberto em ${esc(date(item.createdAt))}</p></div><button id="refreshDetail" class="sp-button sp-button--light" type="button">Atualizar pedido</button></div><div id="detailNotice" class="sp-notice" role="status" hidden></div><dl class="sp-metadata"><div><dt>Quem acompanha</dt><dd data-no-i18n>${esc(item.ownerName || routeName(item.recipient))}</dd></div><div><dt>Destinatário</dt><dd>${esc(routeName(item.recipient))}</dd></div><div><dt>${dueLabel(item)}</dt><dd>${esc(date(item.dueAt))}</dd></div><div><dt>Próximo passo</dt><dd data-no-i18n>${esc(item.nextStep || (terminal ? 'Você pode consultar o histórico abaixo.' : 'Aguardando orientação da equipe.'))}</dd></div></dl><div class="sp-detail-grid"><section class="sp-panel"><div class="sp-section-heading"><div><span class="sp-eyebrow">O que você compartilhou</span><h2>Seu pedido</h2></div></div><div class="sp-original"><h3>Sua situação</h3><p data-no-i18n>${esc(item.text)}</p>${item.need ? `<h3>O que ajudaria</h3><p data-no-i18n>${esc(item.need)}</p>` : ''}</div><div class="sp-divider"></div><h3>Conversa com a equipe</h3><p class="sp-muted">${item.recipient === 'care' ? 'Apenas você e a equipe de cuidado autorizada acompanham esta conversa.' : 'Você e a equipe autorizada da organização acompanham esta conversa.'}</p><div id="requestMessages">${(item.messages || []).map(message => `<article class="sp-message${message.actor === 'employee' ? ' sp-message--employee' : ''}"><header><strong>${message.actor === 'employee' ? 'Você' : esc(message.authorName || item.ownerName || routeName(item.recipient))}</strong><time>${esc(date(message.at))}</time></header><p data-no-i18n>${esc(message.text)}</p></article>`).join('') || '<p class="sp-muted">A primeira resposta da equipe aparecerá aqui.</p>'}</div>${!terminal ? '<form id="replyForm"><label class="sp-field"><span>Continuar a conversa</span><textarea id="replyText" rows="3" maxlength="3000" required placeholder="Compartilhe uma atualização ou tire uma dúvida…"></textarea></label><button id="sendReply" class="sp-button" type="submit">Enviar mensagem</button></form>' : '<p class="sp-muted">Este pedido foi encerrado. Você pode abrir um novo pedido sempre que precisar.</p>'}${!terminal ? `<section class="sp-feedback"><h3>Como está para você?</h3><p class="sp-muted">${item.status === 'resolved' ? 'A equipe propôs uma solução. Conte se ajudou: ao confirmar, o pedido é concluído.' : 'Seu retorno ajuda a equipe a entender se o apoio fez diferença. Ao dizer que ajudou, o pedido é concluído.'}</p>${item.feedback?.outcome ? `<p class="sp-muted">Último retorno: ${esc(outcomeLabels[item.feedback.outcome] || 'Registrado')}.</p>` : ''}<label class="sp-field"><span>Quer acrescentar algo? <small>(opcional)</small></span><textarea id="feedbackText" rows="2" maxlength="1200"></textarea></label><div class="sp-feedback-buttons"><button type="button" data-feedback="helped">Ajudou</button><button type="button" data-feedback="need_support">Ainda preciso de apoio</button><button type="button" data-feedback="continues">O problema continua</button></div></section>` : ''}</section><aside><section class="sp-panel"><span class="sp-eyebrow">Do primeiro passo até aqui</span><h2>Histórico do pedido</h2><ol class="sp-timeline">${(item.events?.length ? item.events : [{ type: 'created', at: item.createdAt }]).map(event => `<li>${esc(eventLabel(event))}<time>${esc(date(event.at))}</time></li>`).join('')}</ol><p class="sp-muted">Você pode atualizar esta página para conferir novas respostas.</p></section>${!terminal ? '<div class="sp-cancel"><button id="showCancel" class="sp-text-button" type="button">Cancelar este pedido</button><div id="cancelPanel" class="sp-cancel-panel" hidden><strong>Deseja encerrar este pedido?</strong><p>A equipe verá que você cancelou. O histórico será mantido para acompanhamento.</p><button id="confirmCancel" class="sp-button sp-button--light" type="button">Confirmar cancelamento</button><button id="keepRequest" class="sp-text-button" type="button">Manter pedido</button></div></div>' : ''}</aside></div>`;
  $('detailTitle').focus();
}
async function openRequest(id) {
  if (busy) return;
  busy = true; notice('Consultando seu pedido…');
  try { const data = await api(`/requests/${encodeURIComponent(id)}`); if (!data.item?.id) throw new Error('INVALID_RESPONSE'); renderDetail(data.item); notice(); }
  catch (error) { notice(friendlyError(error), true); }
  finally { busy = false; }
}
async function mutateRequest(kind, body = {}) {
  if (busy || !selectedRequest) return;
  busy = true;
  const id = selectedRequest.id;
  $('detailNotice').hidden = false; $('detailNotice').classList.remove('is-error'); $('detailNotice').textContent = 'Registrando sua atualização…';
  $('requestDetail').querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    const data = await post(`/requests/${encodeURIComponent(id)}/${kind}`, { ...body, version: selectedRequest.version });
    if (!data.item?.id) throw new Error('INVALID_RESPONSE');
    upsertRequest(data.item); renderDetail(data.item);
    $('detailNotice').hidden = false;
    $('detailNotice').textContent = kind === 'messages' ? 'Mensagem enviada.' : kind === 'cancel' ? 'Pedido cancelado.' : body.outcome === 'helped' ? 'Obrigado por contar. Seu retorno foi registrado.' : 'Seu retorno foi registrado. A equipe poderá continuar o acompanhamento.';
  } catch (error) {
    // Do not repeat writes automatically: a fresh version must be reviewed first.
    if (error.status === 409) {
      const replyDraft = $('replyText')?.value, feedbackDraft = $('feedbackText')?.value;
      try { const fresh = await api(`/requests/${encodeURIComponent(id)}`); if (fresh.item) { upsertRequest(fresh.item); renderDetail(fresh.item); if ($('replyText')) $('replyText').value = replyDraft || ''; if ($('feedbackText')) $('feedbackText').value = feedbackDraft || ''; } } catch { /* The explicit refresh button remains available. */ }
    }
    $('detailNotice').hidden = false; $('detailNotice').classList.add('is-error'); $('detailNotice').textContent = friendlyError(error);
  } finally { busy = false; $('requestDetail').querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}

$('startRequest').addEventListener('click', () => openWizard());
$('categoryShortcuts').addEventListener('click', event => { const target = event.target.closest('[data-category]'); if (target && !target.disabled) openWizard(target.dataset.category); });
$('closeWizard').addEventListener('click', closeWizard);
$('requestDialog').addEventListener('cancel', event => { event.preventDefault(); closeWizard(); });
$('discardDraft').addEventListener('click', () => { closeWizard(); clearDraft(); });
$('requestCompany').addEventListener('change', () => { $('sharingConsent').checked = false; renderRecipients(); });
$('nextStep').addEventListener('click', () => { if (validateStep()) showStep(step + 1); });
$('previousStep').addEventListener('click', () => { $('sharingConsent').checked = false; showStep(step - 1); });
$('requestForm').addEventListener('submit', submitRequest);
$('requestsList').addEventListener('click', event => { const button = event.target.closest('[data-request]'); if (button) openRequest(button.dataset.request); });
$('retryLoad').addEventListener('click', load);
$('refreshRequests').addEventListener('click', async () => { try { await loadRequests(); notice(); } catch (error) { notice(friendlyError(error), true); } });
$('loadMore').addEventListener('click', async () => { try { await loadRequests(true); } catch (error) { notice(friendlyError(error), true); } });
$('actionsCompany').addEventListener('change', () => loadActions());
$('retryActions').addEventListener('click', () => loadActions());
$('moreActions').addEventListener('click', () => loadActions(true));
$('requestDetail').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || busy) return;
  if (button.id === 'backToRequests') { $('requestDetail').hidden = true; $('supportHome').hidden = false; selectedRequest = null; notice(); $('refreshRequests').focus(); }
  if (button.id === 'refreshDetail') openRequest(selectedRequest.id);
  if (button.dataset.feedback) mutateRequest('feedback', { outcome: button.dataset.feedback, text: $('feedbackText')?.value.trim() || '' });
  if (button.id === 'showCancel') { $('cancelPanel').hidden = false; $('confirmCancel').focus(); }
  if (button.id === 'keepRequest') { $('cancelPanel').hidden = true; $('showCancel').focus(); }
  if (button.id === 'confirmCancel') mutateRequest('cancel');
});
$('requestDetail').addEventListener('submit', event => { if (event.target.id !== 'replyForm') return; event.preventDefault(); const text = $('replyText').value.trim(); if (text && text.length <= 3000) mutateRequest('messages', { text }); else $('replyText').focus(); });
window.addEventListener('beforeunload', event => { if (draftId && $('requestText').value.trim()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
onAuthStateChanged(auth, account => {
  if (!account) { user = null; requests = []; context = { companies: [], categories: [] }; $('requestsList').replaceChildren(); $('requestDetail').replaceChildren(); clearDraft(); location.replace(`./login.html?redirect=${encodeURIComponent('./apoio.html')}`); return; }
  user = account;
  load();
});

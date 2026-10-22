import test from 'node:test';
import assert from 'node:assert/strict';
import { browserFixture, chrome, poll } from './helpers/support-browser.mjs';

const mockAuth = `
const auth = { currentUser: null }; const BACKEND_BASE_URL = location.origin;
let listener;
function onAuthStateChanged(_, callback) { listener = callback; queueMicrotask(() => callback(auth.currentUser)); }
async function signInWithEmailAndPassword(_, email) { const user = { uid: email, email, getIdToken: async () => email }; auth.currentUser = user; queueMicrotask(() => listener(user)); return { user }; }
async function signOut() { auth.currentUser = null; listener(null); }
window.__mfa = 0; async function ensureMfa() { window.__mfa++; }
if (document.body.dataset.supportRole === 'empresa') sessionStorage.setItem('ep:empresa:token', 'company-test');
`;
const initialConfig = () => ({ enabled: false, careEnabled: false, companyEnabled: false, careOwnerName: '', companyOwnerName: '', contact: '', responseHours: 48 });
const initialRequest = recipient => ({ id: 'req-one', companyId: 'company-one', recipient, category: 'overload', status: 'open', version: 1, text: 'Não consigo conciliar todas as tarefas.', need: 'Gostaria de rever a distribuição de tarefas.', employeeName: 'Ana', employeeEmail: 'ana@example.test', createdAt: Date.now(), dueAt: Date.now() + 86400000, ownerName: '', nextStep: '', messages: [], events: [] });

test('empresa acompanha pedido, preserva mensagem em conflito, publica ação e configura somente sua equipe', { timeout: 40000, skip: !chrome }, async t => {
  let config = initialConfig(), item = initialRequest('company'), actions = [], conflict = true;
  const calls = [];
  const b = await browserFixture(t, { route: '/empresa-apoio.html', script: '/js/workplace-support-management.js', mockAuth, api: async (method, url, body, headers) => {
    assert.equal(headers.authorization, 'Bearer company-test'); calls.push({ method, path: url.pathname, body });
    const path = url.pathname.replace('/empresa/apoio', '');
    if (path === '/config') { if (method === 'PUT') { assert.equal('careEnabled' in body, false); config = { ...config, ...body }; } return { config }; }
    if (path === '/requests') return { items: [item, { ...item, id: 'private', recipient: 'care', employeeName: 'Não deve aparecer' }] };
    if (path === '/requests/req-one' && method === 'GET') return { item };
    if (path === '/requests/req-one' && method === 'PATCH') { assert.equal(body.version, item.version); item = { ...item, ...body, version: item.version + 1 }; return { item }; }
    if (path === '/requests/req-one/messages') {
      if (conflict) { conflict = false; item.version++; return { status: 409, body: { error: 'VERSAO_DESATUALIZADA' } }; }
      assert.equal(body.version, item.version); item.version++; item.messages.push({ text: body.text, actor: 'company', at: Date.now() }); return { item };
    }
    if (path === '/actions' && method === 'GET') return { items: actions };
    if (path === '/actions' && method === 'POST') { actions.push({ ...body, id: 'action-one', version: 1 }); return { item: actions[0] }; }
    if (path === '/actions/action-one') { assert.equal(body.version, 1); actions[0] = { ...actions[0], ...body, version: 2 }; return { item: actions[0] }; }
    if (path === '/summary') return { summary: { suppressed: true, threshold: 10, period: '2026-09' } };
    throw new Error('Unexpected route');
  } });
  const ev = b.evaluate;
  await poll(() => ev('document.querySelectorAll(".ap-request").length === 1'), 'company inbox');
  assert.equal(await ev('document.body.textContent.includes("Não deve aparecer")'), false);
  await ev('document.querySelector(".ap-request").click()');
  await poll(() => ev('!!document.querySelector("#requestPlanForm")'), 'request detail');
  assert.equal(await ev('[...document.querySelector("#requestPlanForm").elements.status.options].some(o => o.value === "closed")'), false);
  await ev(`(() => { const f=document.querySelector('#requestPlanForm'); f.elements.ownerName.value='Equipe Pessoas'; f.elements.nextStep.value='Conversar sobre a distribuição de tarefas amanhã.'; f.elements.status.value='in_progress'; f.requestSubmit(); })()`);
  await poll(() => item.status === 'in_progress', 'request update');
  const patch = calls.find(call => call.method === 'PATCH' && call.path.endsWith('/requests/req-one'));
  assert.equal('dueAt' in patch.body, false, 'prazo inalterado não é reenviado (um prazo vencido não pode travar a edição)');
  await poll(() => ev('!document.querySelector("#requestPlanForm button").disabled'), 'update finished');
  await ev(`(() => { const f=document.querySelector('#replyForm'); f.elements.text.value='Vamos organizar essa conversa com você.'; f.requestSubmit(); })()`);
  await poll(() => ev('document.querySelector("#message").textContent.includes("preservada")'), 'version conflict');
  assert.equal(await ev('document.querySelector("#replyForm").elements.text.value'), 'Vamos organizar essa conversa com você.');
  await ev('document.querySelector("#replyForm").requestSubmit()');
  await poll(() => item.messages.length === 1, 'reply saved');
  await ev('document.querySelector("#tab-actions").click()');
  await poll(() => ev('!document.querySelector("#panel-actions").hidden'), 'actions visible');
  await ev(`(() => { const f=document.querySelector('#actionForm'); f.elements.title.value='Revisar carga de trabalho'; f.elements.description.value='Revisar as tarefas com a equipe e acompanhar o resultado.'; f.elements.ownerName.value='Equipe Pessoas'; f.elements.dueDate.value='2027-01-20'; f.requestSubmit(); })()`);
  await poll(() => ev('!!document.querySelector(".ap-action button")'), 'action created');
  await ev('document.querySelector(".ap-action button").click(); document.querySelector("#actionForm").elements.status.value="in_progress"; document.querySelector("#actionForm").requestSubmit()');
  await poll(() => actions[0]?.version === 2, 'versioned action edit');
  await ev('document.querySelector("#tab-settings").click()');
  assert.equal(await ev('document.querySelector("#configForm").elements.careEnabled.disabled'), true);
  await ev(`(() => { const f=document.querySelector('#configForm'); f.elements.enabled.checked=true; f.elements.companyEnabled.checked=true; f.elements.companyOwnerName.value='Equipe Pessoas'; f.elements.contact.value='pessoas@example.test'; f.requestSubmit(); })()`);
  await poll(() => config.enabled, 'company configured');
  await ev('document.querySelector("#tab-impact").click()');
  await poll(() => ev('document.querySelector("#summary").textContent.includes("10 participantes")'), 'small cohort suppressed');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.deepEqual(b.errors, []);
});

test('admin verifica acesso e MFA antes de abrir caixa de cuidado e habilitar serviço', { timeout: 30000, skip: !chrome }, async t => {
  let config = initialConfig(); const item = initialRequest('care');
  const b = await browserFixture(t, { route: '/admin-apoio.html', script: '/js/workplace-support-management.js', mockAuth, api: async (method, url, body, headers) => {
    if (headers.authorization !== 'Bearer admin@example.test') return { status: 403, body: { error: 'NAO_AUTORIZADO' } };
    if (url.pathname.endsWith('/companies')) return { companies: [{ id: 'company-one', name: 'Empresa Exemplo', config }] };
    if (url.pathname.endsWith('/companies/company-one/config')) { config = { ...config, ...body }; return { config }; }
    if (url.pathname.endsWith('/requests')) { assert.equal(url.searchParams.get('companyId'), 'company-one'); return { items: [item] }; }
    if (url.pathname.endsWith('/requests/req-one')) return { item };
    throw new Error('Unexpected route');
  } });
  const ev = b.evaluate;
  await poll(() => ev('document.querySelector("#accessMessage").textContent.includes("Entre com sua conta")'), 'login prompt');
  await ev(`(() => { const f=document.querySelector('#adminLoginForm'); f.elements.email.value='other@example.test'; f.elements.password.value='password'; f.requestSubmit(); })()`);
  await poll(() => ev('document.querySelector("#accessMessage").textContent.includes("não tem acesso")'), 'access denied');
  assert.equal(await ev('document.querySelector("#workspace").hidden'), true);
  await ev(`(() => { const f=document.querySelector('#adminLoginForm'); f.elements.email.value='admin@example.test'; f.elements.password.value='password'; f.requestSubmit(); })()`);
  await poll(() => ev('!document.querySelector("#workspace").hidden'), 'admin workspace');
  assert.ok(await ev('window.__mfa') >= 2);
  await ev('document.querySelector("#companySelect").value="company-one"; document.querySelector("#companySelect").dispatchEvent(new Event("change"))');
  await poll(() => ev('document.querySelectorAll(".ap-request").length === 1'), 'care inbox');
  await ev('document.querySelector("#tab-settings").click()');
  await ev(`(() => { const f=document.querySelector('#configForm'); f.elements.enabled.checked=true; f.elements.careEnabled.checked=true; f.elements.careOwnerName.value='Equipe de acolhimento'; f.elements.contact.value='cuidado@example.test'; f.requestSubmit(); })()`);
  await poll(() => config.careEnabled, 'care activated');
  assert.deepEqual(b.errors, []);
});

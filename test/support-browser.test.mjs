import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chrome, root, browserFixture, poll } from './helpers/support-browser.mjs';

test('apoio: consentimento, tentativa idempotente, acompanhamento e telas responsivas', {
  timeout: 60000, skip: !chrome && 'Chrome/Edge indisponível'
}, async t => {
  const config = { enabled: true, careEnabled: true, companyEnabled: true, careOwnerName: 'Equipe de acolhimento', companyOwnerName: 'Equipe de pessoas', responseHours: 48, contact: 'apoio@example.test' };
  const items = [], creates = [];
  const mockAuth = `const mockUser={uid:'employee-test',displayName:'Pessoa de teste',email:'pessoa@example.test',getIdToken:async()=> 'synthetic-token'};
    const auth={currentUser:mockUser};const BACKEND_BASE_URL=location.origin;
    function onAuthStateChanged(_auth,fn){queueMicrotask(()=>fn(mockUser));return ()=>{};}`;
  const fixture = await browserFixture(t, { route: '/app/apoio.html', script: '/app/support.js', mockAuth,
    async api(method, url, body, headers) {
      assert.equal(headers.authorization, 'Bearer synthetic-token');
      const path = url.pathname;
      if (path.endsWith('/context')) return { ok: true, companies: [{ id: 'company-test', name: 'Empresa de teste', config }], categories: [{ id: 'overload', label: 'Minha rotina ficou impossível' }, { id: 'leadership', label: 'Preciso de apoio para uma conversa' }, { id: 'personal', label: 'Uma situação pessoal está afetando minha rotina' }] };
      if (path.endsWith('/actions')) return { ok: true, items: [{ id: 'action-test', title: 'Revisar a distribuição de tarefas', description: 'Escuta da equipe e revisão das prioridades.', ownerName: 'Equipe de pessoas', dueDate: '2026-12-10', status: 'in_progress' }] };
      if (path.endsWith('/requests') && method === 'GET') return { ok: true, items, nextCursor: null };
      if (path.endsWith('/requests') && method === 'POST') {
        creates.push(structuredClone(body));
        if (!items.length) items.push({ ...body, id: 'request-test', status: 'open', version: 1, employeeName: 'Pessoa de teste', employeeEmail: 'pessoa@example.test', ownerName: config.careOwnerName, createdAt: Date.now(), updatedAt: Date.now(), dueAt: Date.now() + 172800000, nextStep: 'Vamos ler e responder por aqui.', messages: [], events: [{ type: 'created', at: Date.now(), actor: 'employee' }] });
        if (creates.length === 1) return { status: 503, body: { ok: false, error: 'APOIO_INDISPONIVEL' } };
        return { ok: true, item: items[0] };
      }
      const item = items[0];
      if (path.endsWith('/messages')) {
        assert.equal(body.version, item.version);
        item.messages.push({ id: 'message-test', actor: 'employee', text: body.text, at: Date.now() }); item.version++;
      }
      if (path.endsWith('/feedback')) { assert.equal(body.version, item.version); item.feedback = { outcome: body.outcome, at: Date.now() }; item.status = body.outcome === 'helped' ? 'closed' : 'in_progress'; item.version++; }
      return { ok: true, item };
    }
  });
  const { evaluate, send } = fixture;
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const set = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await poll(() => evaluate("!document.getElementById('startRequest').disabled"), 'serviço disponível');
  await poll(() => evaluate("document.getElementById('collectiveActions').textContent.includes('Revisar a distribuição')"), 'ação coletiva visível');
  const capture = async name => {
    if (process.env.SUPPORT_CAPTURE_PREVIEW !== '1') return;
    await mkdir(join(root, 'docs/support-preview'), { recursive: true });
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(root, 'docs/support-preview', name + '.png'), Buffer.from(shot.data, 'base64'));
  };
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: width < 700 });
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `home sem overflow ${width}`);
    await capture(`colaborador-${width}`);
  }
  await click('#startRequest');
  await poll(() => evaluate("document.getElementById('requestDialog').open"), 'assistente aberto');
  await click('input[name="category"][value="overload"]');
  await set('#requestText', 'Estou com tarefas demais e preciso reorganizar a rotina.');
  await set('#requestNeed', 'Gostaria de conversar para organizar o próximo passo.');
  await click('#nextStep');
  await poll(() => evaluate("!document.getElementById('wizardStep2').hidden"), 'escolha de destinatário');
  assert.equal(await evaluate("document.querySelectorAll('input[name=\"recipient\"]:checked').length"), 0, 'com dois caminhos, nenhum vem marcado');
  await click('#nextStep');
  assert.equal(await evaluate("!document.getElementById('wizardError').hidden && !document.getElementById('wizardStep2').hidden"), true, 'não avança sem escolher o caminho');
  await click('input[name="recipient"][value="care"]');
  await click('#nextStep');
  await poll(() => evaluate("!document.getElementById('wizardStep3').hidden"), 'revisão de envio');
  assert.equal(await evaluate("document.getElementById('sharingConsent').checked"), false);
  assert.equal(await evaluate("document.getElementById('aggregateConsent').checked"), false);
  await click('#sendRequest');
  assert.equal(creates.length, 0, 'não envia sem autorização explícita');
  assert.ok(await evaluate("document.getElementById('sharingPreview').textContent.includes('pessoa@example.test')"), 'revisão inclui identificação');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'revisão cabe no celular');
  await click('#sharingConsent');
  await click('#sendRequest');
  await poll(() => evaluate("!document.getElementById('wizardError').hidden && !document.getElementById('sendRequest').disabled"), 'falha preserva rascunho');
  await click('#sendRequest');
  await poll(() => evaluate("!document.getElementById('requestDialog').open"), 'pedido enviado');
  assert.equal(creates.length, 2);
  assert.equal(creates[0].requestId, creates[1].requestId, 'reenvio usa mesma chave');
  assert.equal(creates[1].aggregateConsent, false);
  await poll(() => evaluate("!document.getElementById('requestDetail').hidden"), 'acompanhamento');
  await set('#replyText', 'Tenho disponibilidade para conversar amanhã.');
  await click('#sendReply');
  await poll(() => evaluate("document.getElementById('requestDetail').textContent.includes('Tenho disponibilidade')"), 'resposta persistida');
  await click('[data-feedback="continues"]');
  await poll(() => items[0].feedback?.outcome === 'continues', 'acompanhamento continua');
  await poll(() => evaluate("!document.querySelector('[data-feedback=helped]').disabled"), 'feedback disponível');
  await click('[data-feedback="helped"]');
  await poll(() => items[0].status === 'closed', 'encerramento pelo colaborador');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'acompanhamento cabe no celular');
  assert.equal(await evaluate("JSON.stringify({...localStorage,...sessionStorage}).includes('Estou com tarefas')"), false, 'sem cache persistente do relato');
  await capture('acompanhamento-320');
  assert.deepEqual(fixture.errors, []);
});

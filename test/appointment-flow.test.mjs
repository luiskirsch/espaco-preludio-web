import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { parse } from 'acorn';

const root = resolve(import.meta.dirname, '..');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));

test('appointment, patient and public-booking scripts have valid syntax', async () => {
  for (const name of ['agenda.html', 'painel.html', 'pacientes.html', 'agendar.html', 'app/agendar.html']) {
    const html = await readFile(join(root, name), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/src=|application\/ld\+json|speculationrules/.test(match[1]) || !match[2].trim()) continue;
      parse(match[2], { ecmaVersion: 'latest', sourceType: match[1].includes('module') ? 'module' : 'script' });
    }
  }
  parse(await readFile(join(root, 'js/new-session-modal.js'), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
});

async function poll(fn) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try { const result = await fn(); if (result) return result; } catch {}
    await new Promise(r => setTimeout(r, 80));
  }
  throw new Error('Appointment browser timeout');
}

test('professional selects 30-minute first visits and 20-minute returns, overrides duration and submits it', {
  timeout: 30000, skip: !chrome && 'Chrome/Edge unavailable'
}, async () => {
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/patient-fixture.html') {
        let html = await readFile(join(root, 'pacientes.html'), 'utf8');
        const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;\r?\n/gm, '');
        html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('<html ', '<html class="guard-ok" ');
        const setup = `
          import { generateDEK, encryptNote, decryptNote, clearDek } from '/js/crypto.js';
          const auth = {}, BACKEND_BASE_URL = location.origin;
          const testDek = generateDEK();
          const requireTherapist = async()=>({ user:{uid:'test'},idToken:'test-token',therapist:{displayName:'Test'},dek:testDek });
          const signOut = async()=>{}, invalidateApi = ()=>{};
          window.records = [];
          for (const [patientId,name,paymentType] of [['one','Private patient','private'],['two','Insurance patient','insurance'],['three','Legacy patient',undefined]]) {
            const encrypted = await encryptNote(JSON.stringify({name,paymentType}),testDek);
            window.records.push({patientId,...encrypted});
          }
          const cachedGet = async ({onData})=>onData({patients:window.records});
          window.saved = [];
          window.fetch = async (url,opts={})=>{
            if(opts.method==='POST'||opts.method==='PATCH'){
              const body=JSON.parse(opts.body);window.saved.push(body);
              window.records.push({patientId:'new',...body});
            }
            return {ok:true,json:async()=>({ok:true,anamneses:[],convenios:[],patient:{}})};
          };
          window.decodeSaved = async()=>JSON.parse(await decryptNote(window.saved[0],testDek));
        `;
        html = html.replace('</body>', `<script type="module">${setup}\n${script}</script></body>`);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return;
      }
      if (pathname === '/fixture.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/espaco-preludio.css"></head><body><script type="module">
          import { createNewSessionModal } from '/js/new-session-modal.js';
          import { generateDEK, encryptNote } from '/js/crypto.js';
          const dek=generateDEK();
          const patients=await Promise.all(['insured','empty'].map(async patientId=>({patientId,...await encryptNote(JSON.stringify({name:'Fixture '+patientId,paymentType:'insurance'}),dek)})));
          window.requests = [];
          window.fetch = async (url, options = {}) => {
            const path=new URL(url,location.origin).pathname;
            if (options.method === 'POST') {
              window.requests.push(JSON.parse(options.body));
              if(path.endsWith('/tiss/marcar')&&window.failGuide)return {ok:false,status:503,json:async()=>({ok:false})};
              return { ok:true, status:200, json:async()=>({ok:true,session:{sessionId:'test',joinCode:'TESTCODE'}}) };
            }
            if(path==='/therapy/profissional/tiss/convenios')return {ok:true,json:async()=>({ok:true,convenios:[{code:'fixture',nome:'Seguro de teste'}]})};
            if(path==='/therapy/pacientes/insured'&&window.delayInsuranceReads)await new Promise(r=>setTimeout(r,200));
            return {ok:true,json:async()=>({ok:true,patients,patient:{convenios:path.endsWith('/insured')?[{convenioCode:'fixture',numeroCarteirinha:'12345'}]:[]}})};
          };
          window.fixtureTherapist={tissEnabled:true,agendaConfig:{slotMinutes:50}};
          window.modal = createNewSessionModal({getToken:async()=>'test-token', uid:'test', dek,
            therapist:window.fixtureTherapist, BACKEND_BASE_URL:location.origin,
            tr:(_key,fallback)=>fallback,currentLocaleSafe:()=> 'pt-BR', getAllSessions:()=>[],buildPatientLink:()=> 'test-link'});
          window.modal.open();
        </script></body></html>`);
        return;
      }
      const file = resolve(root, pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root + sep)) throw new Error('invalid path');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/css' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profile = await mkdtemp(join(tmpdir(), 'ep-appointments-'));
  const port = 16000 + Math.floor(Math.random() * 1000);
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/fixture.html`], { stdio: 'ignore', windowsHide: true });
  let socket;
  try {
    const page = await poll(async () => (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(p => p.url.includes('fixture.html')));
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, reject) => { socket.onopen = r; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = e => {
      const message = JSON.parse(e.data);
      if (pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
    };
    const send = (method, params) => new Promise(r => {
      pending.set(++id, r); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await poll(() => evaluate('!!window.modal'));
    assert.equal(await evaluate('document.getElementById("sessionDuration").value'), '50');
    for (const [type, expected] of [['initial', '30'], ['return', '20'], ['follow_up', '20']]) {
      assert.equal(await evaluate(`(() => {const el=document.getElementById('appointmentType');el.value='${type}';el.dispatchEvent(new Event('change'));return document.getElementById('sessionDuration').value;})()`), expected);
    }
    await evaluate(`(() => {
      document.getElementById('patientName').value='Test patient';
      document.getElementById('patientEmail').value='test@example.com';
      document.getElementById('scheduledDate').value='2030-10-21';
      document.getElementById('scheduledTime').value='08:00';
      document.getElementById('sessionPaymentType').value='private';
      document.getElementById('sessionDuration').value='25';
      document.getElementById('createNewSession').click();
    })()`);
    const request = await poll(() => evaluate('window.requests[0]'));
    assert.equal(request.durationMinutes, 25);
    assert.equal(request.appointmentType, 'follow_up');
    assert.equal(request.paymentType, 'private');
    assert.equal(request.patientEmail, 'test@example.com');
    await evaluate(`window.modal.open({ patientName:'Test patient',scheduledAt:'2030-10-21T08:00' });
      document.getElementById('sessionDuration').value='5';document.getElementById('createNewSession').click()`);
    assert.equal(await evaluate('window.requests.length'), 1);
    assert.equal(await evaluate('document.getElementById("newSessionStatus").textContent.includes("15 e 240")'), true);
    await evaluate('window.modal.reloadPatients()');
    await evaluate('window.modal.open({patientId:"insured",scheduledAt:"2030-10-21T08:00"})');
    await poll(() => evaluate('!document.getElementById("tissNewConvSelect").disabled'));
    assert.equal(await evaluate('document.getElementById("sessionPaymentType").value'), 'insurance');
    assert.equal(await evaluate('document.getElementById("tissNewSessionBlock").classList.contains("ep-hide")'), false);
    assert.equal(await evaluate('document.querySelector("#tissNewSessionBlock details").open'), true);
    assert.equal(await evaluate('document.getElementById("tissNewSessionBlock").previousElementSibling.id'), 'sessionInsuranceStatus');
    await evaluate('document.getElementById("tissNewConvSelect").value="fixture";document.getElementById("createNewSession").click()');
    assert.equal(await evaluate('window.requests.length'), 1, 'An incomplete insurance guide does not create an appointment');
    assert.equal(await evaluate('document.getElementById("newSessionStatus").textContent.includes("TUSS")'), true);
    await evaluate('document.getElementById("tissNewTussCode").value="50000489";document.getElementById("tissNewTussLabel").value="Procedimento de teste";document.getElementById("tissNewValor").value="120.50";document.getElementById("createNewSession").click()');
    await poll(() => evaluate('window.requests.length===3'));
    assert.equal(await evaluate('window.requests[1].paymentType'), 'insurance');
    assert.equal(await evaluate('window.requests[1].patientId'), 'insured');
    assert.deepEqual(await evaluate('window.requests[2]'), {convenioCode:'fixture',tussCode:'50000489',tussLabel:'Procedimento de teste',valorProcedimento:120.5});
    await evaluate('window.failGuide=true;window.modal.open({patientId:"insured",scheduledAt:"2030-10-21T08:00"})');
    await poll(() => evaluate('!document.getElementById("tissNewConvSelect").disabled'));
    await evaluate('document.getElementById("tissNewConvSelect").value="fixture";document.getElementById("tissNewTussCode").value="50000489";document.getElementById("createNewSession").click()');
    await poll(() => evaluate('document.getElementById("linkSubtitle").textContent.includes("não foi possível gerar")'));
    assert.equal(await evaluate('window.requests.length'), 5, 'A failed guide reports the issue without recreating the appointment');
    await evaluate('window.delayInsuranceReads=true;window.modal.open({patientId:"insured"});const patient=document.getElementById("patientSelect");patient.value="id:empty";patient.dispatchEvent(new Event("change"))');
    await poll(() => evaluate('document.getElementById("sessionInsuranceStatus").textContent.includes("não tem carteirinha")'));
    await evaluate('new Promise(r=>setTimeout(r,250))');
    assert.equal(await evaluate('document.getElementById("tissNewConvSelect").options.length'), 1, 'An earlier patient response cannot restore the wrong insurance');
    await evaluate('document.getElementById("sessionPaymentType").value="private";document.getElementById("sessionPaymentType").dispatchEvent(new Event("change"))');
    assert.equal(await evaluate('document.getElementById("tissNewSessionBlock").classList.contains("ep-hide")'), true);
    await evaluate('window.fixtureTherapist.tissEnabled=false;document.getElementById("sessionPaymentType").value="insurance";document.getElementById("sessionPaymentType").dispatchEvent(new Event("change"))');
    assert.equal(await evaluate('document.getElementById("sessionInsuranceStatus").textContent.includes("Ative TISS")'), true);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'), true);
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/patient-fixture.html` });
    await poll(() => evaluate('document.querySelectorAll("#patientList article").length === 3'));
    await evaluate(`const filter=document.getElementById('paymentTypeFilter');filter.value='private';filter.dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate('document.querySelectorAll("#patientList article").length'), 1);
    assert.equal(await evaluate('document.getElementById("patientList").textContent.includes("Private patient")'), true);
    assert.equal(await evaluate('document.getElementById("patientList").textContent.includes("Legacy patient")'), false);
    await evaluate(`document.getElementById('newPatientBtn').click();
      document.getElementById('patientName').value='New private patient';
      document.getElementById('patientPaymentType').value='private';document.getElementById('savePatient').click()`);
    await poll(() => evaluate('window.saved.length === 1'));
    assert.deepEqual(await evaluate('Object.keys(window.saved[0]).sort()'), ['ciphertext', 'iv']);
    assert.equal((await evaluate('window.decodeSaved()')).paymentType, 'private');
    assert.equal(await evaluate('JSON.stringify(window.saved[0]).includes("private")'), false);
  } finally {
    socket?.close();
    browser.kill();
    await new Promise(r => server.close(r));
    assert.ok(resolve(profile).startsWith(resolve(tmpdir()) + sep + 'ep-appointments-'));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

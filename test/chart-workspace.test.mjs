import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep, extname } from 'node:path';
import { parse } from 'acorn';

const root = resolve(import.meta.dirname, '..');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
async function poll(fn) {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    try { const value = await fn(); if (value) return value; } catch {}
    await new Promise(r => setTimeout(r, 80));
  }
  throw new Error('Chart browser timeout');
}

const setup = String.raw`
  import { createChartWorkspace } from '/js/chart-workspace.js';
  import { generateDEK, encryptNote, decryptNote, clearDek } from '/js/crypto.js';
  const fixtureDek = generateDEK();
  const fixturePatient = {name:'Helena Duarte Albuquerque de Oliveira · demonstração',birthdate:'1991-04-18',contact:'helena@example.com',paymentType:'private',tags:['Exemplo'],customField:'preserve-me'};
  const fixtureContext = {summary:'Cuidado centrado na pessoa, com acompanhamento dos objetivos construídos em conjunto.',allergyStatus:'unknown',medicationStatus:'unknown',problems:'Contexto fictício para demonstrar a organização do prontuário.',goals:'Fortalecer recursos e acompanhar a evolução.',actions:'Revisar os objetivos no próximo encontro\nRegistrar a resposta às intervenções',reviewDate:'2030-11-18'};
  let fixtureEnvelope = await encryptNote(JSON.stringify(fixturePatient),fixtureDek);
  let fixtureChart = await encryptNote(JSON.stringify(fixtureContext),fixtureDek);
  window.fixtureEmptyChart=async()=>{fixtureChart=await encryptNote('{}',fixtureDek);fixtureEntries.splice(0);};
  const fixtureEntries = [];
  for(const [i,title] of ['Continuidade do cuidado','Avaliação inicial e objetivos'].entries()){
    fixtureEntries.push({entryId:'record_'+i,kind:'progress',createdAt:Date.now()-(i+1)*86400000,...await encryptNote(JSON.stringify({title,occurredAt:Date.now()-(i+1)*86400000,authorName:'Profissional de demonstração',sections:[{key:'complaint',label:'Demanda e contexto',text:'Informações fictícias para apresentação do prontuário.'},{key:'plan',label:'Plano e conduta',text:'Acompanhar os objetivos definidos em conjunto.'}]}),fixtureDek)});
  }
  window.fixtureWrites=[];
  window.fixtureReadActive=0;window.fixtureMaxParallelReads=0;
  window.fixtureAlerts=[];window.alert=message=>window.fixtureAlerts.push(message);
  window.fixtureDecrypt=async envelope=>JSON.parse(await decryptNote(envelope,fixtureDek));
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(url,options={})=>{
    const route=new URL(url,location.origin).pathname;
    if(!route.startsWith('/therapy/'))return originalFetch(url,options);
    if(options.headers?.Authorization!=='Bearer fixture-token')return {ok:false,status:401,json:async()=>({ok:false,error:'EXPIRED_TOKEN'})};
    const method=options.method||'GET';
    if(method==='GET'&&['/therapy/pacientes/pat_demo','/therapy/pacientes/pat_demo/sessoes'].includes(route)){
      window.fixtureReadActive++;window.fixtureMaxParallelReads=Math.max(window.fixtureMaxParallelReads,window.fixtureReadActive);
      await new Promise(r=>setTimeout(r,40));window.fixtureReadActive--;
    }
    const result=(body,status=200)=>({ok:status<400,status,json:async()=>body});
    if(method!=='GET'){
      const body=JSON.parse(options.body);window.fixtureWrites.push({route,method,body});
      if(window.fixtureConflict){window.fixtureConflict=false;return result({ok:false,error:'PRONTUARIO_ATUALIZADO_EM_OUTRA_ABA'},409);}
      if(window.fixtureFailPost&&method==='POST'){window.fixtureFailPost=false;return result({ok:false,error:'OFFLINE'},503);}
      if(route.endsWith('/registros')){fixtureEntries.unshift({...body,entryId:'record_new_'+fixtureEntries.length,createdAt:Date.now()});return result({ok:true,entryId:fixtureEntries[0].entryId});}
      if(method==='PUT'){fixtureChart=body;return result({ok:true,version:body.expectedVersion+1});}
      fixtureEnvelope=body;return result({ok:true,revision:4});
    }
    if(route.endsWith('/prontuario/registros'))return result({ok:true,entries:fixtureEntries,nextCursor:null});
    if(route.endsWith('/prontuario'))return result({ok:true,exists:true,version:2,...fixtureChart});
    if(route==='/therapy/pacientes')return result({ok:true,patients:[{patientId:'pat_demo',...fixtureEnvelope,revision:3,createdAt:Date.now()-90*86400000}]});
    if(route.endsWith('/sessoes'))return result({ok:true,sessions:[{sessionId:'session_demo',status:'completed',scheduledAt:Date.now()-86400000,createdAt:Date.now()-86400000,startedAt:Date.now()-86400000,completedAt:Date.now()-86400000+30*60000,durationMinutes:30},{sessionId:'session_next',status:'scheduled',scheduledAt:Date.now()+86400000,createdAt:Date.now(),durationMinutes:20}],serverNow:Date.now()});
    if(route.endsWith('/notas'))return window.fixtureFailHistory?result({ok:false,error:'NOTES_UNAVAILABLE'},503):result({ok:true,notes:[]});
    if(route==='/therapy/pacientes/pat_demo')return result({ok:true,patient:{...fixtureEnvelope,revision:3}});
    if(route.endsWith('/foto'))return result({ok:true,foto:null});
    if(route==='/therapy/receitas')return result({ok:true,receitas:[]});
    if(route==='/therapy/documentos')return result({ok:true,documentos:[]});
    return result({ok:true,escalas:[],entries:[],sinais:[]});
  };
  window.confirm=()=>true;
  const fixtureUser={uid:'owner',getIdToken:async()=>'fixture-token'};
  const auth={},BACKEND_BASE_URL=location.origin,signOut=async()=>{};
  const requireTherapist=async()=>{
    window.fixtureWaitingForAuth=true;await new Promise(r=>window.fixtureReleaseAuth=r);
    return {user:fixtureUser,idToken:'expired-token',therapist:{displayName:'Profissional de demonstração'},conselho:{capabilities:['receita','documentos-clinicos']},dek:fixtureDek};
  };
  const decryptAiSummaryPayload=async()=>({}),migrateLegacyAiSummary=async()=>{},hasStoredAiAudio=async()=>false,retryAiSummaryUpload=async()=>({ok:true}),clearStoredAiAudio=async()=>{};
`;

test('chart page and workspace parse, and every workspace label is translated', async () => {
  const html = await readFile(join(root, 'prontuario.html'), 'utf8');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  parse(script, { ecmaVersion: 'latest', sourceType: 'module' });
  parse(await readFile(join(root, 'js/chart-workspace.js'), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  const source = JSON.parse(await readFile(join(root, 'i18n/locales/pt-BR/chart.json'), 'utf8'));
  for (const lang of ['en-US', 'es-ES']) {
    const translated = JSON.parse(await readFile(join(root, `i18n/locales/${lang}/chart.json`), 'utf8'));
    assert.deepEqual(Object.keys(source).sort(), Object.keys(translated).sort());
  }
});

test('complete chart supports encrypted context, SOAP, supplements, protected drafts and preserved patient details', {
  timeout: 45000, skip: !chrome && 'Chrome/Edge unavailable'
}, async () => {
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/prontuario.html') {
        let html = await readFile(join(root, 'prontuario.html'), 'utf8');
        const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;\r?\n/gm, '');
        html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('<html ', '<html class="guard-ok" ');
        html = html.replace('</head>', `<script>window.fixtureErrors=[];window.addEventListener('error',e=>window.fixtureErrors.push(e.message+' '+e.filename+':'+e.lineno));window.addEventListener('unhandledrejection',e=>window.fixtureErrors.push(String(e.reason?.stack||e.reason)));</script></head>`);
        html = html.replace('</body>', `<script type="module">${setup}\n${script}</script></body>`);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return;
      }
      const file = resolve(root, pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root + sep)) throw new Error('invalid path');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profile = await mkdtemp(join(tmpdir(), 'ep-chart-'));
  const port = 17000 + Math.floor(Math.random() * 1000);
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/prontuario.html?p=pat_demo`], { stdio: 'ignore', windowsHide: true });
  let socket;
  try {
    const page = await poll(async () => (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(p => p.url.includes('prontuario.html')));
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, reject) => { socket.onopen = r; socket.onerror = reject; });
    let id = 0; const pending = new Map();
    socket.onmessage = e => { const message = JSON.parse(e.data); if (pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); } };
    const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await poll(() => evaluate('window.fixtureWaitingForAuth'));
    assert.equal(await evaluate('document.body.classList.contains("chart-page")'), true, 'The modern page styles are present before authentication completes');
    assert.equal(await evaluate('document.querySelectorAll(".chart-boot-tab").length'), 6);
    assert.equal(await evaluate('getComputedStyle(document.getElementById("statsStrip")).display'), 'none');
    assert.equal(await evaluate('getComputedStyle(document.getElementById("sessions").closest("section")).display'), 'none', 'Legacy content cannot flash while authentication is pending');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".ep-prontuario__actions")).visibility'), 'hidden');
    await evaluate('window.fixtureReleaseAuth()');
    await poll(() => evaluate('document.getElementById("chartRecent")?.textContent.includes("Continuidade do cuidado")')).catch(async error => {
      error.message += ' ' + JSON.stringify(await evaluate('({errors:window.fixtureErrors,patient:document.getElementById("patientName").textContent,status:document.getElementById("errorStateDetail").textContent})'));
      throw error;
    });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await evaluate('new Promise(r=>setTimeout(r,100))');
    assert.equal(await evaluate('document.querySelector(".chart-nav").getAttribute("aria-orientation")'), 'horizontal');
    assert.equal(await evaluate('document.querySelectorAll("#chartIdentity h2,.chart-identity__avatar").length'), 0);
    for (const width of [1920, 1440, 1024]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate(`(()=>{const tabs=[...document.querySelectorAll('[data-chart-tab]')].map(e=>e.getBoundingClientRect());const header=document.querySelector('.ep-prontuario__header').getBoundingClientRect();return tabs.every(t=>t.left>=200&&t.right<${width}-90&&t.bottom<450)&&header.right<${width}-90&&document.documentElement.scrollWidth<=${width}})()`), true, `All tabs and actions fit the clinical area at ${width}px`);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 760, deviceScaleFactor: 1, mobile: false });
    await evaluate('window.scrollTo(0,500)');
    assert.equal(await evaluate('(()=>{const r=document.querySelector(".chart-toolbar").getBoundingClientRect();return r.top>=0&&r.top<2&&r.bottom<100})()'), true, 'Navigation stays visible while scrolling');
    await evaluate('document.getElementById("chart-tab-clinical").click()');
    assert.equal(await evaluate('document.getElementById("chart-panel-clinical").getBoundingClientRect().top>=document.querySelector(".chart-toolbar").getBoundingClientRect().bottom'), true, 'Changing tabs reveals the beginning of the selected panel');
    await evaluate('document.getElementById("chart-tab-overview").click();window.scrollTo(0,0)');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await evaluate('document.fonts.ready.then(()=>new Promise(r=>setTimeout(r,250)))');
    if (process.env.CHART_SCREENSHOTS_DIR) {
      await mkdir(process.env.CHART_SCREENSHOTS_DIR, { recursive: true });
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(process.env.CHART_SCREENSHOTS_DIR, 'chart-desktop.png'), Buffer.from(image.data, 'base64'));
    }
    assert.equal(await evaluate('document.querySelectorAll("[role=tab]").length'), 6);
    assert.equal(await evaluate('document.querySelector(".chart-boot")'), null);
    assert.equal(await evaluate('window.fixtureMaxParallelReads>=2'), true, 'Patient identity and appointments load concurrently');
    assert.equal(await evaluate('document.getElementById("chartContext").textContent.includes("Não informado")'), true);
    await evaluate('document.getElementById("chart-tab-clinical").click();document.getElementById("chartSummary").value="Private clinical summary";document.getElementById("chartSummary").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("chartClinicalForm").requestSubmit()');
    await poll(() => evaluate('document.getElementById("chartClinicalStatus").textContent.includes("salvas")'));
    const profileWrite = await evaluate('window.fixtureWrites.find(w=>w.method==="PUT").body');
    assert.equal(profileWrite.expectedVersion, 2);
    assert.equal(JSON.stringify(profileWrite).includes('Private clinical summary'), false);
    assert.equal((await evaluate('window.fixtureDecrypt(window.fixtureWrites.find(w=>w.method==="PUT").body)')).summary, 'Private clinical summary');
    await evaluate('window.fixtureConflict=true;document.getElementById("chartSummary").value="Preserve this unsaved text";document.getElementById("chartSummary").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("chartClinicalForm").requestSubmit()');
    await poll(() => evaluate('document.getElementById("chartClinicalStatus").textContent.includes("outra aba")'));
    assert.equal(await evaluate('document.getElementById("chartSummary").value'), 'Preserve this unsaved text');
    await evaluate('document.getElementById("chartReloadProfile").click()');

    await evaluate('document.querySelector("[data-new-entry]").click()');
    await poll(() => evaluate('document.querySelector(".chart-editor").open'));
    await evaluate(`document.getElementById('chartEntryTemplate').value='soap';document.getElementById('chartEntryTemplate').dispatchEvent(new Event('change'));
      document.getElementById('chartEntryTitle').value='SOAP fixture note';document.getElementById('chart-editor-subjective').value='Confidential synthetic note';document.getElementById('chart-editor-subjective').dispatchEvent(new Event('input',{bubbles:true}));`);
    await poll(() => evaluate('document.getElementById("chartDraftStatus").textContent.includes("cifrado salvo")'));
    const stored = await evaluate('sessionStorage.getItem("ep:chart-draft:owner:pat_demo")');
    assert.equal(stored.includes('Confidential'), false);
    await evaluate('document.getElementById("chartCloseEditor").click();document.querySelector("[data-new-entry]").click()');
    await poll(() => evaluate('document.getElementById("chart-editor-subjective")?.value==="Confidential synthetic note"'));
    await evaluate('window.fixtureFailPost=true;document.getElementById("chartEntryForm").requestSubmit()');
    await poll(() => evaluate('document.getElementById("chartEditorStatus").textContent.includes("preservado")'));
    await evaluate('document.getElementById("chartEntryForm").requestSubmit()');
    await poll(() => evaluate('!document.querySelector(".chart-editor").open&&document.getElementById("chartEntries").textContent.includes("SOAP fixture note")'));
    const attempts = await evaluate('window.fixtureWrites.filter(w=>w.method==="POST").map(w=>w.body)');
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal(JSON.stringify(attempts).includes('Confidential'), false);
    assert.equal(await evaluate('sessionStorage.getItem("ep:chart-draft:owner:pat_demo")'), null);
    await evaluate('document.querySelector("#chartEntries [data-complement]").click()');
    await poll(() => evaluate('document.querySelector(".chart-editor").open'));
    assert.equal(await evaluate('document.getElementById("chartEntryTemplate").value'), 'addendum');
    await evaluate('document.getElementById("chart-editor-content").value="Complemento fictício";document.getElementById("chartEntryForm").requestSubmit()');
    await poll(() => evaluate('window.fixtureWrites.filter(w=>w.method==="POST").length===3'));
    assert.match(await evaluate('window.fixtureWrites.filter(w=>w.method==="POST").at(-1).body.parentEntryId'), /record_new_/);
    await poll(() => evaluate('!document.querySelector(".chart-editor").open'));

    await evaluate('document.getElementById("chart-tab-registration").click();document.getElementById("chartCity").value="Cidade fictícia";document.getElementById("chartPatientForm").requestSubmit()');
    await poll(() => evaluate('document.getElementById("chartPatientStatus").textContent.includes("salvas")'));
    const patientPayload = await evaluate('window.fixtureDecrypt(window.fixtureWrites.find(w=>w.method==="PATCH").body)');
    assert.equal(patientPayload.customField, 'preserve-me'); assert.deepEqual(patientPayload.tags, ['Exemplo']);
    assert.equal(patientPayload.demographics.city, 'Cidade fictícia');
    assert.equal(await evaluate('window.fixtureWrites.find(w=>w.method==="PATCH").body.expectedRevision'), 3);
    await evaluate('window.fixtureFailHistory=true;document.getElementById("exportPdfBtn").click()');
    await poll(() => evaluate('window.fixtureAlerts.length>0'));
    assert.equal(await evaluate('window.fixtureAlerts[0].includes("NOTES_UNAVAILABLE")'), true);
    await evaluate('window.fixtureFailHistory=false');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('document.getElementById("chart-tab-overview").click();window.scrollTo(0,0)');
    await evaluate('new Promise(r=>setTimeout(r,100))');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=390'), true);
    assert.equal(await evaluate('(()=>{const tabs=[...document.querySelectorAll("[data-chart-tab]")].map(e=>e.getBoundingClientRect());return tabs.every(t=>t.left>=0&&t.right<=390&&t.height>=44)&&Math.max(...tabs.map(t=>t.bottom))-Math.min(...tabs.map(t=>t.top))<=100})()'), true, 'All mobile tabs fit in two accessible rows');
    if (process.env.CHART_SCREENSHOTS_DIR) {
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(process.env.CHART_SCREENSHOTS_DIR, 'chart-mobile.png'), Buffer.from(image.data, 'base64'));
    }
    await evaluate('document.documentElement.setAttribute("data-theme","dark")');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".chart-card")).backgroundColor'), 'rgb(27, 44, 49)');
    await evaluate('window.scrollTo(0,600)');
    assert.equal(await evaluate('(()=>{const r=document.querySelector(".chart-toolbar").getBoundingClientRect();return r.top>=64&&r.top<66&&r.bottom<180})()'), true, 'Mobile navigation stays below the app header');
    await evaluate('document.getElementById("chart-tab-registration").click()');
    assert.equal(await evaluate('document.getElementById("chart-panel-registration").getBoundingClientRect().top>=document.querySelector(".chart-toolbar").getBoundingClientRect().bottom'), true);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate('document.documentElement.setAttribute("data-theme","light");document.getElementById("chart-tab-overview").click();window.scrollTo(0,0);window.fixtureEmptyChart().then(()=>{document.getElementById("chartReloadProfile").click();document.getElementById("chartReloadEntries").click()})');
    await poll(() => evaluate('document.getElementById("chartAddPlan")&&document.getElementById("chart-count-entries").textContent===""'));
    assert.equal(await evaluate('document.getElementById("chartCarePlan").getBoundingClientRect().height<150'), true, 'An empty care plan has no large blank area');
    assert.equal(await evaluate('getComputedStyle(document.body).minHeight'), '900px');
    if (process.env.CHART_SCREENSHOTS_DIR) {
      await evaluate('new Promise(r=>setTimeout(r,250))');
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(process.env.CHART_SCREENSHOTS_DIR, 'chart-empty.png'), Buffer.from(image.data, 'base64'));
    }
  } finally {
    socket?.close(); browser.kill(); await new Promise(r => server.close(r));
    assert.ok(resolve(profile).startsWith(resolve(tmpdir()) + sep + 'ep-chart-'));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

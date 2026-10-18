import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { parse } from 'acorn';

const root = resolve(import.meta.dirname, '..');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/chromium'].find(p => p && existsSync(p));
async function poll(fn) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try { const result = await fn(); if (result) return result; } catch {}
    await new Promise(r => setTimeout(r, 70));
  }
  throw new Error('Professional navigation browser timeout');
}

test('every professional menu page loads the shared navigation preparation and current auth module', async () => {
  let count = 0;
  for (const filename of await readdir(root)) {
    if (!filename.endsWith('.html')) continue;
    const html = await readFile(join(root, filename), 'utf8');
    if (!html.includes('./js/sidebar.js?v=34')) continue;
    count++;
    assert.match(html, /<script src="\.\/js\/professional-identity\.js\?v=1"><\/script>/, filename);
    assert.match(html, /<script src="\.\/js\/professional-tools\.js\?v=1"><\/script>/, filename);
    assert.match(html, /<script defer src="\.\/js\/professional-navigation\.js\?v=1"><\/script>/, filename);
    assert.match(html, /rel="modulepreload" href="\.\/js\/auth-guard\.js\?v=20261018-tools1"/, filename);
    assert.doesNotMatch(html, /<script type="speculationrules">/, `${filename} must use the shared route selection`);
  }
  assert.ok(count >= 25);
});

test('professional navigation prepares pages, activates a prerender, and defers authenticated reads until activation', {
  timeout: 45000, skip: !chrome && 'Chrome/Edge unavailable'
}, async () => {
  const navigation = await readFile(join(root, 'js/professional-navigation.js'), 'utf8');
  const guard = await readFile(join(root, 'js/auth-guard.js'), 'utf8');
  const ast = parse(guard, { ecmaVersion: 'latest', sourceType: 'module' });
  const source = name => {
    const node = ast.body.map(node => node.declaration || node).find(node => node.id?.name === name);
    return guard.slice(node.start, node.end);
  };
  const requests = [];
  let profileReads = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push({ path: url.pathname, purpose: req.headers['sec-purpose'] || '' });
    if (url.pathname.endsWith('/js/professional-navigation.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(navigation); return;
    }
    if (url.pathname.endsWith('/fixture/me')) {
      profileReads++;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, therapist: {}, conselho: { capabilities: [] } })); return;
    }
    if (url.pathname.includes('/therapy/')) {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true,"count":0}'); return;
    }
    if (url.pathname.endsWith('.css')) {
      res.writeHead(200, { 'content-type': 'text/css', 'cache-control': 'public,max-age=600' }); res.end('body{font-family:sans-serif}'); return;
    }
    if (url.pathname.endsWith('.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'public,max-age=600' }); res.end('export const ready=true;'); return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private,no-store',
      'content-security-policy': "default-src 'self'; script-src 'nonce-fixture-navigation-nonce-123456' 'strict-dynamic' 'self'; style-src 'self'; connect-src 'self'" });
    res.end(`<!doctype html><html><head>
      ${url.searchParams.has('fallback') ? '<script nonce="fixture-navigation-nonce-123456">HTMLScriptElement.supports=()=>false;</script>' : ''}
      ${url.searchParams.has('saveData') ? '<script nonce="fixture-navigation-nonce-123456">Object.defineProperty(navigator,"connection",{value:{saveData:true,effectiveType:"4g"}});</script>' : ''}
      <link rel="stylesheet" href="./fixture.css">
      <script nonce="fixture-navigation-nonce-123456" defer src="./js/professional-navigation.js?v=1"></script></head><body class="ep-has-sidebar">
      <nav><a id="agenda" href="./agenda.html">Agenda</a><a href="./pacientes.html">Pacientes</a><a id="chart" href="./prontuario.html?p=pat_fixture">Prontuário</a>
      <a id="external" href="https://external.invalid/agenda.html">External</a><a id="room" href="./consultorio.html?sessionId=fixture">Room</a><a id="action" href="./painel.html?newWith=fixture">Action</a></nav>
      <script nonce="fixture-navigation-nonce-123456" type="module">
      import {ready} from './fixture-module.js';
      const authReady=async()=>({uid:'fixture',getIdToken:async()=>'fixture-token'});
      const fetchTherapistProfile=async()=>fetch('./fixture/me').then(r=>r.json());
      const applyCapabilityVisibility=()=>{},mountCapabilityFabs=()=>{},applyTissVisibility=()=>{},applyProgramNetworkVisibility=()=>{},applyTopUserSlot=()=>{},mountHelpBubble=()=>{},connectRealtime=async()=>{},recallDek=()=>({});
      const BACKEND_BASE_URL=location.origin,hasValid2faSession=()=>true;
      ${source('whenProfessionalActive')}
      ${source('requireTherapist')}
      await requireTherapist();window.fixtureReady=ready;
      if(new URLSearchParams(location.search).has('autoNav'))setTimeout(()=>document.getElementById('agenda').click(),1500);
      </script></body></html>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 'ep-navigation-'));
  const port = 20000 + Math.floor(Math.random() * 1000);
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, base + '/painel.html?autoNav=1'], { stdio: 'ignore', windowsHide: true });
  let socket;
  try {
    // Attaching DevTools disables prerendering in some Chrome releases. Let
    // the real browser prepare and activate the page before inspecting it.
    await poll(() => requests.some(r => r.path === '/agenda.html' && r.purpose.includes('prerender')));
    await new Promise(r => setTimeout(r, 250));
    assert.equal(profileReads, 1, 'Hidden pages must not read an authenticated profile or clinical data');
    await poll(() => profileReads === 2);
    const page = await poll(async () => (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(p => p.type === 'page'));
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, reject) => { socket.onopen = r; socket.onerror = reject; });
    let id = 0; const pending = new Map();
    socket.onmessage = e => { const message = JSON.parse(e.data); if (pending.has(message.id)) { pending.get(message.id)(message.error ? { protocolError: message.error } : message.result || {}); pending.delete(message.id); } };
    const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    };
    await poll(() => evaluate('location.pathname==="/agenda.html"&&window.fixtureReady'));
    const rules = await evaluate('JSON.parse(document.querySelector("script[data-professional-navigation]").textContent)');
    assert.deepEqual(rules.prerender[0].urls, [base + '/painel.html', base + '/pacientes.html']);
    assert.equal(await evaluate('document.getElementById("chart").hasAttribute("data-professional-preload")'), true, 'Patient query links are eligible');
    for (const id of ['external', 'room', 'action']) assert.equal(await evaluate(`document.getElementById('${id}').hasAttribute('data-professional-preload')`), false);
    assert.equal(await evaluate('performance.getEntriesByType("navigation")[0].activationStart>0'), true, 'The browser activates an already prepared page');
    assert.equal(profileReads, 2, 'Activation validates the current session');

    await send('Page.navigate', { url: base + '/staging/painel.html?fallback=1' });
    await poll(() => evaluate('location.search==="?fallback=1"&&window.fixtureReady'));
    assert.equal(await evaluate('document.querySelector("script[data-professional-navigation]")'), null);
    await evaluate('window.EP_PROFESSIONAL_NAV.warm("./prontuario.html?p=pat_fixture")');
    assert.ok(requests.some(r => r.path === '/staging/prontuario.html'));
    assert.equal(await evaluate('[...document.querySelectorAll("link[data-professional-asset]")].every(link=>new URL(link.href).pathname.startsWith("/staging/"))'), true);
    const count = requests.length;
    await evaluate('Promise.all([window.EP_PROFESSIONAL_NAV.warm("https://external.invalid/agenda.html"),window.EP_PROFESSIONAL_NAV.warm("../agenda.html"),window.EP_PROFESSIONAL_NAV.warm("./consultorio.html?sessionId=fixture"),window.EP_PROFESSIONAL_NAV.warm("./painel.html?newWith=fixture")])');
    assert.equal(requests.slice(count).some(r => /consultorio|newWith/.test(r.path)), false);
    assert.equal(await evaluate('Object.keys(sessionStorage).some(key=>key.startsWith("ep:api:"))'), false);
    await send('Page.navigate', { url: base + '/painel.html?saveData=1' });
    await poll(() => evaluate('location.search==="?saveData=1"&&window.fixtureReady'));
    assert.equal(await evaluate('document.querySelector("script[data-professional-navigation],link[data-professional-asset]")'), null, 'Data saver prevents background downloads');
  } finally {
    socket?.close(); browser.kill(); await new Promise(r => setTimeout(r, 400)); server.close();
    const target = resolve(profile);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('ep-navigation-')) throw new Error('Unsafe cleanup');
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

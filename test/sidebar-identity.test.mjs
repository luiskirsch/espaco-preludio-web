import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/chromium'].find(p => p && existsSync(p));
async function poll(fn) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try { const result = await fn(); if (result) return result; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Identity browser timeout');
}
const photo = 'R0lGODlhAQABAIAAAP8AAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

test('professional name and photo survive first paint, empty topbar, navigation and profile edits', {
  timeout: 30000, skip: !chrome && 'Chrome/Edge unavailable'
}, async () => {
  const sidebar = await readFile(join(root, 'js/sidebar.js'), 'utf8');
  const identity = await readFile(join(root, 'js/professional-identity.js'), 'utf8');
  const guard = await readFile(join(root, 'js/auth-guard.js'), 'utf8');
  const apply = guard.match(/function applyTopUserSlot\(therapist\) \{[\s\S]*?\n\}/)[0];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.endsWith('.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(url.pathname.includes('professional-identity') ? identity : sidebar); return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    const updated = url.searchParams.has('updated');
    res.end(`<!doctype html><html><head>
      ${url.searchParams.has('seed') ? `<script>sessionStorage.setItem('ep:professional-display:v1',JSON.stringify({uid:'owner',displayName:'Helena Duarte',photo:'data:image/gif;base64,${photo}',verified:true}));</script>` : ''}
      <script src="/js/professional-identity.js?v=1"></script></head><body class="ep-has-sidebar">
      <script src="/js/sidebar.js?v=33"></script>
      <script>
        window.states=[];
        const record=()=>states.push({name:document.getElementById('sidebarUserName').textContent,photo:document.getElementById('sidebarUserAvatar').style.backgroundImage});
        record();document.addEventListener('DOMContentLoaded',()=>{record();setTimeout(record,50);});
        const auth={currentUser:{uid:'owner'}};
        ${apply}
        window.fixtureApply=applyTopUserSlot;
        setTimeout(()=>{applyTopUserSlot({displayName:'${updated ? 'Carolina Alves' : 'Helena Duarte'}',photoBase64:'${updated ? '' : photo}',photoMime:'image/gif',verificationStatus:'verified',privateText:'never persist this'});record();window.fixtureDone=true;},220);
      </script>
      <header class="ep-topbar"><span id="topUserName"></span><span id="topUserAvatar">·</span><button id="logoutBtn">Sair</button></header>
      </body></html>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 'ep-identity-'));
  const port = 21000 + Math.floor(Math.random() * 1000);
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let socket;
  try {
    const page = await poll(async () => (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(p => p.type === 'page'));
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, reject) => { socket.onopen = r; socket.onerror = reject; });
    let id = 0; const pending = new Map();
    socket.onmessage = e => { const message = JSON.parse(e.data); if (pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); } };
    const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const navigate = async path => {
      await send('Page.navigate', { url: base + path });
      await poll(() => evaluate(`location.href===${JSON.stringify(base + path)}&&window.fixtureDone`));
      return evaluate('window.states');
    };
    for (const path of ['/painel.html?seed=1', '/agenda.html', '/pacientes.html', '/prontuario.html', '/financeiro.html']) {
      const states = await navigate(path);
      assert.ok(states.length >= 3);
      assert.ok(states.every(state => state.name === 'HelenaDuarte' && state.photo.includes(photo)), `${path}: identity must never regress to a placeholder`);
      assert.equal(await evaluate('document.querySelectorAll("#sidebarUserAvatar .ep-verified-badge").length'), 1);
    }
    const cache = await evaluate('JSON.parse(sessionStorage.getItem("ep:professional-display:v1"))');
    assert.deepEqual(Object.keys(cache).sort(), ['displayName', 'photo', 'uid', 'verified']);
    assert.equal(JSON.stringify(cache).includes('never persist this'), false);
    await evaluate('fixtureApply({displayName:"Carolina Alves",photoBase64:""})');
    const updated = await navigate('/perfil.html?updated=1');
    assert.ok(updated.every(state => state.name === 'CarolinaAlves' && state.photo === ''), 'Profile edits replace the display cache immediately');
    await evaluate('fixtureApply({displayName:"<img src=x onerror=alert(1)>",photoBase64:"not-a-photo"})');
    assert.equal(await evaluate('document.querySelector("#sidebarUserName img")'), null, 'Names are plain text');
    await evaluate('window.EP_PROFESSIONAL_IDENTITY.reconcile("other-account")');
    assert.equal(await evaluate('sessionStorage.getItem("ep:professional-display:v1")'), null);
    assert.equal(await evaluate('document.getElementById("sidebarUserName").textContent'), '');
    await evaluate('fixtureApply({displayName:"Carolina Alves"});document.getElementById("sidebarLogout").click()');
    assert.equal(await evaluate('sessionStorage.getItem("ep:professional-display:v1")'), null, 'Logout clears the tab display identity immediately');
  } finally {
    socket?.close(); browser.kill(); await new Promise(r => setTimeout(r, 400)); server.close();
    const target = resolve(profile);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('ep-identity-')) throw new Error('Unsafe cleanup');
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

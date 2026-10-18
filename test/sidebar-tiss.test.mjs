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
  throw new Error('Sidebar browser timeout');
}

test('TISS stays visible across menu navigation until authenticated settings actually change', {
  timeout: 30000, skip: !chrome && 'Chrome/Edge unavailable'
}, async () => {
  const sidebar = await readFile(join(root, 'js/sidebar.js'), 'utf8');
  const guard = await readFile(join(root, 'js/auth-guard.js'), 'utf8');
  const applyTiss = guard.match(/function applyTissVisibility\(therapist\) \{[\s\S]*?\n\}/)[0];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/js/sidebar.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); res.end(sidebar); return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><style>.is-hidden{display:none!important}</style>
      <script>
        const params=new URLSearchParams(location.search);
        if(params.has('cached'))localStorage.setItem('ep:tiss:enabled',params.get('cached'));
        // An obsolete full-profile cache must not override the current UI preference.
        sessionStorage.setItem('ep:profile:v2',JSON.stringify({profile:{therapist:{tissEnabled:false}}}));
      </script></head><body class="ep-has-sidebar">
      <script src="/js/sidebar.js?v=32"></script>
      <script>
        window.visibility=[];
        const record=()=>visibility.push(!document.getElementById('sidebarTissLink').classList.contains('is-hidden'));
        record();new MutationObserver(record).observe(document.getElementById('sidebarTissLink'),{attributes:true,attributeFilter:['class']});
        document.addEventListener('DOMContentLoaded',()=>{record();setTimeout(()=>{record();window.beforeValidation=true;},40);});
        ${applyTiss}
        setTimeout(()=>{applyTissVisibility({tissEnabled:params.get('fresh')!=='0'});record();window.fixtureDone=true;},180);
      </script>
      <header class="ep-topbar"><a data-tiss-only href="./tiss.html" style="display:none">TISS</a></header>
      </body></html>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 'ep-sidebar-'));
  const port = 19000 + Math.floor(Math.random() * 1000);
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
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const navigate = async path => {
      await send('Page.navigate', { url: base + path });
      await poll(() => evaluate(`location.href===${JSON.stringify(base + path)}&&window.fixtureDone`));
      return evaluate('window.visibility');
    };
    for (const path of ['/painel.html?cached=1', '/agenda.html', '/pacientes.html', '/prontuario.html', '/financeiro.html']) {
      const states = await navigate(path);
      assert.ok(states.length >= 3);
      assert.ok(states.every(Boolean), `${path}: enabled TISS must never disappear: ${states}`);
    }
    const revoked = await navigate('/perfil.html?fresh=0');
    assert.equal(revoked[0], true);
    assert.equal(revoked.at(-1), false, 'Authenticated settings can still disable TISS');
    const disabled = await navigate('/agenda.html?cached=0&fresh=0');
    assert.ok(disabled.every(state => state === false), 'Disabled TISS must never flash into view');
    const enabled = await navigate('/perfil.html?fresh=1');
    assert.equal(enabled[0], false);
    assert.equal(enabled.at(-1), true, 'Authenticated settings can still enable TISS');
  } finally {
    socket?.close(); browser.kill(); await new Promise(r => setTimeout(r, 400)); server.close();
    const target = resolve(profile);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('ep-sidebar-')) throw new Error('Unsafe cleanup');
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

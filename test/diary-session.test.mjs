import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chrome = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
const options = { timeout: 30000, skip: !chrome && 'Chrome/Edge unavailable' };
const endpoint = '/therapy/paciente/diario';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const entry = (id, text, extra = {}) => ({ id, text, date: today(), kind: 'diary', version: 1, tags: [], feelings: [], aroma: '', font: 'hand', weather: '', unlockDate: null, createdAt: Date.now(), updatedAt: Date.now(), ...extra });

async function poll(check, description, timeout = 12000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await new Promise(resolveWait => setTimeout(resolveWait, 40));
  }
  throw new Error(`Timeout waiting for ${description}${last ? `: ${last.message}` : ''}`);
}

async function fixture() {
  const accounts = new Map([['A', new Map()], ['B', new Map()]]);
  const pages = new Map();
  const cursors = new Map();
  const requests = [];
  const holds = [];
  function hold(method, uid, match = () => true) {
    let release;
    const gate = { method, uid, match, request: null, wait: new Promise(resolveGate => { release = resolveGate; }), release: () => release() };
    holds.push(gate);
    return gate;
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/therapy/paciente/ambiente') {
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ ok: true, weather: 'rain', source: 'test' }));
        return;
      }
      if (pathname.startsWith(endpoint)) {
        const uid = String(request.headers.authorization || '').replace(/^Bearer /, '');
        const store = accounts.get(uid);
        if (!store) { response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'TOKEN_INVALIDO' })); return; }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
        const record = { uid, method: request.method, path: pathname, cursor: url.searchParams.get('cursor'), body };
        requests.push(record);
        const gate = holds.find(candidate => !candidate.request && candidate.method === record.method && candidate.uid === uid && candidate.match(record));
        if (gate) { gate.request = record; await gate.wait; }
        let payload;
        if (request.method === 'GET') {
          const items = record.cursor ? pages.get(`${uid}:${record.cursor}`) || [] : [...store.values()];
          payload = { ok: true, items, nextCursor: record.cursor ? null : cursors.get(uid) || null };
        } else if (request.method === 'PUT') {
          const previous = store.get(body.id);
          if ((previous?.version || 0) !== body.version) {
            response.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'REGISTRO_ALTERADO' }));
            return;
          }
          const item = { ...body, version: body.version + 1, createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now(), locked: body.kind === 'capsule' && body.unlockDate > today() };
          store.set(item.id, structuredClone(item));
          const visible = structuredClone(item);
          if (visible.locked) for (const key of ['text', 'tags', 'feelings', 'aroma', 'aromaText', 'font', 'weather']) delete visible[key];
          payload = { ok: true, item: visible };
        } else throw new Error(`Unexpected method ${request.method}`);
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(payload));
        return;
      }
      if (pathname === '/__diary-fixture/auth.js') {
        response.writeHead(200, { 'content-type': mime['.js'] }).end('const user=uid=>({uid,displayName:uid,getIdToken:async()=>uid}); export function onAuthStateChanged(auth,callback){ window.__diaryAuth=uid=>callback(uid?user(uid):null); window.__diaryAuth("A"); return ()=>{}; }');
        return;
      }
      if (pathname === '/__diary-fixture/config.js') {
        response.writeHead(200, { 'content-type': mime['.js'] }).end('export const auth={}; export const BACKEND_BASE_URL=location.origin;');
        return;
      }
      const file = resolve(root, pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root + sep)) throw new Error('Invalid local path');
      let body = await readFile(file);
      if (pathname === '/app/diary.js') {
        const original = body.toString('utf8');
        const config = /\.\.\/js\/firebase-config\.js\?[hv]=[\w.-]+/;
        assert.match(original, config, 'diary.js imports the versioned Firebase config');
        const rewritten = original.replace('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js', '/__diary-fixture/auth.js').replace(config, '/__diary-fixture/config.js');
        assert.ok(!rewritten.includes('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'), 'Fixture replaces production Firebase imports in served bytes only');
        assert.ok(!rewritten.includes('import(\'https://www.gstatic.com/'));
        body = rewritten;
      }
      // Os modulepreload (scripts/perf/build.mjs) buscariam o Firebase real; o fixture não os usa.
      if (extname(file) === '.html') body = body.toString('utf8').replace(/[ \t]*<link rel="modulepreload"[^>]*>\r?\n?/g, '');
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch (error) {
      response.writeHead(404).end(String(error.message));
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return { server, accounts, pages, cursors, requests, hold, releaseAll() { holds.forEach(gate => gate.release()); } };
}

async function connectCdp(url, origin) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => { socket.onopen = resolveOpen; socket.onerror = rejectOpen; });
  let sequence = 0;
  const pending = new Map(), exceptions = [], blocked = [], completed = [];
  const networkRequests = new Map();
  function send(method, params = {}) {
    return new Promise((resolveMessage, rejectMessage) => {
      const id = ++sequence;
      pending.set(id, { resolveMessage, rejectMessage });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') networkRequests.set(message.params.requestId, message.params.request.url);
    if (message.method === 'Network.loadingFinished') completed.push(networkRequests.get(message.params.requestId));
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const local = request.url.startsWith(origin + '/');
      if (!local) blocked.push(request.url);
      send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    }
    const operation = pending.get(message.id);
    if (!operation) return;
    pending.delete(message.id);
    if (message.error) operation.rejectMessage(new Error(message.error.message));
    else operation.resolveMessage(message.result);
  };
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  return { socket, send, evaluate, exceptions, blocked, completed };
}

async function withBrowser(run) {
  const api = await fixture();
  const origin = `http://127.0.0.1:${api.server.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 'ep-diary-session-'));
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let cdp;
  try {
    const debugPort = await poll(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'browser port');
    const page = await poll(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json())).find(item => item.type === 'page'), 'browser tab');
    cdp = await connectCdp(page.webSocketDebuggerUrl, origin);
    const { evaluate, send } = cdp;
    async function navigate() {
      await send('Page.navigate', { url: `${origin}/app/diario.html` });
      await poll(() => evaluate("typeof window.__diaryAuth==='function' && !document.getElementById('journalText').disabled"), 'production auth fixture');
      assert.equal(await evaluate("document.getElementById('previewBanner').hidden"), true, 'Exercises production mode, with no preview flag');
    }
    async function click(selector) {
      assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), true, selector);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    }
    async function fill(selector, value) {
      await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    }
    await run({ ...api, ...cdp, navigate, click, fill });
    assert.deepEqual(cdp.exceptions, [], 'No uncaught browser exceptions');
    assert.deepEqual(cdp.blocked.filter(url => /firebase|firestore|identitytoolkit|securetoken/i.test(url)), [], 'No real Firebase requests');
  } finally {
    api.releaseAll();
    cdp?.socket.close();
    browser.kill();
    api.server.closeAllConnections();
    await new Promise(resolveClose => api.server.close(resolveClose));
    await new Promise(resolveExit => setTimeout(resolveExit, 350));
    const target = resolve(profile);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('ep-diary-session-')) throw new Error('Unsafe browser cleanup');
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
  }
}

test('production diary: account switch clears private UI before B loads and ignores late A responses', options, () => withBrowser(async ({ accounts, pages, cursors, hold, navigate, click, fill, evaluate, completed }) => {
  const a = 'ACCOUNT_A_PRIVATE_512';
  const lateA = 'ACCOUNT_A_LATE_PAGE_817';
  const b = 'ACCOUNT_B_PRIVATE_943';
  accounts.get('A').set('a-page', entry('a-page', a, { tags: ['a-private-tag'], feelings: ['nostalgia'] }));
  accounts.get('B').set('b-page', entry('b-page', b));
  pages.set('A:more-A', [entry('a-late-page', lateA)]);
  cursors.set('A', 'more-A');
  await navigate();
  assert.equal(await evaluate("document.getElementById('journalText').value"), a);
  await click('[data-tab="timeline"]');
  await poll(() => evaluate("!!document.getElementById('loadMoreButton')"), 'A timeline');
  const lateGet = hold('GET', 'A', request => request.cursor === 'more-A');
  await click('#loadMoreButton');
  await poll(() => lateGet.request, 'pending A pagination');
  await click('#releaseButton');
  await fill('#releaseText', 'ACCOUNT_A_PRIVATE_MODAL_222');
  const bLoad = hold('GET', 'B');
  const cleared = await evaluate("(()=>{window.__diaryAuth('B');return {text:document.getElementById('journalText').value,disabled:document.getElementById('journalText').disabled,dialog:document.getElementById('diaryDialog').open,modal:document.getElementById('dialogBody').textContent,collection:document.getElementById('collectionView').innerHTML,tags:document.getElementById('entryTags').textContent}})()");
  assert.deepEqual(cleared, { text: '', disabled: true, dialog: false, modal: '', collection: '', tags: '' }, 'Private UI is cleared synchronously, before the new-account GET can finish');
  await poll(() => bLoad.request, 'pending B initial load');
  lateGet.release();
  await poll(() => completed.some(url => url?.includes('cursor=more-A')), 'late A response finished downloading');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await poll(() => evaluate("document.getElementById('saveState').textContent.includes('Abrindo')"), 'B still loading');
  assert.equal(await evaluate(`document.body.innerHTML.includes(${JSON.stringify(lateA)})`), false);
  bLoad.release();
  await poll(() => evaluate(`document.getElementById('journalText').value===${JSON.stringify(b)}`), 'B entry');
  await click('[data-tab="timeline"]');
  await poll(() => evaluate("!!document.querySelector('[data-open=\"b-page\"]')"), 'B timeline');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-open]')].map(node=>node.dataset.open)"), ['b-page']);
  assert.equal(await evaluate(`document.body.innerHTML.includes(${JSON.stringify(a)}) || document.body.innerHTML.includes(${JSON.stringify(lateA)})`), false, 'Neither old-account page is exposed after the late response');
}));

test('production diary: weather and every page personalization survive a reload without text', options, () => withBrowser(async ({ accounts, navigate, click, fill, evaluate }) => {
  await navigate();
  assert.equal(await evaluate("document.getElementById('journalText').value"), '');
  await click('#weatherButton');
  await poll(() => evaluate("document.getElementById('weatherLabel').textContent.includes('Chuva suave')"), 'captured weather');
  await click('#feelingButton');
  await click('[data-feeling="nostalgia"]');
  await click('#applyFeelings');
  await click('#aromaButton');
  await click('[data-aroma="lavanda"]');
  await click('#fontButton');
  await click('[data-font="classic"]');
  await click('#tagsButton');
  await fill('#tagsInput', 'chuva, aconchego');
  await click('#tagsForm button[type="submit"]');
  await poll(() => evaluate("document.getElementById('saveState').dataset.state==='saved'"), 'metadata-only page saved');
  assert.equal(accounts.get('A').size, 1);
  const stored = [...accounts.get('A').values()][0];
  assert.equal(stored.text, '');
  assert.equal(stored.weather, 'rain');
  assert.equal(stored.aroma, 'lavanda');
  assert.equal(stored.font, 'classic');
  assert.deepEqual(stored.feelings, ['nostalgia']);
  assert.deepEqual(stored.tags, ['chuva', 'aconchego']);

  await navigate();
  assert.equal(await evaluate("document.getElementById('journalText').value"), '');
  assert.match(await evaluate("document.getElementById('weatherLabel').textContent"), /Chuva suave/);
  assert.match(await evaluate("document.getElementById('aromaLabel').textContent"), /lavanda/i);
  assert.match(await evaluate("document.getElementById('feelingButton').textContent"), /Nostalgia/);
  assert.equal(await evaluate("document.getElementById('paper').dataset.font"), 'classic');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#entryTags .tag')].map(tag=>tag.textContent)"), ['#chuva', '#aconchego']);
  await click('[data-tab="timeline"]');
  await poll(() => evaluate("!!document.querySelector('.entry-open h2')"), 'metadata-only timeline card');
  assert.match(await evaluate("document.querySelector('.entry-open h2').textContent"), /Chuva suave guardado neste dia/);
}));

test('production diary: letters typed during PUTs survive autosave and a pending page switch', options, () => withBrowser(async ({ accounts, hold, navigate, click, fill, evaluate }) => {
  accounts.get('A').set('writing-page', entry('writing-page', 'Original writing'));
  await navigate();
  const first = hold('PUT', 'A');
  await fill('#journalText', 'First sentence');
  await poll(() => first.request, 'first autosave');
  assert.equal(first.request.body.text, 'First sentence');
  const second = hold('PUT', 'A');
  await fill('#journalText', 'First sentence with more letters');
  await click('#newPageButton');
  assert.equal(await evaluate("document.getElementById('journalText').value"), 'First sentence with more letters', 'Page switch waits for the in-flight save');
  first.release();
  await poll(() => second.request, 'save of letters typed during first PUT');
  assert.equal(second.request.body.text, 'First sentence with more letters');
  const final = hold('PUT', 'A');
  const latest = 'First sentence with more letters and the LAST LETTERS xyz';
  await fill('#journalText', latest);
  second.release();
  await poll(() => final.request, 'save of letters typed during second PUT');
  assert.equal(final.request.body.text, latest);
  assert.equal(await evaluate("document.getElementById('journalText').value"), latest, 'Editor still holds every letter until the last save returns');
  final.release();
  await poll(() => evaluate("document.getElementById('journalText').value===''"), 'new page after every edit is saved');
  assert.equal(accounts.get('A').get('writing-page').text, latest);
  assert.equal(accounts.get('A').get('writing-page').version, 4);
  await click('[data-tab="timeline"]');
  await poll(() => evaluate("!!document.querySelector('[data-open=\"writing-page\"]')"), 'saved memory');
  await click('[data-open="writing-page"]');
  assert.equal(await evaluate("document.getElementById('journalText').value"), latest, 'Reopening recovers the exact final text');
}));

test('production diary: new page turns the saved sheet with sound and retains both entries', options, () => withBrowser(async ({ accounts, navigate, click, fill, evaluate, send }) => {
  const original = 'Uma lembrança que precisa continuar guardada.';
  accounts.get('A').set('original-page', entry('original-page', original));
  await navigate();
  await click('#bookCover');
  await evaluate("window.__newEntryTurns=0;window.__newEntrySounds=0;HTMLMediaElement.prototype.play=function(){window.__newEntrySounds++;return Promise.resolve()};document.getElementById('paper').addEventListener('diarypageturn',event=>{if(event.detail.entry)window.__newEntryTurns++})");
  await click('#newPageButton');
  await poll(() => evaluate("document.getElementById('paper').classList.contains('is-turning-entry')"), 'new-entry page turn');
  assert.equal(await evaluate("document.querySelector('#pageTurnEffect textarea').value"), original, 'The outgoing sheet still shows the saved writing during the turn');
  assert.equal(await evaluate("document.querySelectorAll('#pageTurnEffect [id]').length"), 0, 'The decorative snapshot does not duplicate control IDs');
  assert.equal(await evaluate("document.getElementById('journalText').value"), '', 'The new blank sheet is revealed underneath');
  assert.ok(await evaluate("document.getElementById('pageTurnEffect').getAnimations().length") > 0, 'New page runs a paper animation');
  assert.equal(await evaluate("document.getElementById('newPageButton').disabled"), true, 'Repeated clicks cannot create overlapping page changes');
  await click('#newPageButton');
  assert.equal(await evaluate('window.__newEntryTurns'), 1);
  assert.equal(await evaluate('window.__newEntrySounds'), 1, 'New page plays the paper recording once');
  await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'completed page turn');
  assert.equal(await evaluate("document.getElementById('pageTurnEffect').childElementCount"), 0, 'The outgoing snapshot is released after the animation');
  const next = 'Uma nova história em outra página.';
  await fill('#journalText', next);
  await poll(() => [...accounts.get('A').values()].some(item => item.text === next), 'new entry saved independently');
  assert.equal(accounts.get('A').get('original-page').text, original);
  assert.equal(accounts.get('A').size, 2);
  await click('[data-tab="timeline"]');
  await click('[data-open="original-page"]');
  assert.equal(await evaluate("document.getElementById('journalText').value"), original, 'The previous page remains available in the timeline');

  await evaluate("window.__newEntryTurns=0");
  await click('#newPageButton');
  await poll(() => evaluate("document.getElementById('paper').classList.contains('is-turning-entry')"), 'second page turn');
  await evaluate("window.__diaryAuth('B')");
  assert.equal(await evaluate("document.getElementById('pageTurnEffect').childElementCount"), 0, 'Switching accounts clears the outgoing private snapshot synchronously');
  assert.equal(await evaluate("document.getElementById('paper').classList.contains('is-turning-entry')"), false);
  await poll(() => evaluate("!document.getElementById('journalText').disabled"), 'second account ready');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const turnsBefore = await evaluate('window.__newEntryTurns');
  await click('#newPageButton');
  await poll(() => evaluate(`window.__newEntryTurns===${turnsBefore + 1}`), 'new page with reduced motion');
  assert.equal(await evaluate("document.getElementById('pageTurnEffect').getAnimations().length"), 0, 'Reduced motion skips the page animation');
  assert.equal(await evaluate("document.getElementById('pageTurnEffect').childElementCount"), 0);
  await evaluate("window.__paperPauses=0;HTMLMediaElement.prototype.pause=function(){window.__paperPauses++};HTMLMediaElement.prototype.play=function(){return new Promise(resolve=>{window.__finishPaperLoading=resolve})}");
  await click('#newPageButton');
  await poll(() => evaluate('typeof window.__finishPaperLoading === "function"'), 'pending paper audio download');
  const pausesAtRequest = await evaluate('window.__paperPauses');
  await poll(() => evaluate(`window.__paperPauses>${pausesAtRequest}`), 'late paper audio cancelled');
  await evaluate('window.__finishPaperLoading()');
}));

test('production diary: new page keeps writing visible when saving fails', options, () => withBrowser(async ({ accounts, hold, navigate, click, fill, evaluate }) => {
  accounts.get('A').set('conflict-page', entry('conflict-page', 'Original'));
  await navigate();
  const pending = hold('PUT', 'A');
  const writing = 'Estas palavras ainda precisam ser salvas.';
  await fill('#journalText', writing);
  await click('#newPageButton');
  await poll(() => pending.request, 'save before the page change');
  accounts.get('A').get('conflict-page').version++;
  pending.release();
  await poll(() => evaluate("document.getElementById('saveState').dataset.state==='error'"), 'save conflict');
  assert.equal(await evaluate("document.getElementById('journalText').value"), writing, 'Failed saving leaves all writing in place');
  assert.equal(await evaluate("document.getElementById('paper').classList.contains('is-turning-entry')"), false, 'A failed save does not turn to an empty page');
  await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'new-page action restored');
}));

test('production diary: a slow capsule response preserves a different modal opened meanwhile', options, () => withBrowser(async ({ accounts, hold, navigate, click, fill, evaluate }) => {
  await navigate();
  await click('[data-tab="capsules"]');
  await poll(() => evaluate("!!document.getElementById('collectionNew')"), 'capsules collection');
  await click('#collectionNew');
  await poll(() => evaluate("!!document.getElementById('capsuleText')"), 'capsule form');
  const date = await evaluate("document.getElementById('capsuleDate').min");
  await fill('#capsuleDate', date);
  await fill('#capsuleText', 'A letter for my future self');
  const capsule = hold('PUT', 'A', request => request.body.kind === 'capsule');
  await click('#sealCapsule');
  await poll(() => capsule.request, 'pending capsule save');
  // Opening another real application modal closes/clears the old form without
  // relying on test-only production hooks or the browser confirmation dialog.
  await click('[data-memory="park"]');
  await poll(() => evaluate("document.getElementById('diaryDialog').open && !!document.getElementById('memoryWrite')"), 'replacement memory modal');
  const title = await evaluate("document.getElementById('dialogTitle').textContent");
  capsule.release();
  await poll(() => accounts.get('A').has(capsule.request.body.id), 'capsule persisted');
  await poll(() => evaluate("document.getElementById('diaryToast').textContent.includes('Sua cápsula está guardada')"), 'capsule response processed');
  assert.equal(await evaluate("document.getElementById('diaryDialog').open"), true);
  assert.equal(await evaluate("document.getElementById('dialogTitle').textContent"), title);
  assert.equal(await evaluate("!!document.getElementById('memoryWrite')"), true, 'Late completion leaves the newer dialog intact');
  assert.equal(await evaluate("document.getElementById('capsuleText')"), null, 'Sealed message is removed from the DOM');
}));

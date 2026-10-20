import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
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
  const browser = spawn(chrome, ['--headless=new', '--mute-audio', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
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
      if (['#newPageButton', '#previousWritingPage', '#nextWritingPage'].includes(selector)) {
        if (await evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled`)) return;
        const point = await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center'});const box=node.getBoundingClientRect();return {x:box.left+box.width/2,y:box.top+box.height/2}})()`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
        return;
      }
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

test('production diary: the book is visible before scripts run in both portals and retains its initial geometry after loading', options, () => withBrowser(async ({ server, navigate, evaluate, send }) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  let initial;
  for (const path of ['/aluno-diario.html', '/app/diario.html']) {
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${path}` });
    await poll(() => evaluate(`location.pathname===${JSON.stringify(path)} && document.readyState==='complete' && !!document.getElementById('bookCover')`), 'static diary document');
    initial = await evaluate("(()=>{const cover=document.getElementById('bookCover'),frame=document.getElementById('bookFrame'),box=frame.getBoundingClientRect();return {cover:getComputedStyle(cover).display,coverVisibility:getComputedStyle(cover).visibility,toolbar:getComputedStyle(document.getElementById('bookToolbar')).display,width:Math.round(box.width),height:Math.round(box.height),closed:!frame.classList.contains('is-cover-open'),disabled:document.getElementById('journalText').disabled}})()");
    assert.equal(initial.cover, 'flex', `${path} shows the book cover without JavaScript`);
    assert.equal(initial.coverVisibility, 'visible');
    assert.equal(initial.toolbar, 'flex');
    assert.equal(initial.closed, true);
    assert.equal(initial.disabled, true);
    assert.ok(initial.width > 500 && initial.height > 500, 'The fixed book layout is present on the first paint');
  }
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  await navigate();
  const loaded = await evaluate("(()=>{const box=document.getElementById('bookFrame').getBoundingClientRect();return {width:Math.round(box.width),height:Math.round(box.height),cover:getComputedStyle(document.getElementById('bookCover')).display}})()");
  assert.equal(loaded.cover, 'flex');
  assert.equal(loaded.width, initial.width, 'Restoring the session does not replace the initial layout');
  assert.equal(loaded.height, initial.height);
}));

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

test('production diary: handwriting choices style the writing, invitation and saved page', options, () => withBrowser(async ({ accounts, navigate, click, evaluate, send }) => {
  const writing = 'Boa tarde.\nUma lembrança para guardar.';
  accounts.get('A').set('font-page', entry('font-page', writing));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate(); await click('#bookCover');
  for (const [id, family] of [['hand', 'Caveat'], ['classic', 'Cormorant Garamond'], ['simple', 'Inter']]) {
    await click('#fontButton'); await click(`.font-choice[data-font="${id}"]`);
    await poll(() => accounts.get('A').get('font-page').font === id, `${id} saved`);
    await evaluate('document.fonts.ready');
    const typography = await evaluate("(()=>{const text=document.getElementById('journalText'),style=getComputedStyle(text),hint=getComputedStyle(text,'::placeholder'),ctx=document.createElement('canvas').getContext('2d');ctx.font=style.font;const metrics=ctx.measureText('Agp'),line=parseFloat(style.lineHeight),baseline=(line-metrics.fontBoundingBoxAscent-metrics.fontBoundingBoxDescent)/2+metrics.fontBoundingBoxAscent;return {font:style.fontFamily,hint:hint.fontFamily,size:parseFloat(style.fontSize),hintSize:parseFloat(hint.fontSize),gap:line-1+parseFloat(style.backgroundPositionY)-baseline,value:text.value,typeset:getComputedStyle(document.getElementById('journalTypeset')).fontFamily}})()");
    assert.ok(typography.font.includes(family), `${id} uses ${family}: ${typography.font}`);
    assert.equal(typography.hint, typography.font, 'The invitation follows the selected family');
    assert.equal(typography.hintSize, typography.size);
    assert.ok(typography.gap >= -.5 && typography.gap <= 2.5, `${id} rests on the rule: ${typography.gap.toFixed(2)}px`);
    assert.equal(typography.value, writing);
    assert.ok(typography.typeset.includes(family), 'Guarding the day keeps the selected family');
    if (process.env.DIARY_CAPTURE_PREVIEW === '1') {
      const clip = await evaluate("(()=>{const box=document.getElementById('journalText').getBoundingClientRect();return {x:box.left+scrollX,y:box.top+scrollY,width:box.width,height:100,scale:2}})()");
      for (const mode of ['writing', 'invitation']) {
        if (mode === 'invitation') await evaluate("document.getElementById('journalText').value=''");
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
        await writeFile(join(root, `docs/diary-preview/font-${id}-${mode}.png`), Buffer.from(shot.data, 'base64'));
      }
      await evaluate(`document.getElementById('journalText').value=${JSON.stringify(writing)}`);
    }
    await navigate(); await click('#bookCover');
    assert.ok((await evaluate("getComputedStyle(document.getElementById('journalText')).fontFamily")).includes(family), `${id} is restored after reloading`);
    assert.equal(accounts.get('A').get('font-page').text, writing);
  }
  await click('#sealDayButton');
  await poll(() => evaluate("!document.getElementById('journalTypeset').hidden"), 'day guarded');
  assert.ok((await evaluate("getComputedStyle(document.querySelector('.drop-cap')).fontFamily")).includes('Inter'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('#diaryThemeToggle');
  assert.ok((await evaluate("getComputedStyle(document.getElementById('journalTypeset')).fontFamily")).includes('Inter'), 'Mobile and night mode retain the selected style');
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
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 2 de 365', 'New entry advances the fixed-size book counter');
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').hasAttribute('data-i18n')"), false, 'Delayed static translations cannot reset the live page number');
  assert.equal(await evaluate("document.getElementById('paper').contains(document.getElementById('pageTurnEffect'))"), false, 'The turning sheet is outside the clipped paper');
  const motion = await evaluate("(()=>{const effect=document.getElementById('pageTurnEffect'),animation=effect.getAnimations().find(item=>item.animationName==='pageLeafOpen'),cover=getComputedStyle(document.getElementById('bookCover'));for(const item of effect.getAnimations()){item.pause();item.currentTime=650}return {duration:animation.effect.getTiming().duration,easing:animation.effect.getKeyframes()[0].easing,coverDuration:parseFloat(cover.transitionDuration)*1000,coverEasing:cover.transitionTimingFunction.split('),')[0]+')',end:animation.effect.getKeyframes().at(-1).transform,backface:getComputedStyle(effect).backfaceVisibility,overflow:getComputedStyle(effect.parentElement).overflow}})()");
  assert.equal(motion.duration, motion.coverDuration, 'The page opens at the same speed as the cover');
  assert.equal(motion.easing, motion.coverEasing, 'The page and cover share the same easing');
  assert.equal(motion.end, 'rotateY(-112deg)', 'The page stops at the cover opening angle');
  assert.equal(motion.backface, 'hidden', 'The page disappears behind the spine like the cover');
  assert.equal(motion.overflow, 'visible');
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
  await click('#previousWritingPage');
  await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'previous saved entry');
  assert.equal(await evaluate("document.getElementById('journalText').value"), original);
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 1 de 365');
  await click('#nextWritingPage');
  await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'next saved entry');
  assert.equal(await evaluate("document.getElementById('journalText').value"), next);
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 2 de 365');
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

test('production diary: delete action stays inside the footer on both sides of a page turn', options, () => withBrowser(async ({ accounts, navigate, click, evaluate, send }) => {
  const previousDate = new Date(new Date(`${today()}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  accounts.get('A').set('earlier', entry('earlier', '', { date: previousDate, createdAt: 1 }));
  accounts.get('A').set('later', entry('later', '', { createdAt: 2, weather: 'clear' }));
  // Wide books produce fractional column widths: the old flex layout wrapped
  // the cloned button below the footer after its auto margin became pixels.
  for (const width of [2880, 1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width < 700 });
    await navigate(); await evaluate('document.fonts.ready'); await click('#bookCover');
    for (const direction of ['backward', 'forward']) {
      await click(direction === 'backward' ? '#previousWritingPage' : '#nextWritingPage');
      await poll(() => evaluate("!!document.querySelector('#pageTurnEffect .page-turn-snapshot')"), `${direction} snapshot`);
      await evaluate(`for(const animation of document.getElementById('pageTurnEffect').getAnimations()){animation.pause();animation.currentTime=${direction === 'backward' ? 1300 : 0}}`);
      const controls = await evaluate("['#editorView','#pageTurnEffect .page-turn-snapshot','#pageTurnUnderlay .page-turn-snapshot'].filter(selector=>document.querySelector(selector)).map(selector=>{const root=document.querySelector(selector),button=root.querySelector('.paper-bottom .text-button'),footer=root.querySelector('.entry-footer').getBoundingClientRect(),row=root.querySelector('.paper-bottom').getBoundingClientRect(),box=button.getBoundingClientRect();return {selector,label:button.textContent,button:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},footer:{left:footer.left,right:footer.right,top:footer.top,bottom:footer.bottom},row:{left:row.left,right:row.right,top:row.top,bottom:row.bottom}}})");
      assert.equal(controls.length, direction === 'backward' ? 3 : 2);
      for (const { selector, label, button, footer, row } of controls) {
        const context = `${direction}, ${width}px, ${selector}`;
        assert.equal(label, 'Excluir página');
        assert.ok(button.top >= row.top - 1 && button.bottom <= row.bottom + 1, `${context}: delete action stays in its row`);
        assert.ok(button.left >= footer.left && button.right <= footer.right + 1 && button.top >= footer.top && button.bottom <= footer.bottom + 1, `${context}: delete action stays inside the footer`);
      }
      await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), `${direction} page landed`);
    }
  }
}));

test('production diary: returning pages carry their own date and reveal it only when the turn completes', options, () => withBrowser(async ({ accounts, navigate, click, evaluate, send }) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const previousDate = new Date(new Date(`${today()}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const previousDay = String(Number(previousDate.slice(-2))), currentDay = String(Number(today().slice(-2)));
  accounts.get('A').set('earlier', entry('earlier', 'A lembrança da página anterior.', { date: previousDate, createdAt: 1 }));
  accounts.get('A').set('later', entry('later', 'A lembrança que estava aberta.', { createdAt: 2 }));
  await navigate(); await click('#bookCover');
  assert.equal(await evaluate("document.getElementById('entryDay').textContent"), currentDay);
  await click('#previousWritingPage');
  await poll(() => evaluate("document.getElementById('pageTurnUnderlay').classList.contains('is-visible')"), 'outgoing page held under the returning leaf');
  await evaluate("for(const animation of document.getElementById('pageTurnEffect').getAnimations()){animation.pause();animation.currentTime=600}");
  assert.equal(await evaluate("document.getElementById('entryDay').textContent"), currentDay, 'The live date does not jump before the returning page lands');
  assert.equal(await evaluate("document.querySelector('#pageTurnUnderlay .entry-date strong').textContent"), currentDay);
  assert.equal(await evaluate("document.querySelector('#pageTurnUnderlay textarea').value"), 'A lembrança que estava aberta.');
  assert.equal(await evaluate("document.querySelector('#pageTurnEffect .entry-date strong').textContent"), previousDay, 'The returning leaf shows the incoming date');
  assert.equal(await evaluate("document.querySelector('#pageTurnEffect textarea').value"), 'A lembrança da página anterior.');
  assert.equal(await evaluate("document.querySelectorAll('#pageTurnEffect [id],#pageTurnUnderlay [id]').length"), 0);
  if (process.env.DIARY_CAPTURE_PREVIEW === '1') {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'docs/diary-preview/return-page-turn-desktop.png'), Buffer.from(shot.data, 'base64'));
  }
  const closing = await evaluate("(()=>{const effect=document.getElementById('pageTurnEffect'),animation=effect.getAnimations().find(item=>item.animationName==='pageLeafClose'),frame=getComputedStyle(effect.parentElement),style=document.createElement('div').style;style.transitionTimingFunction=frame.getPropertyValue('--book-close-easing');return {duration:animation.effect.getTiming().duration,easing:animation.effect.getKeyframes()[0].easing,coverDuration:parseFloat(frame.getPropertyValue('--book-close-duration')),coverEasing:style.transitionTimingFunction}})()");
  assert.equal(closing.duration, closing.coverDuration);
  assert.equal(closing.easing.replaceAll(' ', ''), closing.coverEasing.replaceAll(' ', ''));
  await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'returning page landed');
  assert.equal(await evaluate("document.getElementById('entryDay').textContent"), previousDay);
  assert.equal(await evaluate("document.getElementById('pageTurnUnderlay').childElementCount"), 0);
  assert.equal(await evaluate("document.getElementById('pageTurnEffect').childElementCount"), 0);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await click('#nextWritingPage');
  await poll(() => evaluate(`document.getElementById('entryDay').textContent===${JSON.stringify(currentDay)}`), 'next date with reduced motion');
  await click('#previousWritingPage');
  await poll(() => evaluate(`document.getElementById('entryDay').textContent===${JSON.stringify(previousDay)}`), 'previous date with reduced motion');
  assert.equal(await evaluate("document.getElementById('pageTurnEffect').getAnimations().length"), 0);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await click('#nextWritingPage');
  await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'next sheet ready before account switch');
  await click('#previousWritingPage');
  await poll(() => evaluate("document.getElementById('pageTurnUnderlay').childElementCount>0"), 'private outgoing sheet mounted');
  accounts.get('B').set('b-page', entry('b-page', 'A página de outra conta.'));
  await evaluate("window.__diaryAuth('B')");
  assert.equal(await evaluate("document.getElementById('pageTurnUnderlay').childElementCount"), 0, 'Account changes clear the stationary outgoing snapshot immediately');
  assert.equal(await evaluate("document.getElementById('pageTurnEffect').childElementCount"), 0);
  await poll(() => evaluate("document.getElementById('journalText').value==='A página de outra conta.'"), 'second account ready');
  assert.equal(await evaluate("document.getElementById('entryDay').textContent"), currentDay, 'A cancelled return cannot overwrite the next account date');
}));

test('production diary: book counts blank drafts, navigates records and restores saved numbering', options, () => withBrowser(async ({ accounts, navigate, click, fill, evaluate }) => {
  accounts.get('A').set('first-page', entry('first-page', 'Primeira página'));
  await navigate(); await click('#bookCover');
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 1 de 365');
  const finished = () => poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'book turn completed');
  await click('#nextWritingPage'); await finished();
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 2 de 365', 'The next arrow opens an available blank sheet');
  await click('#newPageButton'); await finished();
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 3 de 365');
  await click('#previousWritingPage'); await finished();
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 2 de 365');
  await fill('#journalText', 'Segunda página');
  await poll(() => accounts.get('A').size === 2, 'second page saved');
  await click('#nextWritingPage'); await finished();
  await fill('#journalText', 'Terceira página');
  await poll(() => accounts.get('A').size === 3, 'third page saved');
  await navigate(); await click('#bookCover');
  assert.match(await evaluate("document.getElementById('writingPageIndicator').textContent"), /de 365$/);
  await click('#nextWritingPage'); await finished();
  assert.equal(await evaluate("document.getElementById('journalText').value"), 'Segunda página');
  await click('#nextWritingPage'); await finished();
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 3 de 365');
  assert.equal(await evaluate("document.getElementById('journalText').value"), 'Terceira página');
}));

test('production diary: the 365th page stays editable and cannot create page 366', options, () => withBrowser(async ({ accounts, pages, cursors, navigate, click, fill, evaluate }) => {
  const start = Date.now() - 365000;
  for (let number = 1; number <= 365; number++) {
    const id = `sheet-${number}`;
    accounts.get('A').set(id, entry(id, `Lembrança ${number}`, { createdAt: start + number * 1000 }));
  }
  // Keep the older sheets behind the API cursor, as in a real large diary.
  const older = [...accounts.get('A').values()].slice(0, 265);
  for (const item of older) accounts.get('A').delete(item.id);
  cursors.set('A', 'older-sheets'); pages.set('A:older-sheets', older);
  await navigate(); await click('#bookCover');
  assert.equal(await evaluate("document.getElementById('writingPageIndicator').textContent"), 'Página 266 de 365', 'Older API pages are included before the diary becomes editable');
  await click('#previousWritingPage');
  await poll(() => evaluate("document.getElementById('journalText').value==='Lembrança 265'"), 'older page outside the expanded timeline');
  await poll(() => evaluate("!document.getElementById('paper').classList.contains('is-turning-entry')"), 'older page turn finished');
  await click('[data-tab="timeline"]'); await click('[data-open="sheet-365"]');
  await poll(() => evaluate("document.getElementById('writingPageIndicator').textContent==='Página 365 de 365'"), 'last diary page');
  assert.equal(await evaluate("document.getElementById('nextWritingPage').disabled"), true);
  assert.equal(await evaluate("document.getElementById('newPageButton').disabled"), true);
  await click('#newPageButton'); await click('#nextWritingPage');
  assert.equal(accounts.get('A').size + older.length, 365);
  assert.equal(await evaluate("document.getElementById('journalText').value"), 'Lembrança 365');
  await fill('#journalText', 'Última lembrança, com carinho.');
  await poll(() => accounts.get('A').get('sheet-365').text === 'Última lembrança, com carinho.', 'last page edited and saved');
  await fill('#journalText', 'Um texto que não cabe na última folha.\n'.repeat(250));
  assert.equal(await evaluate("document.getElementById('journalText').value"), 'Última lembrança, com carinho.', 'Overflow cannot overwrite the saved last page');
  assert.equal(older[0].text, 'Lembrança 1');
  await click('#previousWritingPage');
  await poll(() => evaluate("document.getElementById('writingPageIndicator').textContent==='Página 364 de 365'"), 'previous sheet of full book');
  await poll(() => evaluate("!document.getElementById('paper').classList.contains('is-turning-entry')"), 'previous sheet turn finished');
  await click('#nextWritingPage');
  await poll(() => evaluate("document.getElementById('writingPageIndicator').textContent==='Página 365 de 365'"), 'return to last sheet');
}));

test('production diary: invitation waits for its idle timer, works in the background and remembers being disabled', options, () => withBrowser(async ({ accounts, navigate, click, evaluate, send }) => {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const schedule = window.setTimeout.bind(window), cancel = window.clearTimeout.bind(window);
    const invitations = new Map(); let sequence = 0;
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 600000) { const id = --sequence; invitations.set(id, callback); return id; }
      return schedule(callback, delay, ...args);
    };
    window.clearTimeout = id => { if (id < 0) invitations.delete(id); else cancel(id); };
    window.__fireDiaryInvitations = () => { for (const [id, callback] of [...invitations]) { invitations.delete(id); callback(); } };
    window.__invitationPlays = [];
    HTMLMediaElement.prototype.play = function() { window.__invitationPlays.push({src:this.src,volume:this.volume}); return Promise.resolve(); };
  ` });
  accounts.get('A').set('first-page', entry('first-page', 'Minha escrita permanece aqui.'));
  await navigate();
  assert.equal(await evaluate("document.getElementById('diaryInvitationToggle').getAttribute('aria-pressed')"), 'true');
  assert.equal(await evaluate('window.__invitationPlays.length'), 0, 'Opening the diary does not call immediately');
  await evaluate('window.__fireDiaryInvitations()');
  assert.equal(await evaluate('window.__invitationPlays.length'), 1, 'A full idle interval can call while the diary remains open');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.__fireDiaryInvitations()");
  assert.equal(await evaluate('window.__invitationPlays.length'), 2);
  assert.ok(await evaluate('window.__invitationPlays[0].volume') <= .1, 'The call is softer than a normal page turn');
  assert.equal(await evaluate("document.getElementById('journalText').value"), 'Minha escrita permanece aqui.');
  assert.equal(await evaluate("document.getElementById('pageTurnEffect').getAnimations().length"), 0, 'The invitation does not turn a page');
  await evaluate('window.__fireDiaryInvitations()');
  assert.equal(await evaluate('window.__invitationPlays.length'), 3, 'A later full interval can call again');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))");
  assert.equal(await evaluate('window.__invitationPlays.length'), 3, 'Returning to the diary starts a fresh interval without calling immediately');
  await evaluate("window.dispatchEvent(new Event('pagehide'));window.__fireDiaryInvitations()");
  assert.equal(await evaluate('window.__invitationPlays.length'), 3, 'Leaving the diary document cancels the timer');
  await evaluate("window.dispatchEvent(new Event('pageshow'))");
  await click('#diaryInvitationToggle');
  assert.equal(await evaluate("localStorage.getItem('ep.diary.invitation')"), 'off');
  await navigate();
  assert.equal(await evaluate("document.getElementById('diaryInvitationToggle').getAttribute('aria-pressed')"), 'false');
  assert.equal(await evaluate("document.querySelector('[data-invitation-state]').textContent"), 'Desligado');
  assert.equal(await evaluate("document.querySelector('[data-invitation-state]').hasAttribute('data-i18n')"), false, 'Static translation cannot overwrite the saved disabled state');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.__fireDiaryInvitations()");
  assert.equal(await evaluate('window.__invitationPlays.length'), 0, 'The disabled preference survives reloading and changing tabs');
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

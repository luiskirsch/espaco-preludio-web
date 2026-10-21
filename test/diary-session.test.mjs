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
  const covers = new Map();
  const holds = [];
  const assetHolds = new Map();
  function holdAsset(path) {
    let release;
    const gate = { request: null, wait: new Promise(resolveGate => { release = resolveGate; }), release() { assetHolds.delete(path); release(); } };
    assetHolds.set(path, gate);
    return gate;
  }
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
      const assetGate = assetHolds.get(pathname);
      if (assetGate) { assetGate.request = pathname; await assetGate.wait; }
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
        if (pathname.endsWith('/ajustes/capa')) {
          if (request.method === 'PUT') covers.set(uid, body.title);
          payload = { ok: true, cover: { title: covers.get(uid) || '' } };
        } else if (request.method === 'GET') {
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
        response.writeHead(200, { 'content-type': mime['.js'] }).end('const user=uid=>({uid,displayName:window.__diaryNames?.[uid]||uid,getIdToken:async()=>uid}); export function onAuthStateChanged(auth,callback){ window.__diaryAuth=uid=>callback(uid?user(uid):null); window.__diaryAuth("A"); return ()=>{}; }');
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
      // Exercise the real entry links without loading production authentication.
      if (pathname === '/app/home.html') body = body.toString('utf8').replace(/<script type="module">[\s\S]*?<\/script>/g, '').replace(/<script src="\.\/sw-register\.js[^"\s]*"[^>]*><\/script>/g, '');
      if (pathname === '/aluno-painel.html' && url.searchParams.has('preview')) body = body.toString('utf8').replace(/^\s*import .+ from .+;\r?\n/gm, '');
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }).end(body);
    } catch (error) {
      response.writeHead(404).end(String(error.message));
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return { server, accounts, pages, cursors, requests, covers, hold, holdAsset, releaseAll() { holds.forEach(gate => gate.release()); for (const gate of assetHolds.values()) gate.release(); } };
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
      await poll(() => evaluate("typeof window.__diaryAuth==='function' && !document.getElementById('journalText').disabled && !document.querySelector('.diary-entrance') && !document.documentElement.classList.contains('diary-entrance-pending')"), 'production auth fixture and entrance ready');
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

test('production diary: the textured book is visible before scripts run in both portals and retains its initial geometry after loading', options, () => withBrowser(async ({ server, navigate, evaluate, send, holdAsset }) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  const externalTexture = holdAsset('/app/assets/diary/leather-cover.png');
  const originalTexture = (await readFile(join(root, 'app/assets/diary/leather-cover.png'))).toString('base64');
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
    assert.equal(await evaluate("document.getElementById('coverTitle').textContent"), '', 'Static HTML never paints a generic cover title before the account is known');
    assert.equal(await evaluate("document.getElementById('coverTitle').hasAttribute('data-i18n')"), false, 'Translation bootstrap cannot insert the generic title');
    assert.ok(initial.width > 500 && initial.height > 500, 'The fixed book layout is present on the first paint');
    const texture = await evaluate(`(async()=>{
      const cover=getComputedStyle(document.getElementById('bookCover')).backgroundImage;
      const binding=getComputedStyle(document.getElementById('bookFrame'),'::before').backgroundImage;
      const url=cover.match(/url\\("(data:image\\/webp;base64,[^"]+)"\\)/)?.[1];
      if(!url) return {inline:false};
      const pixels=async source=>{
        const bitmap=await createImageBitmap(await (await fetch(source)).blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
        const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');
        ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;
      };
      const [actual,original]=await Promise.all([pixels(url),pixels('data:image/png;base64,${originalTexture}')]);
      return {inline:true,binding:binding.includes(url),identical:actual.length===original.length&&actual.every((value,index)=>value===original[index])};
    })()`);
    assert.deepEqual(texture, { inline: true, binding: true, identical: true }, `${path}: cover and binding have the original texture before JavaScript, even with external images unavailable`);
    assert.equal(externalTexture.request, null, 'The first cover paint needs no separate texture download');
  }
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  await navigate();
  const loaded = await evaluate("(()=>{const box=document.getElementById('bookFrame').getBoundingClientRect();return {width:Math.round(box.width),height:Math.round(box.height),cover:getComputedStyle(document.getElementById('bookCover')).display}})()");
  assert.equal(loaded.cover, 'flex');
  assert.equal(loaded.width, initial.width, 'Restoring the session does not replace the initial layout');
  assert.equal(loaded.height, initial.height);
}));

test('production diary: the cover stays closed without interaction on first access, reload and after closing', { ...options, timeout: 45000 }, () => withBrowser(async ({ server, accounts, click, evaluate, send }) => {
  accounts.get('A').set('closed-cover-page', entry('closed-cover-page', 'Uma lembrança guardada.'));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const assertStillClosed = async label => {
    // Wait beyond the former automatic opening, including after a fresh reload.
    await evaluate('new Promise(resolve=>setTimeout(resolve,4500))');
    assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'false', label);
    assert.equal(await evaluate("document.getElementById('bookFrame').classList.contains('is-cover-open')"), false, label);
    assert.equal(await evaluate("document.getElementById('closeDiaryButton').textContent"), 'Abrir diário');
  };
  for (const path of ['/app/diario.html', '/aluno-diario.html']) {
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${path}` });
    await poll(() => evaluate("!!document.getElementById('journalText') && !document.getElementById('journalText').disabled"), 'first diary access');
    await assertStillClosed(`${path}: the initial cover waits for interaction`);
    await click('#bookCover');
    assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'true');
    await click('#closeDiaryButton');
    await assertStillClosed(`${path}: a closed diary stays closed`);
    await send('Page.reload', { ignoreCache: true });
    await poll(() => evaluate("!!document.getElementById('journalText') && !document.getElementById('journalText').disabled"), 'reloaded diary');
    await assertStillClosed(`${path}: reloading keeps the cover closed`);
  }
}));

test('production diary: portal entry carries the cinematic reveal through both real entry points and restores the portal', { ...options, timeout: 60000 }, () => withBrowser(async ({ server, accounts, send, click, evaluate }) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  accounts.get('A').set('entry-page', entry('entry-page', 'Uma lembrança para guardar.'));
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__diaryNames={A:'Luis Henrique'}" });
  const passageView = `(()=>{
    const root=document.querySelector('.diary-entrance'),scene=root.querySelector('.diary-entrance__scene'),box=scene.getBoundingClientRect();
    return {x:box.x,y:box.y,width:box.width,height:box.height,cover:getComputedStyle(root.querySelector('.diary-entrance__cover')).filter,haloDelay:parseFloat(getComputedStyle(root.querySelector('.diary-entrance__halo')).animationDelay),overflow:getComputedStyle(document.documentElement).overflowY,bookWidth:document.getElementById('bookFrame')?.offsetWidth};
  })()`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `const entranceObserver=new MutationObserver(()=>{
    if(!document.querySelector('.diary-entrance--arrival'))return;
    window.__diaryArrivalView ||= ${passageView};
    if(document.documentElement.classList.contains('diary-entrance-revealing')){
      window.__diaryRevealView=${passageView};entranceObserver.disconnect();
    }
  });entranceObserver.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});` });
  const sources = [
    ['/app/home.html', '.home-diary-card', '/app/diario.html', 1440],
    ['/app/home.html', '.a-nav__item[href="./diario.html"]', '/app/diario.html', 1440],
    ['/aluno-painel.html?preview=1', '.home-diary-card', '/aluno-diario.html', 390],
    ['/aluno-painel.html?preview=1', '.nav-button--diary', '/aluno-diario.html', 390],
    ['/aluno-painel.html?preview=1', '.home-diary-card', '/aluno-diario.html', 390, true],
  ];
  for (const [source, selector, target, width, reduced] of sources) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url: origin + source });
    await poll(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && document.documentElement.dataset.diaryEntranceBound==='true' && !!document.getElementById('diaryEntranceStyles')?.sheet`), 'real portal entry ready');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
    await click(selector);
    await poll(() => evaluate("!!document.querySelector('.diary-entrance--departure')"), 'departure visible');
    assert.equal(await evaluate('location.pathname'), source.split('?')[0], 'The portal remains visible behind the beginning of the transition');
    assert.equal(await evaluate("document.activeElement.classList.contains('diary-entrance__skip')"), true, 'Skip is immediately available from the keyboard');
    assert.equal(await evaluate("document.querySelector('.diary-entrance').getAttribute('aria-modal')"), 'true');
    const presentation = await evaluate("(()=>{const root=document.querySelector('.diary-entrance'),scene=root.querySelector('.diary-entrance__scene'),animation=scene.getAnimations().find(item=>item.animationName==='diary-entry-scene');return {particles:root.querySelectorAll('.diary-entrance__dust i').length,duration:animation?.effect.getTiming().duration,cover:!!root.querySelector('.diary-entrance__cover svg'),textured:getComputedStyle(root.querySelector('.diary-entrance__cover')).backgroundImage.startsWith('url(\"data:image/webp;base64,')}})()");
    assert.deepEqual(presentation, { particles: 26, duration: 2250, cover: true, textured: true }, 'Every account and device receives the same presentation');
    const departureView = await evaluate(`(()=>{
      for(const animation of document.querySelector('.diary-entrance').getAnimations({subtree:true})){
        if(['diary-entry-scene','diary-entry-book','diary-entry-line'].includes(animation.animationName))animation.finish();
      }
      return ${passageView};
    })()`);
    if (process.env.DIARY_CAPTURE_PREVIEW === '1' && selector.includes('card')) {
      await evaluate("for(const animation of document.querySelector('.diary-entrance').getAnimations({subtree:true})){animation.pause();animation.currentTime=800}");
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(root, `docs/diary-preview/entrance-${width}-${selector.includes('card') ? 'card' : 'menu'}.png`), Buffer.from(shot.data, 'base64'));
    }
    await poll(() => evaluate(`location.pathname===${JSON.stringify(target)} && !!document.querySelector('.diary-entrance--arrival')`), 'arrival continues the passage');
    const arrivalView = await poll(() => evaluate('window.__diaryArrivalView'), 'first arrival frame recorded');
    for (const metric of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(arrivalView[metric] - departureView[metric]) < .5, `${source} ${width}: the scene must not jump at handoff (${metric}: ${departureView[metric]} to ${arrivalView[metric]})`);
    assert.equal(arrivalView.cover, departureView.cover, 'The leather book retains the same lighting across navigation');
    assert.ok(arrivalView.haloDelay <= -2.25, 'The ambient light continues from the departure phase');
    assert.equal(arrivalView.overflow, 'hidden', 'The scrollbar stays hidden throughout the passage');
    assert.equal(await evaluate("sessionStorage.getItem('ep.diary.entrance')"), null, 'The arrival consumes its one-time intent');
    await poll(() => evaluate("!document.querySelector('.diary-entrance') && !document.documentElement.classList.contains('diary-entrance-pending') && !document.getElementById('journalText').disabled"), 'diary revealed');
    assert.equal(await evaluate("document.getElementById('coverTitle').textContent"), 'Luis Henrique');
    assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'false', 'The passage lands on the closed personal cover');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    const revealView = await evaluate('window.__diaryRevealView');
    assert.equal(await evaluate("document.getElementById('bookFrame').offsetWidth"), revealView.bookWidth, 'Restoring scrolling does not resize the revealed diary');
    const history = await send('Page.getNavigationHistory');
    await send('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id });
    await poll(() => evaluate(`location.pathname===${JSON.stringify(source.split('?')[0])} && !!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('.diary-entrance') && !document.documentElement.classList.contains('diary-entrance-leaving')`), 'back restores portal');
    assert.equal(await evaluate("[...document.body.children].some(element=>element.inert)"), false, 'Back never leaves the portal inert');
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.navigate', { url: origin + '/app/home.html' });
  await poll(() => evaluate("!!document.querySelector('.home-diary-card') && !!document.getElementById('diaryEntranceStyles')?.sheet"), 'keyboard entry ready');
  const intercepted = await evaluate("(()=>{let intercepted;document.addEventListener('click',event=>{intercepted=event.defaultPrevented;event.preventDefault()},{once:true});document.querySelector('.home-diary-card').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true,button:0}));return intercepted})()");
  assert.equal(intercepted, false, 'Modified clicks retain the browser new-tab behavior');
  await evaluate("document.querySelector('.home-diary-card').focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await poll(() => evaluate("!!document.querySelector('.diary-entrance--departure')"), 'keyboard activates passage');
  await click('.diary-entrance__skip');
  await poll(() => evaluate("location.pathname==='/app/diario.html' && !!document.getElementById('journalText') && !document.getElementById('journalText').disabled"), 'skip enters the diary');
  assert.equal(await evaluate("!!document.querySelector('.diary-entrance') || document.documentElement.classList.contains('diary-entrance-pending')"), false, 'Skip also skips the arrival animation');
  await send('Page.reload', { ignoreCache: true });
  await poll(() => evaluate("!!document.getElementById('journalText') && !document.getElementById('journalText').disabled"), 'reloaded diary ready');
  assert.equal(await evaluate("!!document.querySelector('.diary-entrance') || document.documentElement.classList.contains('diary-entrance-pending')"), false, 'Reload never replays the passage');
}));

test('production diary: a slow document, saved cover and fonts never expose an unfinished diary during the passage', { ...options, timeout: 60000 }, () => withBrowser(async ({ server, accounts, covers, holdAsset, hold, send, click, evaluate }) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  accounts.get('A').set('slow-entry', entry('slow-entry', 'Minha lembrança preservada.'));
  covers.set('A', 'Meu universo particular');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded',()=>{window.__diaryDcl=true},{once:true})" });
  for (const [source, selector, target, width] of [
    ['/app/home.html', '.home-diary-card', '/app/diario.html', 1440],
    ['/aluno-painel.html?preview=1', '.nav-button--diary', '/aluno-diario.html', 390],
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url: origin + source });
    await poll(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && !!document.getElementById('diaryEntranceStyles')?.sheet`), 'portal ready');
    await evaluate("localStorage.removeItem('ep.diary.cover-title.A')");
    const module = holdAsset('/app/diary.js');
    const font = holdAsset('/fonts/cormorantgaramond-latin.woff2');
    const cover = hold('GET', 'A', record => record.path.endsWith('/ajustes/capa'));
    await evaluate(`window.addEventListener('pagehide',()=>{
      const scene=document.querySelector('.diary-entrance');
      sessionStorage.setItem('__lastPassageFrame',JSON.stringify({present:!!scene,opacity:scene&&getComputedStyle(scene).opacity}));
    },{once:true})`);
    await click(selector);
    await poll(() => module.request && evaluate(`location.pathname===${JSON.stringify(target)} && !!document.querySelector('.diary-entrance--arrival')`), 'continuation mounted before the delayed module');
    assert.deepEqual(await evaluate("JSON.parse(sessionStorage.getItem('__lastPassageFrame'))"), { present: true, opacity: '1' }, 'The outgoing document retains the cinematic scene in its last frame');
    assert.equal(await evaluate('!!window.__diaryDcl'), false, 'The arrival exists before DOMContentLoaded');
    // The former six-second failsafe exposed a half-loaded interface here.
    await new Promise(resolveWait => setTimeout(resolveWait, 6200));
    const hidden = "!!document.querySelector('.diary-entrance--arrival') && !document.documentElement.classList.contains('diary-entrance-revealing') && getComputedStyle(document.querySelector('.diary-shell')).opacity==='0'";
    assert.equal(await evaluate(hidden), true, 'A slow module never interrupts the scene or reveals placeholders');
    module.release();
    await poll(() => cover.request && evaluate("!document.getElementById('journalText').disabled"), 'writing ready while the saved title is still delayed');
    assert.equal(await evaluate(hidden), true, 'Ready writing alone is insufficient: the saved personal cover must arrive too');
    cover.release();
    await poll(() => evaluate("document.documentElement.dataset.diaryReady==='true' && document.getElementById('coverTitle').textContent==='Meu universo particular'"), 'saved cover restored without a local cache');
    await poll(() => font.request, 'diary font delayed');
    assert.equal(await evaluate(hidden), true, 'The reveal also waits for the real typography');
    font.release();
    await poll(() => evaluate("document.documentElement.classList.contains('diary-entrance-revealing')"), 'one final dissolve');
    const geometry = await evaluate("(()=>{const shell=document.querySelector('.diary-shell'),box=document.getElementById('bookFrame').getBoundingClientRect();return {transform:getComputedStyle(shell).transform,x:box.x,y:box.y,width:box.width,height:box.height}})()");
    assert.equal(geometry.transform, 'none', 'The revealed interface has its final geometry throughout the dissolve');
    await poll(() => evaluate("!document.querySelector('.diary-entrance')"), 'complete passage');
    assert.deepEqual(await evaluate("(()=>{const shell=document.querySelector('.diary-shell'),box=document.getElementById('bookFrame').getBoundingClientRect();return {transform:getComputedStyle(shell).transform,x:box.x,y:box.y,width:box.width,height:box.height}})()"), geometry, 'Finishing the transition never resizes or moves the book');
    assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'false');
  }
}));

test('production diary: the very first arrival frame retains the selected language before translation bootstrap', options, () => withBrowser(async ({ server, send, click, evaluate }) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `const languageObserver=new MutationObserver(()=>{
    const title=document.querySelector('.diary-entrance--arrival h1');if(!title)return;
    window.__firstEntranceCopy=[...title.children].map(node=>node.textContent).join('|');languageObserver.disconnect();
  });languageObserver.observe(document,{childList:true,subtree:true});` });
  for (const [locale, copy] of [['en-US', 'Diary of|Lived Thoughts'], ['es-ES', 'Diario de|Pensamientos Vividos']]) {
    await send('Page.navigate', { url: origin + '/app/home.html' });
    await poll(() => evaluate("!!document.querySelector('.home-diary-card')"), 'language setup');
    await evaluate(`localStorage.setItem('ep_lang',${JSON.stringify(locale)})`);
    await send('Page.navigate', { url: origin + '/app/home.html' });
    await poll(() => evaluate(`window.EP_I18N?.locale?.()===${JSON.stringify(locale)} && !!document.getElementById('diaryEntranceStyles')?.sheet`), 'translated portal ready');
    await click('.home-diary-card');
    assert.equal(await evaluate("[...document.querySelector('.diary-entrance h1').children].map(node=>node.textContent).join('|')"), copy);
    await poll(() => evaluate("location.pathname==='/app/diario.html' && !!window.__firstEntranceCopy"), 'first destination frame');
    assert.equal(await evaluate('window.__firstEntranceCopy'), copy, 'Navigation never briefly switches the cinematic title back to Portuguese');
    await click('.diary-entrance__skip');
    await poll(() => evaluate("document.documentElement.dataset.diaryReady==='true'"), 'destination ready after skip');
  }
}));

test('production diary: an early portal click waits for cold entrance styles in both portals', options, () => withBrowser(async ({ server, accounts, holdAsset, send, click, evaluate }) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  accounts.get('A').set('cold-entry', entry('cold-entry', 'Minha lembrança.'));
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const [source, selector, target] of [
    ['/app/home.html', '.a-nav__item[href="./diario.html"]', '/app/diario.html'],
    ['/aluno-painel.html?preview=1', '.home-diary-card', '/aluno-diario.html'],
  ]) {
    const styles = holdAsset('/app/diary-entrance.css');
    await send('Page.navigate', { url: origin + source });
    await poll(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && document.documentElement.dataset.diaryEntranceBound==='true' && !document.getElementById('diaryEntranceStyles').sheet`), 'cold portal entry available');
    await poll(() => styles.request, 'stylesheet delayed');
    await click(selector);
    assert.equal(await evaluate('location.pathname'), source.split('?')[0], 'A cold first click waits instead of silently losing the passage');
    styles.release();
    await poll(() => evaluate("!!document.querySelector('.diary-entrance--departure')"), 'same cinematic departure after styles arrive');
    await poll(() => evaluate(`location.pathname===${JSON.stringify(target)} && !!document.querySelector('.diary-entrance--arrival')`), 'cold visit arrival');
    await poll(() => evaluate("!document.querySelector('.diary-entrance') && !document.getElementById('journalText').disabled"), 'cold visit revealed');
    assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'false');
  }
}));

test('production diary: the destination recovers the complete passage when a cold portal cannot start it', options, () => withBrowser(async ({ server, accounts, holdAsset, send, click, evaluate }) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  accounts.get('A').set('fallback-entry', entry('fallback-entry', 'Minha lembrança.'));
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const asset of ['/app/diary-entrance.js', '/app/diary-entrance.css']) {
    const delayed = holdAsset(asset);
    await send('Page.navigate', { url: origin + '/app/home.html' });
    await poll(() => evaluate("!!document.querySelector('.home-diary-card')"), 'portal card available');
    await poll(() => delayed.request, 'cold asset delayed');
    await click('.home-diary-card');
    await poll(() => evaluate("location.pathname==='/app/diario.html'"), 'destination reached despite cold assets');
    delayed.release();
    await poll(() => evaluate("!!document.querySelector('.diary-entrance--standalone')"), 'complete passage recovered at destination');
    assert.equal(await evaluate('document.referrer'), '', 'The passage works with the production no-referrer policy');
    const scene = await evaluate("(()=>{const root=document.querySelector('.diary-entrance'),animation=root.querySelector('.diary-entrance__scene').getAnimations().find(item=>item.animationName==='diary-entry-scene');return {particles:root.querySelectorAll('.diary-entrance__dust i').length,duration:animation?.effect.getTiming().duration,cover:!!root.querySelector('.diary-entrance__cover svg'),textured:getComputedStyle(root.querySelector('.diary-entrance__cover')).backgroundImage.startsWith('url(\"data:image/webp;base64,')}})()");
    assert.deepEqual(scene, { particles: 26, duration: 2250, cover: true, textured: true });
    await click('.diary-entrance__skip');
    assert.equal(await evaluate("!!document.querySelector('.diary-entrance') || document.documentElement.classList.contains('diary-entrance-pending')"), false);
    await poll(() => evaluate("!document.getElementById('journalText').disabled"), 'recovered diary usable');
    assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'false');
    await send('Page.reload', { ignoreCache: true });
    await poll(() => evaluate("!!document.getElementById('journalText') && !document.getElementById('journalText').disabled"), 'reloaded fallback diary');
    assert.equal(await evaluate("!!document.querySelector('.diary-entrance') || document.documentElement.classList.contains('diary-entrance-pending')"), false, 'Recovery never replays on refresh');
  }
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "for(const method of ['getItem','setItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(key==='ep.diary.entrance')throw new DOMException('Storage blocked','SecurityError');return original.call(this,key,...args)}}" });
  await send('Page.navigate', { url: origin + '/app/home.html' });
  await poll(() => evaluate("!!document.querySelector('.home-diary-card') && !!document.getElementById('diaryEntranceStyles')?.sheet"), 'storage-restricted portal ready');
  await click('.home-diary-card');
  await poll(() => evaluate("location.pathname==='/app/diario.html' && !!document.querySelector('.diary-entrance--standalone')"), 'full arrival without storage or referrer');
  await click('.diary-entrance__skip');
  await send('Page.navigate', { url: origin + '/aluno-diario.html' });
  await poll(() => evaluate("!!document.querySelector('.diary-entrance--standalone')"), 'a direct first entry also gets the complete passage');
  await click('.diary-entrance__skip');
  await poll(() => evaluate("!document.getElementById('journalText').disabled"), 'direct entry usable');
  assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'false');
}));

test('production diary: all collections retain the book background, geometry and readable controls in both portals and themes', { ...options, timeout: 90000 }, () => withBrowser(async ({ server, accounts, send, click, fill, evaluate }) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  accounts.get('A').set('collection-memory', entry('collection-memory', 'Uma lembrança para reencontrar.', { feelings: ['alegria', 'serenidade'], tags: ['parque'] }));
  accounts.get('A').set('collection-dream', entry('collection-dream', 'Um sonho entre estrelas.', { kind: 'dream' }));
  accounts.get('A').set('collection-capsule', entry('collection-capsule', '', { kind: 'capsule', locked: true, unlockDate: '2099-10-20' }));
  const composition = `(()=>{
    const bounds=node=>{const box=node.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width}};
    const paper=document.getElementById('paper'),style=getComputedStyle(paper);
    return {background:getComputedStyle(document.body).backgroundImage,attachment:getComputedStyle(document.body).backgroundAttachment,paper:style.backgroundImage,paperColor:style.backgroundColor,header:bounds(document.querySelector('.diary-header')),frame:bounds(document.getElementById('bookFrame')),tools:bounds(document.querySelector('.diary-tools')),panels:bounds(document.querySelector('.diary-panels'))};
  })()`;
  for (const path of ['/app/diario.html', '/aluno-diario.html']) {
    await send('Page.navigate', { url: origin + path });
    await poll(() => evaluate(`location.pathname===${JSON.stringify(path)} && document.documentElement.dataset.diaryReady==='true' && !document.querySelector('.diary-entrance')`), 'real collection account ready');
    for (const theme of ['day', 'night']) {
      if (await evaluate('document.documentElement.dataset.diaryTheme') !== theme) await click('#diaryThemeToggle');
      for (const width of [1440, 1024, 768, 390, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width < 700 });
        await click('[data-tab="diary"]');
        await poll(() => evaluate("!document.getElementById('editorView').hidden"), 'writing composition');
        await evaluate('document.fonts.ready');
        const baseline = await evaluate(composition);
        for (const name of ['timeline', 'dreams', 'feelings', 'capsules']) {
          await click(`[data-tab="${name}"]`);
          await poll(() => evaluate(`!document.getElementById('collectionView').hidden && document.getElementById('collectionView').dataset.collection===${JSON.stringify(name)}`), 'collection visible');
          const actual = await evaluate(composition);
          assert.equal(actual.background, baseline.background, `${path} ${theme} ${name} ${width}: the room background never changes`);
          assert.ok(actual.attachment.split(',').every(value => value.trim() === 'fixed'), 'Every layer of the room lighting stays anchored while longer collections scroll');
          assert.equal(actual.paper, baseline.paper, 'The collection retains the exact writing paper artwork');
          assert.equal(actual.paperColor, baseline.paperColor);
          for (const part of ['header', 'frame', 'tools', 'panels']) for (const metric of ['x', 'width']) {
            assert.ok(Math.abs(actual[part][metric] - baseline[part][metric]) < 1, `${name} ${width}: ${part} ${metric} remains in place`);
          }
          assert.ok(Math.abs(actual.frame.y - baseline.frame.y) < 1, 'The collection does not jump up or down when replacing the book toolbar');
          const reading = await evaluate("(()=>{const view=document.getElementById('collectionView'),paper=document.getElementById('paper').getBoundingClientRect(),last=view.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,title:parseFloat(getComputedStyle(view.querySelector('h1')).fontSize),intro:parseFloat(getComputedStyle(view.querySelector('.collection-intro')).fontSize),clipped:last.bottom>paper.bottom+1,cards:[...view.querySelectorAll('.entry-card,.collection-heading,.collection-toolbar,.feelings-view')].filter(node=>node.scrollWidth>node.clientWidth+2).map(node=>node.className)}})()");
          assert.equal(reading.overflow, false); assert.equal(reading.clipped, false); assert.deepEqual(reading.cards, []);
          assert.ok(reading.title >= 32 && reading.intro >= 15, 'Titles and supporting text retain a readable size');
          if (process.env.DIARY_COLLECTION_REVIEW === '1' && path.startsWith('/app/') && [1440, 390].includes(width)) {
            await poll(() => evaluate("getComputedStyle(document.getElementById('collectionView')).opacity==='1'"), 'collection dissolve settled');
            const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            await writeFile(join(tmpdir(), `ep-collection-${theme}-${name}-${width}.png`), Buffer.from(shot.data, 'base64'));
          }
        }
      }
    }
    await click('[data-tab="timeline"]'); await fill('#memorySearch', 'Nada corresponde a esta busca');
    await poll(() => evaluate("!!document.querySelector('[data-clear-search]')"), 'useful empty search');
    await click('[data-clear-search]');
    assert.equal(await evaluate("document.getElementById('memorySearch').value"), '');
    await click('#collectionBack');
    await poll(() => evaluate("!document.getElementById('editorView').hidden"), 'return from collection');
    assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'false');
    await click('[data-tab="timeline"]'); await click('[data-open="collection-memory"]');
    await poll(() => evaluate("!document.getElementById('editorView').hidden"), 'selected memory');
    assert.equal(await evaluate("document.getElementById('bookCover').getAttribute('aria-expanded')"), 'true', 'Opening a memory from a closed diary reveals the selected page immediately');
    assert.equal(await evaluate("document.getElementById('journalText').value"), 'Uma lembrança para reencontrar.');
  }
}));

test('production diary: a long timeline stays within the book height and scrolls internally without covering the return link', { ...options, timeout: 45000 }, () => withBrowser(async ({ server, accounts, send, click, evaluate }) => {
  for (let index = 0; index < 36; index++) accounts.get('A').set(`long-timeline-${index}`, entry(`long-timeline-${index}`, `Uma lembrança guardada na página ${index + 1}.`));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/app/diario.html', '/aluno-diario.html']) {
    await send('Page.navigate', { url: origin + path });
    await poll(() => evaluate("document.documentElement.dataset.diaryReady==='true' && !document.querySelector('.diary-entrance')"), 'long diary ready');
    for (const width of [1440, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width < 700 });
      const shortTab = await evaluate(`(()=>{
        const frame=document.getElementById('bookFrame');
        return frame.getBoundingClientRect().height;
      })()`);
      await click('[data-tab="timeline"]');
      await poll(() => evaluate("!document.getElementById('collectionView').hidden && document.querySelectorAll('.entry-card').length===36"), 'all timeline records visible');
      await evaluate('window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const before = await evaluate(`(()=>{
        const frame=document.getElementById('bookFrame'),box=frame.getBoundingClientRect();
        const view=document.getElementById('collectionView');
        const button=document.getElementById('collectionBack'),label=button.querySelector('span').getBoundingClientRect();
        const bindingTop=box.top+parseFloat(getComputedStyle(frame,'::before').top);
        const stitchingTop=box.top+parseFloat(getComputedStyle(frame,'::after').top);
        const hit=document.elementFromPoint(label.x+label.width/2,label.y+label.height/2);
        return {height:box.height,scrollHeight:view.scrollHeight,clientHeight:view.clientHeight,scrollTop:view.scrollTop,bottom:label.bottom,bindingTop,stitchingTop,clickable:hit===button||button.contains(hit)};
      })()`);
      assert.ok(before.scrollHeight > before.clientHeight + 200, 'A 36-entry timeline exercises genuine internal scrolling, not the empty or short case');
      assert.ok(Math.abs(before.height - shortTab) < 4, `${path} ${width}: a long timeline keeps the same book height as a short one instead of growing the frame`);
      assert.equal(before.scrollTop, 0, 'Opening a collection starts scrolled to the top');
      assert.ok(before.bindingTop > before.bottom + 4, `${path} ${width}: leather stays below the complete return label`);
      assert.ok(before.stitchingTop > before.bottom + 4, 'Stitching cannot cross the label either');
      assert.equal(before.clickable, true, 'The visible return text also receives pointer input');
      const after = await evaluate(`(()=>{
        const view=document.getElementById('collectionView');
        view.scrollTop=view.scrollHeight;
        const frame=document.getElementById('bookFrame'),box=frame.getBoundingClientRect();
        const button=document.getElementById('collectionBack'),label=button.querySelector('span').getBoundingClientRect();
        const bindingTop=box.top+parseFloat(getComputedStyle(frame,'::before').top);
        const hit=document.elementFromPoint(label.x+label.width/2,label.y+label.height/2);
        return {scrollTop:view.scrollTop,bottom:label.bottom,bindingTop,clickable:hit===button||button.contains(hit)};
      })()`);
      assert.ok(after.scrollTop > 0, 'The timeline actually scrolled down inside the frame');
      assert.ok(after.bindingTop > after.bottom + 4, `${path} ${width}: leather still stays below the return label after scrolling to the bottom`);
      assert.equal(after.clickable, true, 'The return button stays clickable after scrolling the collection');
      await click('#collectionBack');
      await poll(() => evaluate("!document.getElementById('editorView').hidden"), 'return from long timeline');
    }
  }
}));

test('production diary: the cover starts with the account name and preserves an editable custom title across reloads and accounts', options, () => withBrowser(async ({ accounts, covers, requests, navigate, click, fill, evaluate, send }) => {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__diaryNames={A:'Luis Henrique',B:'Marina Oliveira'}" });
  accounts.get('A').set('named-page', entry('named-page', 'Minha escrita.'));
  accounts.get('B').set('other-page', entry('other-page', 'Outra escrita.'));
  await navigate();
  assert.equal(await evaluate("document.getElementById('coverTitle').textContent"), 'Luis Henrique');
  assert.equal(await evaluate("document.getElementById('coverTitle').hasAttribute('data-i18n')"), false);
  await click('#coverTitleButton');
  assert.equal(await evaluate("document.getElementById('coverTitleInput').value"), 'Luis Henrique');
  await click('#coverTitleButton');
  assert.equal(requests.some(record => record.method === 'PUT' && record.path.endsWith('/ajustes/capa')), false, 'Accepting the automatic name does not save a custom title');
  await click('#coverTitleButton'); await fill('#coverTitleInput', 'Meus dias de outono'); await click('#coverTitleButton');
  await poll(() => covers.get('A') === 'Meus dias de outono', 'custom cover saved to the account');
  await navigate();
  assert.equal(await evaluate("document.getElementById('coverTitle').textContent"), 'Meus dias de outono');
  await evaluate("window.__diaryAuth('B')");
  await poll(() => evaluate("document.getElementById('coverTitle').textContent==='Marina Oliveira' && !document.getElementById('journalText').disabled"), 'second account name');
  await evaluate("window.__diaryAuth('A')");
  await poll(() => evaluate("document.getElementById('coverTitle').textContent==='Meus dias de outono' && !document.getElementById('journalText').disabled"), 'first account custom title');
  await click('#coverTitleButton'); await fill('#coverTitleInput', ''); await click('#coverTitleButton');
  await poll(() => covers.get('A') === '', 'clear custom cover');
  assert.equal(await evaluate("document.getElementById('coverTitle').textContent"), 'Luis Henrique');
  await navigate();
  assert.equal(await evaluate("document.getElementById('coverTitle').textContent"), 'Luis Henrique');
  assert.equal(await evaluate("document.getElementById('coverTitleButton').textContent"), 'Editar nome');
}));

test('production diary: cover titles never flash a placeholder on reload with slow scripts or missing local settings', { ...options, timeout: 45000 }, () => withBrowser(async ({ server, accounts, covers, holdAsset, hold, send, evaluate }) => {
  accounts.get('A').set('cover-entry', entry('cover-entry', 'Uma lembrança.'));
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__diaryNames={A:'Luis Henrique'};
    window.__coverFrames=[];
    const capture=()=>{
      const title=document.getElementById('coverTitle'),value=title?.textContent.trim();
      if(value && window.__coverFrames.at(-1)!==value)window.__coverFrames.push(value);
      requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  ` });
  const ready = () => poll(() => evaluate("document.documentElement.dataset.diaryReady==='true' && !document.querySelector('.diary-entrance')"), 'personal cover ready');
  for (const path of ['/app/diario.html', '/aluno-diario.html']) {
    covers.set('A', 'Meu universo particular');
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${path}` });
    await ready();
    const module = holdAsset('/app/diary.js');
    const cachedCover = hold('GET', 'A', record => record.path.endsWith('/ajustes/capa'));
    await send('Page.reload', { ignoreCache: true });
    await poll(() => module.request && evaluate("!!document.getElementById('coverTitle')"), 'static cover while the module is delayed');
    assert.equal(await evaluate("document.getElementById('coverTitle').textContent"), '', 'A slow script never exposes the old default phrase');
    module.release();
    await poll(() => cachedCover.request && evaluate("document.getElementById('coverTitle').textContent==='Meu universo particular'"), 'verified account restores its cached choice before the API response');
    cachedCover.release(); await ready();
    assert.deepEqual(await evaluate('window.__coverFrames'), ['Meu universo particular'], `${path}: cached reload only paints the chosen title`);

    await evaluate("localStorage.removeItem('ep.diary.cover-title.A')");
    const coldCover = hold('GET', 'A', record => record.path.endsWith('/ajustes/capa'));
    await send('Page.reload', { ignoreCache: true });
    await poll(() => coldCover.request, 'saved choice delayed without a local cache');
    assert.equal(await evaluate("document.getElementById('coverTitle').textContent"), '', 'The account name does not temporarily replace an unresolved custom title');
    assert.equal(await evaluate("document.getElementById('coverTitle').getAttribute('aria-busy')"), 'true');
    coldCover.release(); await ready();
    await poll(() => evaluate('window.__coverFrames.length>0'), 'first personal title painted');
    assert.deepEqual(await evaluate('window.__coverFrames'), ['Meu universo particular']);

    covers.set('A', '');
    await evaluate("localStorage.removeItem('ep.diary.cover-title.A')");
    await send('Page.reload', { ignoreCache: true });
    await ready();
    await poll(() => evaluate('window.__coverFrames.length>0'), 'automatic account name painted');
    assert.deepEqual(await evaluate('window.__coverFrames'), ['Luis Henrique'], 'Without a custom title, the first inscription is the account name');
  }
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
  await click('#closeDialog');
  assert.equal(await evaluate("document.getElementById('diaryDialog').classList.contains('is-closing')"), true, 'Account switching also interrupts an animated dismissal');
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

test('production diary: account switch cancels the release ritual and wipes its canvas before loading another account', options, () => withBrowser(async ({ accounts, hold, navigate, click, fill, evaluate, requests }) => {
  accounts.get('B').set('b-after-release', entry('b-after-release', 'A página da outra conta.'));
  await navigate();
  await click('#releaseButton');
  const secret = 'ACCOUNT_A_RELEASE_PRIVATE_80731';
  await fill('#releaseText', secret);
  await click('#releaseForm button[type="submit"]');
  assert.equal(await evaluate("!!document.querySelector('.release-ritual[open]')"), true);
  const nextLoad = hold('GET', 'B');
  const cleared = await evaluate(`(() => {
    const canvas = document.querySelector('.release-ritual__canvas');
    window.__diaryAuth('B');
    return {
      ritual: !!document.querySelector('.release-ritual'),
      releasing: document.body.classList.contains('is-releasing'),
      pixels: canvas.width > 0 && canvas.height > 0 && canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value > 0),
      privateText: document.documentElement.outerHTML.includes(${JSON.stringify(secret)}),
    };
  })()`);
  assert.deepEqual(cleared, { ritual: false, releasing: false, pixels: false, privateText: false }, 'The old account leaves no message, animation or bitmap during the next load');
  assert.equal(JSON.stringify(requests).includes(secret), false, 'Released words are never sent to the production API');
  await poll(() => nextLoad.request, 'next account loading'); nextLoad.release();
  await poll(() => evaluate("document.getElementById('journalText').value==='A página da outra conta.'"), 'next account ready');
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

test('production diary: turning sheets retain the resting paper colors in both themes and portals', { ...options, timeout: 60000 }, () => withBrowser(async ({ server, accounts, click, evaluate, send }) => {
  accounts.get('A').set('color-next', entry('color-next', '', { createdAt: 2 }));
  accounts.get('A').set('color-first', entry('color-first', '', { createdAt: 1 }));
  const capturePaper = async (clip) => {
    await evaluate("document.getElementById('paper').scrollIntoView({block:'center'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    clip ||= await evaluate("(()=>{const p=document.getElementById('paper');p.scrollIntoView({block:'center'});const b=p.getBoundingClientRect();return {x:Math.round(b.left+scrollX+b.width*.025),y:Math.round(b.top+scrollY+b.height*.43),width:Math.floor(b.width*.92),height:Math.floor(b.height*.1),scale:1}})()");
    return { data: (await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip })).data, clip };
  };
  const assertSamePaper = async (before, label) => {
    const during = await capturePaper(before.clip);
    assert.equal(await evaluate("document.getElementById('pageTurnEffect').childElementCount"), 1, `${label}: the comparison captures the sheet before it is removed`);
    const difference = await evaluate(`(async()=>{
      const pixels=async data=>{const image=await createImageBitmap(await (await fetch('data:image/png;base64,'+data)).blob());const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data};
      const [a,b]=await Promise.all([pixels(${JSON.stringify(before.data)}),pixels(${JSON.stringify(during.data)})]);
      // Compositing the 3D leaf can round a few texture channels differently.
      let changed=0,maximum=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);if(delta>3)changed++;maximum=Math.max(maximum,delta)}
      return {sameSize:a.length===b.length,changed,maximum,samples:a.length};
    })()`);
    assert.equal(difference.sameSize, true, label);
    if (difference.changed > difference.samples * .001) {
      await writeFile(join(tmpdir(), 'ep-diary-color-before.png'), Buffer.from(before.data, 'base64'));
      await writeFile(join(tmpdir(), 'ep-diary-color-during.png'), Buffer.from(during.data, 'base64'));
      console.log(label, before.clip, await evaluate("['paper','pageTurnEffect','pageTurnUnderlay'].map(id=>{const el=document.getElementById(id),s=getComputedStyle(el),b=el.getBoundingClientRect();return {id,x:b.x,y:b.y,w:b.width,h:b.height,background:s.background,content:el.childElementCount,animation:s.animation,shadow:getComputedStyle(el,'::before').boxShadow}})"));
    }
    assert.ok(difference.changed <= difference.samples * .001, `${label}: ${JSON.stringify(difference)}`);
  };
  const pauseTurn = async () => {
    await poll(() => evaluate("document.getElementById('paper').classList.contains('is-turning-entry')"), 'color comparison turn');
    await evaluate("for(const animation of document.getElementById('pageTurnEffect').getAnimations()){animation.pause();animation.currentTime=0}");
  };
  for (const [path, width] of [['/app/diario.html', 1440], ['/aluno-diario.html', 390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${path}` });
    await poll(() => evaluate(`location.pathname===${JSON.stringify(path)} && typeof window.__diaryAuth==='function' && !document.getElementById('journalText').disabled && !document.querySelector('.diary-entrance') && !document.documentElement.classList.contains('diary-entrance-pending')`), 'paper color fixture');
    await click('#bookCover');
    await evaluate("document.getElementById('bookCover').style.transition='none';document.fonts.ready");
    for (const theme of ['day', 'night']) {
      await evaluate(`document.documentElement.dataset.diaryTheme=${JSON.stringify(theme)}`);
      const beforeBack = await capturePaper();
      await click('#previousWritingPage'); await pauseTurn();
      await assertSamePaper(beforeBack, `${path} ${theme}: the flat outgoing underlay`);
      await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'back turn finished');
      const beforeForward = await capturePaper();
      await click('#nextWritingPage'); await pauseTurn();
      await assertSamePaper(beforeForward, `${path} ${theme}: the moving outgoing sheet`);
      await poll(() => evaluate("!document.getElementById('newPageButton').disabled"), 'forward turn finished');
    }
  }
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
  await click('#soundButton');
  await poll(() => evaluate("document.getElementById('diaryDialog').open && !!document.getElementById('stopSound')"), 'replacement soundtrack modal');
  const title = await evaluate("document.getElementById('dialogTitle').textContent");
  capsule.release();
  await poll(() => accounts.get('A').has(capsule.request.body.id), 'capsule persisted');
  await poll(() => evaluate("document.getElementById('diaryToast').textContent.includes('Sua cápsula está guardada')"), 'capsule response processed');
  assert.equal(await evaluate("document.getElementById('diaryDialog').open"), true);
  assert.equal(await evaluate("document.getElementById('dialogTitle').textContent"), title);
  assert.equal(await evaluate("!!document.getElementById('stopSound')"), true, 'Late completion leaves the newer dialog intact');
  assert.equal(await evaluate("document.getElementById('capsuleText')"), null, 'Sealed message is removed from the DOM');
}));

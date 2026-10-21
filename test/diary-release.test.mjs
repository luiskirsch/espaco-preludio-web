import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chrome = [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(file => file && existsSync(file));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ogg': 'audio/ogg' };
const wait = ms => new Promise(done => setTimeout(done, ms));

async function poll(read, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await read(); if (value) return value; } catch (error) { lastError = error; }
    await wait(50);
  }
  throw new Error(`Diário / deixar ir: timeout em ${description}${lastError ? ` (${lastError.message})` : ''}`);
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const file = resolve(root, decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, ''));
      if (!file.startsWith(root + sep)) throw new Error('Invalid local path');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return server;
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map(), exceptions = [], requests = [], blocked = [];
  const send = (method, params = {}) => new Promise((done, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { done, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request);
    if (message.method === 'Fetch.requestPaused') {
      blocked.push(message.params.request.url);
      send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    }
    const operation = pending.get(message.id);
    if (!operation) return;
    pending.delete(message.id); clearTimeout(operation.timeout);
    if (message.error) operation.reject(new Error(message.error.message)); else operation.done(message.result);
  };
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: ['*firebase*', '*firestore*', '*identitytoolkit*', '*securetoken*', '*/therapy/*'].map(urlPattern => ({ urlPattern, requestStage: 'Request' })) });
  // Observe writes before application code runs, including transient writes that
  // could disappear before a final storage inspection.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__releaseStorageWrites = [];
    const record = value => { try { window.__releaseStorageWrites.push(JSON.stringify(value)); } catch {} };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { record([key, value]); return setItem.call(this, key, value); };
    for (const method of ['add', 'put']) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function(...args) { record(args); return original.apply(this, args); };
    }
  })();` });
  return { socket, send, evaluate, exceptions, requests, blocked };
}

test('deixar ir: palavras privadas viram estrelas, com retorno acessível e sem transbordamento', {
  timeout: 90000, skip: !chrome && 'Chrome/Edge indisponível'
}, async t => {
  const server = await startServer();
  const profile = await mkdtemp(join(tmpdir(), 'ep-diary-release-'));
  const capturePath = process.env.DIARY_RELEASE_CAPTURE === '1' ? await mkdtemp(join(tmpdir(), 'ep-diary-release-captures-')) : null;
  if (capturePath) t.diagnostic(`Capturas do ritual: ${capturePath}`);
  const browser = spawn(chrome, ['--headless=new', '--mute-audio', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let cdp;
  try {
    const port = await poll(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'porta do navegador');
    const page = await poll(async () => (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())).find(item => item.type === 'page'), 'aba do navegador');
    cdp = await connect(page.webSocketDebuggerUrl);
    const { send, evaluate } = cdp;
    const capture = async name => {
      const screenshot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
      if (capturePath) await writeFile(join(capturePath, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
      return screenshot;
    };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const viewport = async (width, height, reduced = false) => {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
      await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
    };
    const checkPrivate = async marker => {
      const state = await evaluate(`(() => {
        const marker = ${JSON.stringify(marker)};
        return { dom: document.documentElement.outerHTML.includes(marker),
          fields: [...document.querySelectorAll('textarea,input')].some(node => node.value.includes(marker)),
          storage: [JSON.stringify(localStorage),JSON.stringify(sessionStorage),...window.__releaseStorageWrites].some(value => value.includes(marker)) };
      })()`);
      assert.deepEqual(state, { dom: false, fields: false, storage: false }, 'Nenhuma palavra fica no DOM, em controles ou em armazenamento');
      assert.equal(JSON.stringify(cdp.requests).includes(marker), false, 'Nenhuma requisição contém o desabafo');
    };
    const begin = async (marker, message = marker) => {
      await click('#releaseButton');
      await poll(() => evaluate("document.getElementById('diaryDialog').open && !!document.getElementById('releaseText')"), 'campo privado');
      await evaluate(`(() => { const field = document.getElementById('releaseText'); field.value = ${JSON.stringify(message)}; field.dispatchEvent(new Event('input', { bubbles:true })); })()`);
      await click('#releaseForm button[type="submit"]');
      await poll(() => evaluate("!!document.querySelector('dialog.release-ritual[open]')"), 'universo em tela cheia');
      assert.equal(await evaluate("document.getElementById('diaryDialog').open"), false, 'O formulário dá lugar ao universo');
      await checkPrivate(marker);
    };
    const checkRitualLayout = async () => {
      const layout = await evaluate(`(() => {
        const dialog = document.querySelector('dialog.release-ritual');
        const box = dialog.getBoundingClientRect(), style=getComputedStyle(dialog);
        return { width:innerWidth, height:innerHeight, left:box.left, top:box.top, right:box.right, bottom:box.bottom,
          contentWidth:dialog.scrollWidth, contentHeight:dialog.scrollHeight, clientWidth:dialog.clientWidth, clientHeight:dialog.clientHeight, overflowX:style.overflowX, overflowY:style.overflowY, rootOverflow:getComputedStyle(document.documentElement).overflow, rootWidth:document.documentElement.clientWidth, bodyWidth:document.body.clientWidth,
          controls:[...dialog.querySelectorAll('button')].filter(node=>!node.hidden && node.getClientRects().length).map(node=>{ const box=node.getBoundingClientRect();return {label:node.textContent.trim()||node.getAttribute('aria-label'),left:box.left,top:box.top,right:box.right,bottom:box.bottom}; }) };
      })()`);
      assert.ok(Math.abs(layout.left) <= 1 && Math.abs(layout.top) <= 1 && Math.abs(layout.right-layout.width) <= 1 && Math.abs(layout.bottom-layout.height) <= 1, `Universo ocupa toda a tela: ${JSON.stringify(layout)}`);
      // The decorative halo may extend beyond the viewport; its clipped light
      // must not create a scrolling surface for the person using the ritual.
      assert.ok((layout.contentWidth <= layout.clientWidth + 1 || ['hidden','clip'].includes(layout.overflowX)) && (layout.contentHeight <= layout.clientHeight + 1 || ['hidden','clip'].includes(layout.overflowY)), `Universo não cria rolagem: ${JSON.stringify(layout)}`);
      for (const control of layout.controls) assert.ok(control.left >= 0 && control.top >= 0 && control.right <= layout.width && control.bottom <= layout.height, `Controle acessível dentro da tela: ${JSON.stringify(control)}`);
    };
    const checkReturned = async () => {
      await poll(() => evaluate("!document.querySelector('.release-ritual')"), 'retorno ao diário');
      assert.equal(await evaluate("document.documentElement.classList.contains('diary-modal-open')"), false, 'O retorno remove o bloqueio de rolagem do diálogo');
      assert.equal(await evaluate("document.activeElement?.id"), 'releaseButton', 'O foco retorna ao botão que abriu a experiência');
      const width = await evaluate('({viewport:innerWidth,content:document.documentElement.scrollWidth})');
      assert.ok(width.content <= width.viewport, 'O diário retorna sem transbordamento horizontal');
    };

    await viewport(1440, 1000);
    await send('Page.navigate', { url:`http://127.0.0.1:${server.address().port}/app/diario.html?preview=1` });
    await poll(() => evaluate("document.documentElement.dataset.diaryReady === 'true' && !document.getElementById('journalText').disabled && !document.querySelector('.diary-entrance') && !document.documentElement.classList.contains('diary-entrance-pending')"), 'prévia pronta');
    await click('#bookCover');
    await click('[data-tab="timeline"]');
    await poll(() => evaluate("!document.getElementById('collectionView').hidden && !!document.querySelector('.entry-card')"), 'memórias iniciais');
    const entryCount = await evaluate("document.querySelectorAll('.entry-card').length");

    await t.test('o card abre e fecha suavemente, sem saltar ao interromper a abertura', async () => {
      await evaluate("document.getElementById('releaseButton').focus()");
      await click('#releaseButton');
      const opening = await evaluate(`(() => {
        const dialog=document.getElementById('diaryDialog');
        const animation=dialog.getAnimations().find(item=>item.animationName==='releaseCardEnter');
        animation.pause(); animation.currentTime=35;
        const before=Number(getComputedStyle(dialog).opacity);
        document.getElementById('closeDialog').click();
        return {before,after:Number(getComputedStyle(dialog).opacity),open:dialog.open,inert:dialog.inert};
      })()`);
      assert.ok(opening.before>0 && opening.before<1, 'A abertura possui estados visuais intermediários');
      assert.ok(Math.abs(opening.after-opening.before)<.03, 'Fechar durante a entrada continua da opacidade atual');
      assert.equal(opening.open,true,'O card permanece visível durante a saída');
      assert.equal(opening.inert,true,'A saída bloqueia novos envios');
      await poll(()=>evaluate("!document.getElementById('diaryDialog').open"),'saída concluída',2000);
      assert.equal(await evaluate("document.activeElement?.id"),'releaseButton');
      assert.equal(await evaluate("document.getElementById('dialogBody').childElementCount"),0);

      await click('#releaseButton'); await click('#closeDialog');
      await click('#releaseButton');
      await wait(420);
      assert.equal(await evaluate("document.getElementById('diaryDialog').open"),true,'Um fechamento anterior não encerra o card reaberto');
      await click('#closeDialog');
      await poll(()=>evaluate("!document.getElementById('diaryDialog').open"),'fechamento após reabrir',2000);

      await viewport(1440,1000,true);
      await click('#releaseButton');
      assert.equal(await evaluate("document.getElementById('diaryDialog').getAnimations().length"),0,'Movimento reduzido dispensa a animação do card');
      await click('#closeDialog');
      assert.equal(await evaluate("document.getElementById('diaryDialog').open"),false,'Movimento reduzido também fecha sem espera');
      await viewport(1440,1000);
    });

    await t.test('o ritual anima de verdade e não guarda nem transmite as palavras', async () => {
      const marker = 'RELEASE_PRIVATE_863742';
      const message = `${marker}: Hoje deixo ir o peso de tentar controlar tudo.\n${'Que estas palavras encontrem seu lugar no céu. ✨ '.repeat(18)}`;
      await evaluate(`(() => {
        window.__releasePhases = [];
        window.__releaseObserver = new MutationObserver(() => { const phase=document.querySelector('.release-ritual')?.dataset.phase; if(phase && window.__releasePhases.at(-1)!==phase) window.__releasePhases.push(phase); });
        window.__releaseObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-phase']});
      })()`);
      await begin(marker, message);
      if (capturePath) { await wait(350); await capture('01-gather'); }
      assert.equal(await evaluate("document.querySelector('.release-ritual__canvas').getAttribute('aria-hidden')"), 'true', 'O canvas é decorativo; os textos e controles continuam acessíveis');
      await poll(() => evaluate("document.querySelector('.release-ritual')?.dataset.phase === 'dissolve'"), 'palavras se desfazendo');
      if (capturePath) await wait(400);
      const image = await capture('02-dissolve');
      assert.ok(await evaluate("(() => { const canvas=document.querySelector('.release-ritual__canvas'),context=canvas.getContext('2d'),pixels=context.getImageData(0,0,canvas.width,canvas.height).data;return pixels.some((value,index)=>index%4===3 && value>0); })()"), 'A transformação desenha luz no canvas');
      await poll(() => evaluate("document.querySelector('.release-ritual')?.dataset.phase === 'voyage'"), 'estrelas viajando');
      if (capturePath) await wait(400);
      const nextImage = await capture('03-voyage');
      assert.notEqual(image.data, nextImage.data, 'O universo muda visualmente durante a transformação');
      await poll(() => evaluate("document.querySelector('.release-ritual')?.dataset.phase === 'settled'"), 'desfecho do ritual');
      if (capturePath) { await wait(1500); await capture('04-settled'); }
      const phases = await evaluate('window.__releaseObserver.disconnect(); window.__releasePhases');
      for (const phase of ['gather','dissolve','voyage','settled']) assert.ok(phases.includes(phase), `A transformação passa por ${phase}: ${phases.join(', ')}`);
      assert.equal(await evaluate("document.querySelector('.release-ritual').textContent.includes('Há espaço para respirar.')"), true);
      await checkPrivate(marker); await checkRitualLayout();
      await click('.release-ritual__return'); await checkReturned();
      await click('[data-tab="diary"]'); await click('[data-tab="timeline"]');
      assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), entryCount, 'O desabafo não gera entrada no diário');
      await evaluate(`(() => { const search=document.getElementById('memorySearch');search.value=${JSON.stringify(marker)};search.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), 0, 'As palavras não reaparecem na busca');
      await evaluate("document.getElementById('memorySearch').value='';document.getElementById('memorySearch').dispatchEvent(new Event('input',{bubbles:true}))");
    });

    await t.test('movimento reduzido e telas pequenas preservam todos os controles sem rolagem', async () => {
      for (const [width,height] of [[390,844],[320,568],[844,390]]) {
        await viewport(width,height,true);
        const marker = `RELEASE_SMALL_${width}_${height}`;
        await begin(marker); await checkRitualLayout();
        await poll(() => evaluate("document.querySelector('.release-ritual')?.dataset.phase === 'settled'"), 'desfecho com movimento reduzido', 5000);
        await checkRitualLayout(); await checkPrivate(marker);
        await click('.release-ritual__return'); await checkReturned();
      }
    });

    await t.test('o céu noturno também recebe as palavras na animação completa do celular', async () => {
      await viewport(390,844);
      if (await evaluate("document.documentElement.dataset.diaryTheme !== 'night'")) await click('#diaryThemeToggle');
      const marker = 'RELEASE_MOBILE_NIGHT_863742';
      await begin(marker, `${marker}: Hoje eu permito que as preocupações descansem.\n${'Posso recomeçar com mais leveza. '.repeat(5)}`);
      await checkRitualLayout();
      await poll(() => evaluate("document.querySelector('.release-ritual')?.dataset.phase === 'voyage'"), 'viagem de estrelas no celular');
      if (capturePath) await capture('05-mobile-night-voyage');
      await poll(() => evaluate("document.querySelector('.release-ritual')?.dataset.phase === 'settled'"), 'desfecho noturno no celular');
      if (capturePath) { await wait(1500); await capture('06-mobile-night-settled'); }
      await checkPrivate(marker); await checkRitualLayout();
      await click('.release-ritual__return'); await checkReturned();
      await click('#diaryThemeToggle');
    });

    await t.test('Escape, fechar e pular preservam uma saída imediata', async () => {
      await viewport(1440,1000);
      await begin('RELEASE_ESCAPE_863742');
      await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
      await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
      await checkReturned(); await checkPrivate('RELEASE_ESCAPE_863742');
      await begin('RELEASE_CLOSE_863742');
      await click('.release-ritual__close'); await checkReturned(); await checkPrivate('RELEASE_CLOSE_863742');
      await begin('RELEASE_SKIP_863742');
      await click('.release-ritual__skip');
      await poll(() => evaluate("document.querySelector('.release-ritual')?.dataset.phase === 'settled'"), 'pular até o desfecho', 2000);
      await checkPrivate('RELEASE_SKIP_863742');
      await click('.release-ritual__return'); await checkReturned();
    });

    await t.test('sair da página limpa o ritual em andamento', async () => {
      await begin('RELEASE_PAGEHIDE_863742');
      await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))");
      await poll(() => evaluate("!document.querySelector('.release-ritual')"), 'limpeza ao sair');
      assert.equal(await evaluate("document.documentElement.classList.contains('diary-modal-open')"), false);
      await checkPrivate('RELEASE_PAGEHIDE_863742');
    });

    assert.deepEqual(cdp.exceptions, [], 'A experiência não gera erros no navegador');
    assert.deepEqual(cdp.blocked, [], 'A prévia e o desabafo não consultam Firebase nem backend');
  } finally {
    cdp?.socket.close(); browser.kill(); server.closeAllConnections();
    await new Promise(done => server.close(done)); await wait(350);
    const target = resolve(profile);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('ep-diary-release-')) throw new Error('Unsafe browser cleanup');
    await rm(target, { recursive:true, force:true, maxRetries:10, retryDelay:150 });
  }
});

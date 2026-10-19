import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(path => path && existsSync(path));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const privateRequest = url => /firebase|firestore|identitytoolkit|securetoken|\/therapy\//i.test(url);
const capturePreview = process.env.DIARY_CAPTURE_PREVIEW === '1';

async function poll(fn, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const result = await fn(); if (result) return result; } catch (error) { lastError = error; }
    await new Promise(resolveWait => setTimeout(resolveWait, 60));
  }
  throw new Error(`Diário: timeout ao aguardar ${description}${lastError ? ` (${lastError.message})` : ''}`);
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root + sep)) throw new Error('Invalid local path');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return server;
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => { socket.onopen = resolveOpen; socket.onerror = rejectOpen; });
  let sequence = 0;
  const pending = new Map(), exceptions = [], privateRequests = [];
  const send = (method, params = {}) => new Promise((resolveMessage, rejectMessage) => {
    const id = ++sequence;
    pending.set(id, { resolveMessage, rejectMessage });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      privateRequests.push(message.params.request.url);
      send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    }
    if (!pending.has(message.id)) return;
    const operation = pending.get(message.id); pending.delete(message.id);
    if (message.error) operation.rejectMessage(new Error(message.error.message));
    else operation.resolveMessage(message.result);
  };
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Fetch.enable', { patterns: ['*firebase*', '*firestore*', '*identitytoolkit*', '*securetoken*', '*/therapy/*'].map(urlPattern => ({ urlPattern, requestStage: 'Request' })) });
  return { socket, send, evaluate, exceptions, privateRequests };
}

test('diário real: autosave, memórias, sonhos, cápsulas, desabafos e telas responsivas', {
  timeout: 90000, skip: !chrome && 'Chrome/Edge indisponível'
}, async () => {
  const server = await startServer();
  const profile = await mkdtemp(join(tmpdir(), 'ep-diary-browser-'));
  const browser = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  let cdp;
  const layouts = [];
  try {
    const debugPort = await poll(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'porta do navegador');
    const page = await poll(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json())).find(item => item.type === 'page'), 'aba do navegador');
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    const { send, evaluate } = cdp;
    const click = async selector => {
      assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), true, `Controle existe: ${selector}`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    };
    const fill = async (selector, value) => {
      await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.focus();element.value='';element.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await send('Input.insertText', { text: value });
    };
    const saved = () => poll(() => evaluate("document.getElementById('saveState').dataset.state==='saved'"), 'salvamento automático');
    const openDialog = async selector => { await click(selector); await poll(() => evaluate("document.getElementById('diaryDialog').open"), `diálogo ${selector}`); };
    const closeDialog = async () => { await click('#closeDialog'); assert.equal(await evaluate("document.getElementById('diaryDialog').open"), false); };
    const tab = async name => {
      await click(`[data-tab="${name}"]`);
      await poll(() => evaluate(`document.querySelector('[data-tab="${name}"]').classList.contains('is-active')`), `ambiente ${name}`);
    };
    const viewport = async width => {
      await send('Emulation.setDeviceMetricsOverride', { width, height: width >= 1000 ? 1000 : 900, deviceScaleFactor: 1, mobile: width < 700 });
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    };
    const checkLayout = async (name, width) => {
      const writing = ['escrita', 'página vazia', 'texto longo'].includes(name);
      if (writing) await poll(() => evaluate("(()=>{const text=document.getElementById('journalText');return text.scrollHeight<=text.clientHeight+2})()"), `altura da escrita em ${width}px`, 3000).catch(async error => {
        error.message += ' ' + JSON.stringify(await evaluate("(()=>{const text=document.getElementById('journalText'),style=getComputedStyle(text);return {editor:{height:text.clientHeight,scrollHeight:text.scrollHeight,inlineHeight:text.style.height,flex:style.flex,minHeight:style.minHeight},paper:document.getElementById('paper').getBoundingClientRect().toJSON(),content:document.getElementById('editorView').getBoundingClientRect().toJSON()}})()"));
        throw error;
      });
      const layout = await evaluate(`(()=>{const root=document.documentElement,dialog=document.getElementById('diaryDialog'),box=dialog.open?dialog.getBoundingClientRect():null,text=document.getElementById('journalText');return {view:${JSON.stringify(name)},viewport:innerWidth,content:root.scrollWidth,editor:${writing}?{height:text.clientHeight,content:text.scrollHeight,width:text.clientWidth,contentWidth:text.scrollWidth}:null,dialog:box?{left:Math.round(box.left),right:Math.round(box.right),width:Math.round(box.width)}:null}})()`);
      layouts.push(layout);
      assert.equal(layout.viewport, width);
      assert.ok(layout.content <= width, `${name}: overflow horizontal em ${width}px (${layout.content}px)`);
      if (layout.editor) assert.ok(layout.editor.content <= layout.editor.height + 2, `${name}: texto cortado após redimensionar para ${width}px (${layout.editor.content}px em ${layout.editor.height}px)`);
      if (layout.editor) assert.ok(layout.editor.contentWidth <= layout.editor.width + 2, `${name}: linhas da escrita ultrapassam a largura em ${width}px`);
      if (layout.dialog) assert.ok(layout.dialog.left >= 0 && layout.dialog.right <= width, `${name}: diálogo cabe em ${width}px`);
    };
    const checkPaperText = async width => {
      const typography = await evaluate(`(()=>{
        const paper=document.getElementById('paper').getBoundingClientRect(),footer=document.querySelector('.entry-footer'),footerBox=footer?.getBoundingClientRect(),editor=document.getElementById('journalText'),editorStyle=getComputedStyle(editor),placeholderStyle=getComputedStyle(editor,'::placeholder');
        const controls=[...document.querySelectorAll('.page-topline,.paper-action,#feelingButton,#wordCount,#saveState,.tag,#entryExtra,#deleteCurrent')].filter(element=>element.getClientRects().length).map(element=>{const style=getComputedStyle(element),box=element.getBoundingClientRect();return {selector:element.id||element.className,fontSize:parseFloat(style.fontSize),fontFamily:style.fontFamily,color:style.color,left:box.left,right:box.right,top:box.top,bottom:box.bottom}});
        return {view:'tipografia',viewport:innerWidth,editor:{fontSize:parseFloat(editorStyle.fontSize),lineHeight:parseFloat(editorStyle.lineHeight),fontFamily:editorStyle.fontFamily,color:editorStyle.color},placeholder:{fontSize:parseFloat(placeholderStyle.fontSize),fontFamily:placeholderStyle.fontFamily,color:placeholderStyle.color},paper:{left:paper.left,right:paper.right,top:paper.top,bottom:paper.bottom},footer:footerBox?{left:footerBox.left,right:footerBox.right,top:footerBox.top,bottom:footerBox.bottom}:null,controls};
      })()`);
      layouts.push(typography);
      assert.ok(typography.editor.fontSize >= 17, `Escrita legível em ${width}px`);
      assert.ok(typography.editor.lineHeight >= typography.editor.fontSize * 1.35, `Entrelinha da escrita em ${width}px`);
      assert.ok(typography.footer, 'Controles inferiores agrupados dentro do pergaminho');
      for (const control of typography.controls) {
        assert.ok(control.fontSize >= 11, `${control.selector}: fonte auxiliar de pelo menos 11px em ${width}px (${control.fontSize}px)`);
        assert.ok(control.left >= typography.paper.left && control.right <= typography.paper.right, `${control.selector}: controle cabe no pergaminho em ${width}px`);
        assert.ok(control.top >= typography.paper.top && control.bottom <= typography.paper.bottom, `${control.selector}: controle não é cortado pelo pergaminho em ${width}px`);
        if (['feelingButton', 'wordCount', 'saveState', 'entryExtra', 'deleteCurrent'].includes(control.selector)) {
          assert.ok(control.top >= typography.footer.top - 1 && control.bottom <= typography.footer.bottom + 1, `${control.selector}: cabe no grupo de controles em ${width}px`);
        }
      }
    };
    const capture = async filename => {
      if (!capturePreview) return;
      await evaluate('window.scrollTo(0,0)');
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(root, 'docs/diary-preview', filename), Buffer.from(screenshot.data, 'base64'));
    };
    const checkLeaves = async () => {
      const decoration = await evaluate(`(()=>{const layer=document.querySelector('.diary-leaves'),text=document.getElementById('journalText'),box=text.getBoundingClientRect(),x=box.left+box.width/2,y=Math.min(box.bottom-1,box.top+20);return {exists:!!layer,editorHit:y>=0&&y<innerHeight?document.elementFromPoint(x,y)===text:null,writingMotion:['paper','editorView','journalText'].map(id=>({id,animations:document.getElementById(id).getAnimations().length,transform:getComputedStyle(document.getElementById(id)).transform}))}})()`);
      assert.equal(decoration.exists, false, 'Folhas permanecem na ilustração estática do pergaminho');
      if (decoration.editorHit !== null) assert.equal(decoration.editorHit, true, 'Área de escrita recebe interação diretamente');
      for (const element of decoration.writingMotion) {
        assert.equal(element.animations, 0, `${element.id}: a escrita permanece sem animação`);
        assert.equal(element.transform, 'none', `${element.id}: a escrita permanece estável`);
      }
    };
    await viewport(1440);
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/app/diario.html?preview=1` });
    await poll(() => evaluate("!document.getElementById('journalText')?.disabled && document.getElementById('journalText').value.length>0"), 'prévia real pronta');
    assert.equal(await evaluate("document.getElementById('previewBanner').hidden"), false);
    assert.equal(await evaluate("document.getElementById('portalBack').getAttribute('href')"), './home.html');
    await evaluate('Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,3000))])');
    await checkLeaves();
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await evaluate("!document.querySelector('.diary-leaves') && document.getElementById('paper').getAnimations().length===0"), true, 'Folhas e pergaminho continuam estáticos com movimento reduzido');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    if (capturePreview) await mkdir(join(root, 'docs/diary-preview'), { recursive: true });
    for (const width of [1440, 768, 390, 320]) {
      await viewport(width); await checkLayout('escrita', width); await checkPaperText(width);
      const tools = await evaluate("[...document.querySelectorAll('.tool-card,.tool-card__heading,.tool-card small,.voice-wave')].map(element=>({name:element.id||element.className,width:element.clientWidth,contentWidth:element.scrollWidth,height:element.clientHeight,contentHeight:element.scrollHeight}))");
      for (const tool of tools) { assert.ok(tool.contentWidth <= tool.width + 2, `${tool.name}: sem cortes laterais em ${width}px`); assert.ok(tool.contentHeight <= tool.height + 2, `${tool.name}: texto cabe no cartão em ${width}px`); }
      if (width === 1440 || width === 390) await capture(width === 1440 ? 'desktop.png' : 'mobile.png');
      await openDialog('#tagsButton'); await checkLayout('marcadores', width); await closeDialog();
    }
    await viewport(1440);

    await openDialog('#feelingButton');
    const initialFeelings = await evaluate("[...document.querySelectorAll('[data-feeling][aria-pressed=true]')].map(element=>element.dataset.feeling)");
    for (const feeling of initialFeelings) await click(`[data-feeling="${feeling}"]`);
    await click('#applyFeelings'); await saved();
    await tab('feelings');
    assert.equal(await evaluate("document.querySelector('.feelings-empty')!==null"), true, 'Insights vazio oferece um próximo passo claro');
    assert.match(await evaluate("document.querySelector('.feelings-empty').textContent"), /Comece pela página de hoje/i);
    for (const width of [320, 390, 768, 1440]) {
      await viewport(width); await checkLayout('insights vazio', width);
      const emptyLayout = await evaluate(`(()=>{const card=document.querySelector('.feelings-empty').getBoundingClientRect(),note=document.querySelector('.feelings-care-note').getBoundingClientRect(),button=document.getElementById('backToWriting').getBoundingClientRect();return {card:{left:card.left,right:card.right,bottom:card.bottom},note:{top:note.top},button:{left:button.left,right:button.right,bottom:button.bottom}}})()`);
      assert.ok(emptyLayout.button.left >= emptyLayout.card.left && emptyLayout.button.right <= emptyLayout.card.right, `Ação do estado inicial cabe no cartão em ${width}px`);
      assert.ok(emptyLayout.button.bottom < emptyLayout.note.top, `Estado inicial não encosta no aviso em ${width}px`);
      if (width === 1440 || width === 390) await capture(width === 1440 ? 'insights-empty-desktop.png' : 'insights-empty-mobile.png');
    }
    await click('#backToWriting');
    await poll(() => evaluate("document.getElementById('diaryDialog').open"), 'escolha de sentimentos a partir do estado inicial');
    await closeDialog();
    await viewport(1440);

    await click('#newPageButton');
    await poll(() => evaluate("document.getElementById('journalText').value===''"), 'nova página vazia');
    const placeholder = await evaluate("document.getElementById('journalText').placeholder");
    assert.ok(placeholder.trim().length > 10 && placeholder.length < 130, 'Página vazia oferece um convite curto para escrever');
    assert.doesNotMatch(placeholder, /caminhei pelo parque|memórias antigas|nostalgia me abraçou/i, 'Convite não se confunde com uma memória já escrita');
    assert.equal(await evaluate("document.getElementById('wordCount').textContent"), '0 palavras');
    for (const width of [1440, 768, 390, 320]) {
      await viewport(width); await checkLayout('página vazia', width); await checkPaperText(width);
      if (width === 1440 || width === 390) await capture(width === 1440 ? 'blank-desktop.png' : 'blank-mobile.png');
    }
    const longWriting = Array.from({ length: 12 }, (_, index) => `${index + 1}. Hoje encontrei tempo para respirar e observar os detalhes ao meu redor. Escrevo com calma sobre o que senti, os pequenos encontros e aquilo que quero guardar. Cada lembrança encontra seu espaço nesta página, sem pressa para terminar.`).join('\n\n');
    await fill('#journalText', longWriting); await saved();
    for (const width of [320, 390, 768, 1440]) {
      await viewport(width); await checkLayout('texto longo', width); await checkPaperText(width);
      assert.equal(await evaluate("document.getElementById('journalText').value"), longWriting, `Texto longo preservado ao redimensionar para ${width}px`);
    }
    await click('#newPageButton');
    await poll(() => evaluate("document.getElementById('journalText').value===''"), 'página após escrita longa');
    const memory = '<img src=x onerror="document.title=\'XSS_EXECUTED\'"> Café sem pressa';
    await fill('#journalText', memory);
    assert.equal(await evaluate("document.getElementById('saveState').dataset.state"), '');
    await saved();
    assert.equal(await evaluate("document.getElementById('deleteCurrent').hidden"), false, 'A página digitada recebeu uma versão salva');

    await openDialog('#tagsButton');
    await fill('#tagsInput', '#jardim, café, jardim');
    await click('#tagsForm button[type="submit"]');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('#entryTags .tag')].map(element=>element.textContent)"), ['#jardim', '#café']);
    await openDialog('#aromaButton'); await click('[data-aroma="lavanda"]');
    assert.match(await evaluate("document.getElementById('aromaLabel').textContent"), /lavanda/i);
    await openDialog('#fontButton'); await click('[data-font="classic"]');
    assert.equal(await evaluate("document.getElementById('paper').dataset.font"), 'classic');
    await openDialog('#feelingButton');
    const choices = await evaluate("[...document.querySelectorAll('[data-feeling]')].slice(0,4).map(element=>({id:element.dataset.feeling,label:element.textContent.trim()}))");
    for (const choice of choices) await click(`[data-feeling="${choice.id}"]`);
    assert.equal(await evaluate("document.querySelectorAll('[data-feeling][aria-pressed=true]').length"), 3, 'Uma quarta escolha não ultrapassa o limite de três sentimentos');
    assert.equal(await evaluate(`document.querySelector('[data-feeling="${choices[3].id}"]').getAttribute('aria-pressed')`), 'false');
    await click('#applyFeelings'); await saved();
    await evaluate("document.getElementById('diaryToast').hidden=true");

    await tab('feelings');
    assert.equal(await evaluate("document.querySelector('.feelings-chart')!==null"), true, 'Insights mostra a distribuição dos sentimentos registrados');
    assert.equal(await evaluate("document.querySelectorAll('.feeling-stat-card').length"), 2, 'Insights apresenta os dois indicadores principais');
    assert.match(await evaluate("document.querySelector('.feelings-care-note').textContent"), /não faz avaliação psicológica/i);
    for (const width of [320, 390, 768, 1440]) {
      await viewport(width); await checkLayout('insights', width);
      const insightLayout = await evaluate(`(()=>{const paper=document.getElementById('paper').getBoundingClientRect(),view=document.querySelector('.feelings-view').getBoundingClientRect(),note=document.querySelector('.feelings-care-note').getBoundingClientRect(),button=document.getElementById('backToWriting').getBoundingClientRect();return {paper:{left:paper.left,right:paper.right,bottom:paper.bottom},view:{left:view.left,right:view.right,bottom:view.bottom},note:{bottom:note.bottom},button:{bottom:button.bottom}}})()`);
      assert.ok(insightLayout.view.left >= insightLayout.paper.left && insightLayout.view.right <= insightLayout.paper.right, `Insights cabe no pergaminho em ${width}px`);
      assert.ok(insightLayout.note.bottom < insightLayout.button.bottom, `Aviso fica separado da ação em ${width}px`);
      assert.ok(insightLayout.button.bottom <= insightLayout.paper.bottom, `Ação de Insights não invade as folhas em ${width}px`);
      if (width === 1440 || width === 390) await capture(width === 1440 ? 'insights-desktop.png' : 'insights-mobile.png');
    }
    await viewport(1440);
    await tab('timeline');
    await fill('#memorySearch', 'cafe');
    assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), 1, 'Busca ignora acentos');
    assert.equal(await evaluate("document.querySelector('.entry-open h2').textContent"), memory, 'HTML da escrita aparece como texto');
    assert.equal(await evaluate("document.querySelector('.entry-open img')"), null);
    assert.notEqual(await evaluate('document.title'), 'XSS_EXECUTED');
    await fill('#memorySearch', 'jardim');
    assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), 1, 'Busca encontra marcadores');
    await fill('#memorySearch', 'uma palavra que nao existe na memoria');
    assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), 0);
    await fill('#memorySearch', 'cafe'); await click('.entry-open');
    assert.equal(await evaluate("document.getElementById('journalText').value"), memory, 'Texto salvo é recuperado ao reabrir');
    assert.equal(await evaluate("document.getElementById('paper').dataset.font"), 'classic');
    assert.match(await evaluate("document.getElementById('aromaLabel').textContent"), /lavanda/i);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('#entryTags .tag')].map(element=>element.textContent)"), ['#jardim', '#café']);
    await openDialog('#feelingButton');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-feeling][aria-pressed=true]')].map(element=>element.dataset.feeling)"), choices.slice(0, 3).map(choice => choice.id));
    await closeDialog();

    await tab('dreams'); await click('#collectionNew');
    await poll(() => evaluate("!document.getElementById('editorView').hidden && document.getElementById('journalText').value===''"), 'escrita de sonho');
    const dream = 'Sonhei que as folhas viravam pequenas estrelas.';
    await fill('#journalText', dream); await saved(); await tab('dreams');
    assert.equal(await evaluate("document.querySelector('.entry-open h2').textContent"), dream);
    assert.match(await evaluate("document.querySelector('.entry-open time').textContent"), /Sonho/);
    await click('.entry-open');
    assert.equal(await evaluate("document.getElementById('journalText').value"), dream);

    await tab('capsules'); await click('#collectionNew');
    const capsuleSecret = 'CAPSULE_PRIVATE_MESSAGE_365: estas palavras pertencem ao futuro.';
    const dateMin = await evaluate("document.getElementById('capsuleDate').min");
    await evaluate(`(()=>{const element=document.getElementById('capsuleDate');element.value=${JSON.stringify(dateMin)};element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await fill('#capsuleText', capsuleSecret); await click('#sealCapsule');
    await poll(() => evaluate("!document.getElementById('diaryDialog').open && !!document.querySelector('.capsule-lock')"), 'cápsula selada');
    assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('.entry-open').length"), 0, 'Cápsula selada não tem controle para abrir');
    assert.equal(await evaluate(`document.body.innerHTML.includes(${JSON.stringify(capsuleSecret)})`), false, 'Carta selada não permanece no DOM');
    assert.equal(await evaluate(`[...document.querySelectorAll('textarea')].some(element=>element.value.includes(${JSON.stringify(capsuleSecret)}))`), false, 'Texto da carta é retirado dos controles após selar');
    assert.match(await evaluate("document.querySelector('.capsule-lock').textContent"), /Abre em/);
    await fill('#memorySearch', 'CAPSULE_PRIVATE_MESSAGE_365');
    assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), 0, 'Busca não revela texto de cápsulas seladas');
    await fill('#memorySearch', '');
    for (const width of [320, 390, 768, 1440]) { await viewport(width); await checkLayout('cápsulas', width); }

    await tab('timeline');
    const beforeRelease = await evaluate("document.querySelectorAll('.entry-card').length");
    const release = 'RELEASE_NOT_SAVED_123: hoje eu deixo esta preocupação ir.';
    await openDialog('#releaseButton'); await fill('#releaseText', release);
    await click('#releaseForm button[type="submit"]');
    assert.equal(await evaluate("document.getElementById('releaseText')"), null);
    assert.equal(await evaluate(`document.body.innerHTML.includes(${JSON.stringify(release)})`), false, 'Desabafo é removido do DOM ao virar constelação');
    assert.equal(await evaluate("document.querySelectorAll('.constellation i').length>=20"), true);
    await click('#releaseDone');
    await tab('diary'); await tab('timeline');
    assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), beforeRelease, 'Desabafo não cria uma memória');
    await fill('#memorySearch', 'RELEASE_NOT_SAVED_123');
    assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), 0);

    await fill('#memorySearch', 'cafe'); await click('.entry-open');
    await openDialog('#deleteCurrent'); await click('#cancelDelete');
    assert.equal(await evaluate("document.getElementById('journalText').value"), memory, 'Cancelar exclusão preserva a escrita');
    await openDialog('#deleteCurrent'); await click('#confirmDelete');
    await poll(() => evaluate("!document.getElementById('diaryDialog').open && document.getElementById('journalText').value===''"), 'exclusão da memória');
    await tab('timeline'); await fill('#memorySearch', 'cafe');
    assert.equal(await evaluate("document.querySelectorAll('.entry-card').length"), 0, 'Memória excluída desaparece da linha do tempo');
    await tab('capsules'); await click('[data-delete]'); await click('#confirmDelete');
    await poll(() => evaluate("!document.getElementById('diaryDialog').open && document.querySelectorAll('.entry-card').length===0"), 'exclusão da cápsula');

    await viewport(1440);
    await evaluate('window.scrollTo(0,0)');
    assert.equal(await evaluate("document.getElementById('playButton').getAttribute('aria-pressed')"), 'false', 'Trilha só começa após uma ação');
    assert.equal(await evaluate("performance.getEntriesByType('resource').some(entry=>entry.name.includes('cabin-rain-recorded'))"), false, 'Gravação não é baixada antes de pedir reprodução');
    const audioClick = async selector => {
      const result = await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)}).click()`, userGesture: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    };
    await audioClick('#playButton');
    await poll(() => evaluate("document.body.classList.contains('is-playing') && document.getElementById('playerDescription').textContent.includes('Chuva na cabana & piano')"), 'chuva gravada e piano no Web Audio');
    assert.equal(await evaluate("performance.getEntriesByType('resource').some(entry=>entry.name.includes('cabin-rain-recorded-v1.mp3'))"), true, 'Reprodução usa o arquivo de chuva gravada');
    await evaluate("document.getElementById('volumeSlider').value='35';document.getElementById('volumeSlider').dispatchEvent(new Event('input',{bubbles:true}))");
    await audioClick('#playButton');
    await poll(() => evaluate("document.getElementById('playButton').getAttribute('aria-pressed')==='false'"), 'pausa da chuva');
    await openDialog('#soundButton');
    await audioClick('[data-preset="piano"]');
    await poll(() => evaluate("document.body.classList.contains('is-playing') && document.getElementById('playerDescription').textContent.includes('Piano para desacelerar')"), 'piano separado da chuva');
    await audioClick('#playButton');

    await viewport(390);
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/aluno-diario.html?preview=1` });
    await poll(() => evaluate("document.body.dataset.portal==='student' && !document.getElementById('journalText')?.disabled && document.getElementById('journalText').value.length>0"), 'prévia do aluno');
    assert.equal(await evaluate("document.getElementById('portalBack').getAttribute('href')"), './aluno-painel.html');
    assert.equal(await evaluate("document.querySelector('.diary-brand').getAttribute('href')"), './aluno-diario.html');
    await checkLayout('escrita', 390); await checkLeaves();

    assert.deepEqual(cdp.exceptions, [], 'Nenhum erro de execução no navegador');
    assert.deepEqual(cdp.privateRequests.filter(privateRequest), [], 'A prévia não tenta acessar Firebase ou backend');
    if (capturePreview) await writeFile(join(root, 'docs/diary-preview/report.json'), JSON.stringify({ route: '/app/diario.html?preview=1', scenarios: ['blank-writing-prompt', 'paper-text-readability', 'long-writing-no-clipping', 'decorative-leaves-no-interception', 'reduced-motion', 'autosave', 'tags', 'aroma', 'font', 'insights-empty', 'insights-summary', 'three-feelings-limit', 'search-escaped-html', 'dream', 'sealed-capsule', 'release-without-saving', 'delete'], layouts, runtimeErrors: cdp.exceptions, privateRequests: cdp.privateRequests }, null, 2) + '\n');
  } finally {
    cdp?.socket.close(); browser.kill(); server.closeAllConnections();
    await new Promise(resolveClose => server.close(resolveClose));
    await new Promise(resolveExit => setTimeout(resolveExit, 350));
    const target = resolve(profile);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('ep-diary-browser-')) throw new Error('Unsafe browser cleanup');
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
  }
});

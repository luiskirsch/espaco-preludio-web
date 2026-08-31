import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chromePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find(candidate => candidate && existsSync(candidate));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'aluno-painel.html' : pathname.replace(/^\/+/, '');
      const file = resolve(root, relative);
      if (!file.startsWith(root)) throw new Error('invalid path');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise(resolveStarted => server.listen(0, '127.0.0.1', () => resolveStarted(server)));
}

async function poll(fn, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('browser timeout');
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.onopen = resolveOpen;
    socket.onerror = rejectOpen;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolveMessage, rejectMessage } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectMessage(new Error(message.error.message));
    else resolveMessage(message.result);
  };
  const send = (method, params = {}) => new Promise((resolveMessage, rejectMessage) => {
    const id = ++sequence;
    pending.set(id, { resolveMessage, rejectMessage });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return { socket, send, evaluate };
}

async function reloadPreview(cdp) {
  let resolveDialog;
  const dialogOpened = new Promise(resolve => { resolveDialog = resolve; });
  const onMessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.javascriptDialogOpening') resolveDialog(true);
  };
  cdp.socket.addEventListener('message', onMessage);
  const reload = cdp.send('Page.reload', { ignoreCache: true });
  const hasDialog = await Promise.race([
    dialogOpened,
    new Promise(resolve => setTimeout(() => resolve(false), 500))
  ]);
  if (hasDialog) await cdp.send('Page.handleJavaScriptDialog', { accept: true });
  await reload;
  cdp.socket.removeEventListener('message', onMessage);
  await poll(() => cdp.evaluate("document.querySelector('[data-card-activity=course_emotional_literacy]')?.textContent.includes('Revisar')"));
}

test('atividades novas exigem conclusão e atividades feitas abrem em revisão', { timeout: 30000, skip: chromePath ? false : 'Chrome ou Edge não encontrado' }, async () => {
  const server = await startServer();
  const userData = await mkdtemp(join(tmpdir(), 'ep-activity-browser-'));
  const debugPort = 12000 + Math.floor(Math.random() * 1000);
  const address = server.address();
  const pageUrl = `http://127.0.0.1:${address.port}/aluno-painel.html?preview=1`;
  const browser = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`, pageUrl
  ], { stdio: 'ignore' });
  let cdp;
  try {
    const page = await poll(async () => {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
      return pages.find(item => item.type === 'page' && item.url.includes('aluno-painel.html'));
    });
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await poll(() => cdp.evaluate("document.querySelector('[data-card-activity=course_emotional_literacy]')?.textContent.includes('Revisar')"));
    assert.equal(await cdp.evaluate('studentSwitch.hidden'), true);
    assert.deepEqual(await cdp.evaluate("({fontSize:getComputedStyle(document.querySelector('.side__label')).fontSize,background:getComputedStyle(document.querySelector('.side__label')).backgroundImage,border:getComputedStyle(document.querySelector('.side__label')).borderTopStyle})"), { fontSize: '12px', background: 'linear-gradient(120deg, rgba(214, 169, 68, 0.2), rgba(255, 250, 240, 0.54))', border: 'solid' });
    assert.deepEqual(await cdp.evaluate("({title:document.querySelector('.project-identity strong').textContent,subtitle:document.querySelector('.project-identity span').textContent})"), {
      title: 'Projeto Lemniscata',
      subtitle: 'Programa Municipal de Telepsicologia e Acompanhamento Emocional Estudantil'
    });
    const dailyCards = await cdp.evaluate("[...document.querySelectorAll('#sideDailyStack .side-daily-card')].map(card=>card.textContent.trim())");
    assert.equal(dailyCards.length, 8);
    assert.equal(new Set(dailyCards).size, 8);
    const dailyBackgrounds = await cdp.evaluate("[...document.querySelectorAll('#sideDailyStack .side-daily-card')].map(card=>getComputedStyle(card).backgroundImage)");
    assert.equal(new Set(dailyBackgrounds).size, 8);
    assert.equal(await cdp.evaluate("document.querySelectorAll('#sideDailyStack .side-daily-card :is(small,p,footer)').length"), 0);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.deepEqual(await cdp.evaluate("({subtitleHidden:getComputedStyle(document.querySelector('.project-identity span')).display==='none',centered:(()=>{const bar=document.querySelector('.topbar').getBoundingClientRect(),project=document.querySelector('.project-identity').getBoundingClientRect();return Math.abs((project.left+project.width/2)-(bar.left+bar.width/2))<.5})(),ordered:(()=>{const brand=document.querySelector('.brand').getBoundingClientRect(),project=document.querySelector('.project-identity').getBoundingClientRect(),actions=document.querySelector('.top-actions').getBoundingClientRect();return brand.right<=project.left&&project.right<=actions.left})()})"), { subtitleHidden: true, centered: true, ordered: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.deepEqual(await cdp.evaluate("({subtitleVisible:getComputedStyle(document.querySelector('.project-identity span')).display!=='none',centered:(()=>{const bar=document.querySelector('.topbar').getBoundingClientRect(),project=document.querySelector('.project-identity').getBoundingClientRect();return Math.abs((project.left+project.width/2)-(bar.left+bar.width/2))<.5})()})"), { subtitleVisible: true, centered: true });
    await cdp.evaluate("document.querySelector('#desktopNav [data-view=safety]').click()");
    assert.equal(await cdp.evaluate("getComputedStyle(document.querySelector('#view-safety .emergency-card .eyebrow')).color"), 'rgb(255, 111, 111)');
    assert.deepEqual(await cdp.evaluate("[...document.querySelectorAll('#view-safety .emergency-card a[href^=tel]')].map(link=>link.getAttribute('href'))"), ['tel:192', 'tel:190', 'tel:188']);
    assert.equal(await cdp.evaluate("document.querySelector('#view-safety .source-link[href=\"https://cvv.org.br/\"]')?.textContent.includes('CVV 188')"), true);
    assert.equal(await cdp.evaluate("document.querySelector('#view-safety .source-link[href=\"https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-mental\"]')?.textContent.includes('Saúde Mental')"), true);
    assert.equal(await cdp.evaluate("Boolean(document.querySelector('#view-safety .source-link[href*=\"bvsms.saude.gov.br\"]'))"), false);
    await cdp.evaluate("document.querySelector('#view-safety .emergency-card a[href=\"tel:188\"]').click()");
    assert.deepEqual(await cdp.evaluate("({open:emergencyCallModal.classList.contains('is-open'),service:emergencyCallModal.dataset.service,title:emergencyCallTitle.textContent})"), { open: true, service: 'emotional', title: 'Conversar com o CVV 188' });
    await cdp.evaluate('emergencyCallClose.click()');
    await cdp.evaluate("document.querySelector('#desktopNav [data-view=academy]').click()");
    const courseTags = await cdp.evaluate("[...document.querySelectorAll('#view-academy .course-card')].map(card=>{const art=card.querySelector('.course-card__art').getBoundingClientRect(),tag=card.querySelector('.card-tag'),rect=tag.getBoundingClientRect();return {text:tag.textContent,inside:rect.top>=art.top&&rect.right<=art.right&&rect.bottom<=art.bottom&&rect.left>=art.left,unclipped:tag.scrollWidth<=tag.clientWidth}})");
    assert.deepEqual(courseTags.map(tag => tag.text), ['Bem-estar', 'Aprendizagem', 'Segurança', 'Conscientização', 'Vida digital', 'Cidadania']);
    assert.equal(courseTags.every(tag => tag.inside && tag.unclipped), true);

    await cdp.evaluate("document.querySelector('[data-card-activity=course_emotional_literacy]').click()");
    assert.deepEqual(await cdp.evaluate("({eyebrow:modalEyebrow.textContent,button:modalComplete.textContent,disabled:modalComplete.disabled,closeHidden:modalClose.hidden,correct:document.querySelectorAll('.quiz-option.is-correct').length,inputsDisabled:[...document.querySelectorAll('input[name=quizAnswer]')].every(input=>input.disabled)})"), {
      eyebrow: 'Revisão concluída', button: 'Fechar revisão', disabled: false, closeHidden: false, correct: 1, inputsDisabled: true
    });
    await cdp.evaluate('modalComplete.click()');
    assert.equal(await cdp.evaluate("lessonModal.classList.contains('is-open')"), false);

    await cdp.evaluate("document.querySelector('[data-card-activity=course_peer_support]').click()");
    assert.equal(await cdp.evaluate('modalComplete.disabled'), true);
    await cdp.evaluate("document.querySelectorAll('input[name=quizAnswer]')[0].click();document.getElementById('quizCheck').click()");
    assert.deepEqual(await cdp.evaluate("({disabled:modalComplete.disabled,closeHidden:modalClose.hidden,wrong:document.querySelectorAll('.quiz-option.is-wrong').length,correct:document.querySelectorAll('.quiz-option.is-correct').length})"), { disabled: true, closeHidden: true, wrong: 1, correct: 1 });
    await cdp.evaluate("document.querySelectorAll('input[name=quizAnswer]')[2].click();document.getElementById('quizCheck').click()");
    assert.deepEqual(await cdp.evaluate("({disabled:modalComplete.disabled,label:modalComplete.textContent,verified:document.getElementById('quizCheck').disabled})"), { disabled: false, label: 'Concluir atividade', verified: true });
    await cdp.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    assert.equal(await cdp.evaluate("lessonModal.classList.contains('is-open')"), true);
    await reloadPreview(cdp);
    assert.deepEqual(await cdp.evaluate("[...document.querySelectorAll('#sideDailyStack .side-daily-card')].map(card=>card.textContent.trim())"), dailyCards);

    await cdp.evaluate("document.querySelector('[data-card-activity=emotion_checkin]').click()");
    assert.equal(await cdp.evaluate('modalComplete.disabled'), true);
    await cdp.evaluate("document.getElementById('activityConfirm').click()");
    assert.deepEqual(await cdp.evaluate("({disabled:modalComplete.disabled,closeHidden:modalClose.hidden})"), { disabled: false, closeHidden: true });
    await reloadPreview(cdp);

    await cdp.evaluate("document.querySelector('[data-card-activity=focus_5]').click()");
    assert.deepEqual(await cdp.evaluate("({disabled:modalComplete.disabled,closeHidden:modalClose.hidden})"), { disabled: true, closeHidden: false });
    await cdp.evaluate("document.getElementById('timerStart').click()");
    assert.deepEqual(await cdp.evaluate("({disabled:modalComplete.disabled,closeHidden:modalClose.hidden})"), { disabled: true, closeHidden: true });
    await cdp.evaluate("lessonModal.dispatchEvent(new MouseEvent('click',{bubbles:true}))");
    assert.equal(await cdp.evaluate("lessonModal.classList.contains('is-open')"), true);
  } finally {
    cdp?.socket.close();
    if (browser.exitCode === null) {
      browser.kill();
      await once(browser, 'exit');
    }
    await new Promise(resolveClose => server.close(resolveClose));
    await rm(userData, { recursive: true, force: true });
  }
});

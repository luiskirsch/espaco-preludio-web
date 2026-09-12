import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
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
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      if (relative === 'instituicao-painel-preview.html') {
        const html = (await readFile(resolve(root, 'instituicao-painel.html'), 'utf8'))
          .replace('id="dashboardLoading" role="status"', 'id="dashboardLoading" role="status" hidden')
          .replace('id="dashboardApp" hidden', 'id="dashboardApp"')
          .replace(/\s*<script type="module" src="\.\/js\/instituicao-painel\.js\?v=1"><\/script>/, '');
        response.writeHead(200, { 'content-type': mime['.html'] });
        response.end(html);
        return;
      }
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
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolveMessage, rejectMessage) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return { socket, send, evaluate };
}

test('entrada principal aponta para o portal institucional', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.match(html, /<a href="\.\/instituicao-login\.html" class="nav-login">Entrar<\/a>/);
  assert.doesNotMatch(html, /<a href="\.\/entrar\.html" class="nav-login">Entrar<\/a>/);
});

test('sessão não verificada é limpa sem enviar confirmação ao abrir a página', async () => {
  const script = await readFile(resolve(root, 'js/instituicao-login.js'), 'utf8');
  const passiveBootstrap = script.slice(script.lastIndexOf('(async () => {'));
  assert.match(passiveBootstrap, /if \(!user\.emailVerified\) \{[\s\S]*?signOut\(auth\)[\s\S]*?return;/);
  assert.doesNotMatch(passiveBootstrap, /ensureVerifiedEmail\(user\)/);
});

test('login institucional não cria rolagem horizontal em desktop ou celular', { timeout: 30000, skip: chromePath ? false : 'Chrome ou Edge não encontrado' }, async () => {
  const server = await startServer();
  const userData = await mkdtemp(join(tmpdir(), 'ep-institution-browser-'));
  const debugPort = 13000 + Math.floor(Math.random() * 1000);
  const pageUrl = `http://127.0.0.1:${server.address().port}/instituicao-login.html`;
  const browser = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`, pageUrl
  ], { stdio: 'ignore' });
  let cdp;
  try {
    const page = await poll(async () => {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
      return pages.find(item => item.type === 'page' && item.url.includes('instituicao-login.html'));
    });
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await poll(() => cdp.evaluate("document.querySelector('.login-card') && getComputedStyle(document.body).fontFamily.includes('Inter')"));

    for (const viewport of [
      { width: 1440, height: 900, mobile: false },
      { width: 390, height: 844, mobile: true }
    ]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
      const layout = await cdp.evaluate(`(() => {
        const nodes = [...document.body.querySelectorAll('*')].filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const overflowing = nodes.filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.right > innerWidth + 1 || rect.left < -1;
        }).map(node => node.className || node.tagName).slice(0, 10);
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflowing,
          formVisible: document.querySelector('#institutionLoginForm').getBoundingClientRect().width > 250
        };
      })()`);
      assert.ok(layout.scrollWidth <= layout.width);
      assert.deepEqual(layout.overflowing, []);
      assert.equal(layout.formVisible, true);
    }

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/instituicao-painel-preview.html` });
    await poll(() => cdp.evaluate("location.pathname.endsWith('instituicao-painel-preview.html') && document.readyState === 'complete'"));
    await cdp.evaluate(`document.getElementById('unitsTableBody').innerHTML = Array.from({length:3}, (_, index) =>
      '<tr><td><div class="unit-name"><strong>Unidade ' + (index + 1) + '</strong><small class="unit-status">Em operação</small></div></td>' +
      '<td data-label="Participantes" class="numeric-cell">120</td><td data-label="Em cuidado" class="numeric-cell">18</td>' +
      '<td data-label="Em fluxo" class="numeric-cell">7</td><td data-label="Realizadas" class="numeric-cell">42</td>' +
      '<td data-label="Agendadas" class="numeric-cell">12</td></tr>').join('')`);

    for (const viewport of [
      { width: 1440, height: 900, mobile: false },
      { width: 390, height: 844, mobile: true }
    ]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
      const layout = await cdp.evaluate(`({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cardsVisible: [...document.querySelectorAll('.metric-card')].every(card => card.getBoundingClientRect().width > 250),
        unitRows: document.querySelectorAll('#unitsTableBody tr').length
      })`);
      assert.ok(layout.scrollWidth <= layout.width);
      assert.equal(layout.cardsVisible, true);
      assert.equal(layout.unitRows, 3);
    }
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

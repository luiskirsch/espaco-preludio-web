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
      if (relative === 'chat-colegas-preview.html' || relative === 'chat-pacientes-preview.html') {
        const source = relative === 'chat-colegas-preview.html' ? 'mensagens-pro.html' : 'mensagens.html';
        const html = (await readFile(resolve(root, source), 'utf8'))
          .replace('<html lang="pt-BR"', '<html class="guard-ok" lang="pt-BR"')
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
        response.writeHead(200, { 'content-type': mime['.html'] });
        response.end(html);
        return;
      }
      if (relative === 'instituicao-painel-preview.html') {
        const html = (await readFile(resolve(root, 'instituicao-painel.html'), 'utf8'))
          .replace('id="dashboardLoading" role="status"', 'id="dashboardLoading" role="status" hidden')
          .replace('id="dashboardApp" hidden', 'id="dashboardApp"')
          .replace(/\s*<script type="module" src="\.\/js\/instituicao-painel\.js\?v=1"><\/script>/, '');
        response.writeHead(200, { 'content-type': mime['.html'] });
        response.end(html);
        return;
      }
      if (relative === 'aluno-login-preview.html') {
        const html = (await readFile(resolve(root, 'aluno-login.html'), 'utf8'))
          .replace('id="loadingState" class="ep-text-muted ep-mt-24"', 'id="loadingState" class="ep-text-muted ep-mt-24 ep-hide"')
          .replace('id="authState" class="ep-hide"', 'id="authState"')
          .replace(/\s*<script type="module">[\s\S]*?<\/script>/, '');
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

test('plano institucional permite informar uma conta Mercado Pago pagadora diferente', async () => {
  const html = await readFile(resolve(root, 'planos.html'), 'utf8');
  assert.match(html, /id="empresaPayerEmail"[^>]*type="email"/);
  assert.match(html, /startSubscription\("empresa",[\s\S]*empresaPayerEmail\.value\.trim\(\)\)/);
  assert.match(html, /body: JSON\.stringify\(\{ tier, billingCycle, \.\.\.\(payerEmail \? \{ payerEmail \} : \{\}\) \}\)/);
});

test('sessão não verificada é limpa sem enviar confirmação ao abrir a página', async () => {
  const script = await readFile(resolve(root, 'js/instituicao-login.js'), 'utf8');
  const passiveBootstrap = script.slice(script.lastIndexOf('(async () => {'));
  assert.match(passiveBootstrap, /if \(!user\.emailVerified\) \{[\s\S]*?signOut\(auth\)[\s\S]*?return;/);
  assert.doesNotMatch(passiveBootstrap, /ensureVerifiedEmail\(user\)/);
});

test('login mantém a marca apenas no cabeçalho, sem logo ampliada ao fundo', async () => {
  const html = await readFile(resolve(root, 'instituicao-login.html'), 'utf8');
  assert.doesNotMatch(html, /login-context-watermark/);
});

test('login do aluno apresenta a mensagem institucional na animação', async () => {
  const html = await readFile(resolve(root, 'aluno-login.html'), 'utf8');
  assert.match(html, /aria-label="Programa institucional de cuidado emocional"/);
  assert.match(html, />Programa institucional<\/span>[\s\S]*?>de cuidado<\/span>[\s\S]*?>emocional<\/span>/);
});

test('saudação de retorno aparece somente depois de um acesso concluído', async () => {
  const html = await readFile(resolve(root, 'instituicao-login.html'), 'utf8');
  const script = await readFile(resolve(root, 'js/instituicao-login.js'), 'utf8');
  assert.match(html, /<h2 id="institutionLoginHeading">Acesse o portal<\/h2>/);
  assert.doesNotMatch(html, /<h2[^>]*>Bem-vindo de volta<\/h2>/);
  assert.match(script, /localStorage\.getItem\(RETURNING_ACCESS_KEY\) === "true"[\s\S]*?loginHeading\.textContent = "Bem-vindo de volta"/);
  assert.match(script, /await validateInstitutionAccess\(credential\.user\);\s*rememberCompletedAccess\(\);/);
});

test('páginas institucional e profissional usam a mesma régua de cabeçalho', async () => {
  const institutional = await readFile(resolve(root, 'index.html'), 'utf8');
  const professional = await readFile(resolve(root, 'profissional.html'), 'utf8');
  const sharedStyles = await readFile(resolve(root, 'css/public-header.css'), 'utf8');
  assert.match(institutional, /css\/public-header\.css\?v=1/);
  assert.match(professional, /css\/public-header\.css\?v=1/);
  assert.match(sharedStyles, /--public-header-logo-size: 50px/);
  assert.match(sharedStyles, /\.site-header \.brand img,\s*\.ep-topbar \.ep-brand__mark/);
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
      { width: 1440, height: 800, mobile: false },
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
          height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          overflowing,
          formVisible: document.querySelector('#institutionLoginForm').getBoundingClientRect().width > 250,
          cardTop: document.querySelector('.login-card').getBoundingClientRect().top,
          cardBottom: document.querySelector('.login-card').getBoundingClientRect().bottom,
          contextTop: document.querySelector('.login-context-top').getBoundingClientRect().top,
          contextBottom: document.querySelector('.privacy-promise').getBoundingClientRect().bottom
        };
      })()`);
      assert.ok(layout.scrollWidth <= layout.width);
      assert.deepEqual(layout.overflowing, []);
      assert.equal(layout.formVisible, true);
      if (!viewport.mobile) {
        assert.ok(layout.scrollHeight <= layout.height);
        assert.ok(layout.cardTop >= 0);
        assert.ok(layout.cardBottom <= layout.height);
        assert.ok(layout.contextTop >= 0);
        assert.ok(layout.contextBottom <= layout.height);
      }
    }

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 800, mobile: false, deviceScaleFactor: 1 });
    const publicHeaders = [];
    for (const page of [
      {
        path: 'index.html',
        header: '.site-header',
        inner: '.header-inner',
        logo: '.brand img',
        lead: '.brand-copy small',
        title: '.brand-copy strong',
        nav: '.main-nav > a',
        button: '.button-small'
      },
      {
        path: 'profissional.html',
        header: '.ep-topbar',
        inner: '.ep-topbar__inner',
        logo: '.ep-brand__mark',
        lead: '.ep-brand__lead',
        title: '.ep-brand__name > span:not(.ep-brand__lead)',
        nav: '.ep-nav > a',
        button: '.ep-btn--sm'
      }
    ]) {
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${page.path}` });
      await poll(() => cdp.evaluate(`document.readyState === 'complete' && document.querySelector('${page.header}')?.getBoundingClientRect().height > 0`));
      publicHeaders.push(await cdp.evaluate(`(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const style = selector => getComputedStyle(document.querySelector(selector));
        return {
          headerHeight: rect('${page.header}').height,
          innerHeight: rect('${page.inner}').height,
          innerLeft: rect('${page.inner}').left,
          innerRight: rect('${page.inner}').right,
          logoSize: rect('${page.logo}').width,
          leadSize: style('${page.lead}').fontSize,
          titleSize: style('${page.title}').fontSize,
          navSize: style('${page.nav}').fontSize,
          buttonHeight: rect('${page.button}').height,
          buttonSize: style('${page.button}').fontSize,
          buttonRadius: style('${page.button}').borderRadius
        };
      })()`));
    }
    assert.deepEqual(publicHeaders[1], publicHeaders[0]);

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

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 760, mobile: false, deviceScaleFactor: 1 });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/aluno-login-preview.html` });
    await poll(() => cdp.evaluate("location.pathname.endsWith('aluno-login-preview.html') && document.querySelector('#loginForm')?.getBoundingClientRect().height > 0"));
    for (const registering of [false, true]) {
      const layout = await cdp.evaluate(`(() => {
        const registering = ${registering};
        studentCard.classList.toggle('is-registering', registering);
        loginForm.classList.toggle('ep-hide', registering);
        registerForm.classList.toggle('ep-hide', !registering);
        const card = studentCard.getBoundingClientRect();
        return {
          viewportHeight: innerHeight,
          pageOverflow: getComputedStyle(document.documentElement).overflow,
          cardTop: card.top,
          cardBottom: card.bottom,
          cardScrollHeight: studentCard.scrollHeight,
          cardClientHeight: studentCard.clientHeight,
          programDisplay: getComputedStyle(document.querySelector('.student-auth__program')).display
        };
      })()`);
      assert.equal(layout.pageOverflow, 'hidden');
      assert.ok(layout.cardTop >= 16, JSON.stringify(layout));
      assert.ok(layout.cardBottom <= layout.viewportHeight - 16, JSON.stringify(layout));
      assert.ok(layout.cardScrollHeight <= layout.cardClientHeight + 1, JSON.stringify(layout));
      assert.equal(layout.programDisplay, 'block');
    }
  } finally {
    cdp?.socket.close();
    if (browser.exitCode === null) {
      browser.kill();
      await once(browser, 'exit');
    }
    await new Promise(resolveClose => server.close(resolveClose));
    await rm(userData, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
  }
});

test('login do RT permanece fixo e sem rolagem em desktop ou celular', { timeout: 30000, skip: chromePath ? false : 'Chrome ou Edge não encontrado' }, async () => {
  const server = await startServer();
  const userData = await mkdtemp(join(tmpdir(), 'ep-rt-browser-'));
  const debugPort = 14000 + Math.floor(Math.random() * 1000);
  const pageUrl = `http://127.0.0.1:${server.address().port}/rt-login.html`;
  const browser = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`, pageUrl
  ], { stdio: 'ignore' });
  let cdp;
  try {
    const page = await poll(async () => {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
      return pages.find(item => item.type === 'page' && item.url.includes('rt-login.html'));
    });
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    for (const viewport of [
      { width: 1440, height: 760, mobile: false },
      { width: 390, height: 844, mobile: true }
    ]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
      await poll(() => cdp.evaluate("document.querySelector('#rtLoginForm')?.getBoundingClientRect().height > 0"));
      const layout = await cdp.evaluate(`(() => {
        const visible = [...document.body.querySelectorAll('*')].filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const overflowing = visible.filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.right > innerWidth + 1 || rect.left < -1 || rect.bottom > innerHeight + 1 || rect.top < -1;
        }).map(node => node.className || node.id || node.tagName).slice(0, 10);
        const form = document.querySelector('.rt-login-form-inner').getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyOverflow: getComputedStyle(document.body).overflow,
          formTop: form.top,
          formBottom: form.bottom,
          overflowing
        };
      })()`);
      assert.ok(layout.scrollWidth <= layout.width, JSON.stringify(layout));
      assert.ok(layout.scrollHeight <= layout.height, JSON.stringify(layout));
      assert.equal(layout.bodyOverflow, 'hidden');
      assert.ok(layout.formTop >= 0, JSON.stringify(layout));
      assert.ok(layout.formBottom <= layout.height, JSON.stringify(layout));
      assert.deepEqual(layout.overflowing, []);
    }
  } finally {
    cdp?.socket.close();
    if (browser.exitCode === null) {
      browser.kill();
      await once(browser, 'exit');
    }
    server.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test('descrições do Chat ficam em uma linha no desktop', { timeout: 30000, skip: chromePath ? false : 'Chrome ou Edge não encontrado' }, async () => {
  const server = await startServer();
  const userData = await mkdtemp(join(tmpdir(), 'ep-chat-browser-'));
  const debugPort = 15000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`, `${baseUrl}/chat-colegas-preview.html`
  ], { stdio: 'ignore' });
  let cdp;
  try {
    const page = await poll(async () => {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
      return pages.find(item => item.type === 'page' && item.url.includes('chat-colegas-preview.html'));
    });
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    for (const path of ['chat-colegas-preview.html', 'chat-pacientes-preview.html']) {
      await cdp.send('Page.navigate', { url: `${baseUrl}/${path}` });
      await poll(() => cdp.evaluate(`document.readyState === 'complete' && document.querySelector('.ep-chat-hub__intro')?.textContent.trim().length > 20`));
      await cdp.evaluate('document.fonts.ready');
      for (const width of [1200, 1440, 1600, 1920]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, mobile: false, deviceScaleFactor: 1 });
        const layout = await cdp.evaluate(`(() => {
          const intro = document.querySelector('.ep-chat-hub__intro');
          const range = document.createRange();
          range.selectNodeContents(intro);
          return { width: innerWidth, lines: range.getClientRects().length, text: intro.textContent.trim(),
            introRight: intro.getBoundingClientRect().right, viewportWidth: document.documentElement.clientWidth };
        })()`);
        assert.equal(layout.lines, 1, `${path}: ${JSON.stringify(layout)}`);
        assert.ok(layout.introRight <= layout.viewportWidth, `${path}: ${JSON.stringify(layout)}`);
      }
    }
  } finally {
    cdp?.socket.close();
    if (browser.exitCode === null) {
      browser.kill();
      await once(browser, 'exit');
    }
    server.close();
    await rm(userData, { recursive: true, force: true });
  }
});

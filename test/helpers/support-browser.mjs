import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep, extname, basename } from 'node:path';
export const root = resolve(import.meta.dirname, '../..');
export const chrome = [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
export async function poll(fn, label, timeout = 12000) {
  const until = Date.now() + timeout;
  let error;
  while (Date.now() < until) {
    try { const value = await fn(); if (value) return value; } catch (e) { error = e; }
    await new Promise(r => setTimeout(r, 60));
  }
  throw new Error(`Apoio: ${label} ${error?.message || ''}`);
}
export async function browserFixture(t, { route, script, mockAuth, api }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/therapy/') || url.pathname.startsWith('/empresa/')) {
      let raw = ''; for await (const chunk of req) raw += chunk;
      let body; try { body = raw ? JSON.parse(raw) : {}; } catch { res.writeHead(400).end(); return; }
      try {
        const result = await api(req.method, url, body, req.headers);
        res.writeHead(result.status || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
        res.end(JSON.stringify(result.body || result));
      } catch { res.writeHead(500).end('{}'); }
      return;
    }
    try {
      const file = resolve(root, url.pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root + sep)) throw new Error('invalid path');
      let content = await readFile(file);
      if (url.pathname === route) {
        content = content.toString().replace(/<!-- ep:perf[\s\S]*?<!-- \/ep:perf -->/g, '')
          .replace(/<script\b[^>]*src="[^"]*(?:i18n\/init|sw-register|portal-shell)[^"]*"[^>]*><\/script>/g, '');
      }
      if (url.pathname === script) content = mockAuth + '\n' + content.toString().replace(/^import[\s\S]*?;\r?\n/gm, '');
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(content);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profile = await mkdtemp(join(tmpdir(), 'ep-support-browser-'));
  // Desktop com mouse em qualquer máquina: o runner Linux do CI não tem mouse e
  // deixava falsas as regras em @media (hover: hover) and (pointer: fine).
  const desktopPointer = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', desktopPointer, '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let socket;
  t.after(async () => {
    socket?.close();
    if (browser.exitCode === null) { browser.kill(); await once(browser, 'exit'); }
    server.closeAllConnections(); await new Promise(r => server.close(r));
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && basename(profile).startsWith('ep-support-browser-'))
      await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  });
  const port = await poll(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'porta do Chrome', 20000);
  const page = await poll(async () => (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(p => p.type === 'page'), 'aba');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, reject) => { socket.onopen = r; socket.onerror = reject; });
  let counter = 0;
  const pending = new Map(), errors = [];
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!pending.has(m.id)) return;
    const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++counter; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*'] });
  const base = `http://127.0.0.1:${server.address().port}`;
  const navigate = () => send('Page.navigate', { url: base + route });
  await navigate();
  return { send, evaluate, errors, navigate, base };
}

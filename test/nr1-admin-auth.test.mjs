import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const chromePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium"
].find(candidate => candidate && existsSync(candidate));

async function startServer() {
  const mockAuth = `
    const auth = { currentUser: null };
    const BACKEND_BASE_URL = location.origin;
    let authListener;
    function onAuthStateChanged(_auth, listener) { authListener = listener; queueMicrotask(() => listener(auth.currentUser)); }
    async function signInWithEmailAndPassword(_auth, email) {
      const user = { uid: email, email, getIdToken: async () => email };
      auth.currentUser = user; queueMicrotask(() => authListener(user)); return { user };
    }
    async function signOut() { auth.currentUser = null; queueMicrotask(() => authListener(null)); }
  `;
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, "http://localhost").pathname;
      if (path === "/therapy/admin/empresas") {
        const allowed = request.headers.authorization === "Bearer admin@preludio.test";
        response.writeHead(allowed ? 200 : 403, { "content-type": "application/json" });
        response.end(JSON.stringify(allowed
          ? { ok: true, items: [{ id: "campi", nome: "Projeto Campi" }] }
          : { ok: false, error: "NAO_AUTORIZADO" }));
        return;
      }
      if (path === "/admin-nr1.html") {
        const html = (await readFile(resolve(root, "admin-nr1.html"), "utf8"))
          .replace('src="./js/nr1-admin.js"', 'src="./mock-nr1-admin.js"');
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html); return;
      }
      if (path === "/mock-nr1-admin.js") {
        const source = (await readFile(resolve(root, "js/nr1-admin.js"), "utf8"))
          .replace(/^import .*;\r?\n/gm, "");
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        response.end(mockAuth + source); return;
      }
      const file = resolve(root, path.replace(/^\/+/, ""));
      if (!file.startsWith(root + sep)) throw new Error("invalid path");
      const body = await readFile(file);
      const type = extname(file) === ".css" ? "text/css" : "application/octet-stream";
      response.writeHead(200, { "content-type": type }); response.end(body);
    } catch { response.writeHead(404).end("not found"); }
  });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  return server;
}

async function poll(fn, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { const value = await fn(); if (value) return value; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error("NR-1 admin browser timeout");
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => { socket.onopen = resolveOpen; socket.onerror = rejectOpen; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const entry = pending.get(message.id); pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolveMessage, rejectMessage) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return { socket, send, evaluate };
}

test("NR-1 mostra login, explica acesso negado e libera painel para administrador", {
  timeout: 30000, skip: chromePath ? false : "Chrome ou Edge não encontrado"
}, async () => {
  const server = await startServer();
  const profile = await mkdtemp(join(tmpdir(), "ep-nr1-auth-"));
  const port = 14000 + Math.floor(Math.random() * 1000);
  const pageUrl = `http://127.0.0.1:${server.address().port}/admin-nr1.html`;
  const browser = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run",
    "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, pageUrl
  ], { stdio: "ignore" });
  let cdp;
  try {
    const page = await poll(async () => {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(result => result.json());
      return pages.find(item => item.type === "page" && item.url.includes("admin-nr1.html"));
    });
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    await poll(() => cdp.evaluate('document.querySelector("#accessMessage")?.textContent.includes("Entre com sua conta")'));
    assert.equal(await cdp.evaluate('!document.querySelector("#accessPanel").hidden && document.querySelector("#adminWorkspace").hidden'), true);

    await cdp.evaluate(`(() => {
      const form = document.querySelector("#adminLoginForm");
      form.elements.email.value = "outro@preludio.test";
      form.elements.password.value = "senha-de-teste";
      form.requestSubmit();
    })()`);
    await poll(() => cdp.evaluate('document.querySelector("#accessMessage").textContent.includes("não tem permissão")'));
    assert.equal(await cdp.evaluate('document.querySelector("#adminWorkspace").hidden'), true);

    await cdp.evaluate(`(() => {
      const form = document.querySelector("#adminLoginForm");
      form.elements.email.value = "admin@preludio.test";
      form.elements.password.value = "senha-de-teste";
      form.requestSubmit();
    })()`);
    await poll(() => cdp.evaluate('!document.querySelector("#adminWorkspace").hidden && document.querySelector("#company").textContent.includes("Projeto Campi")'));
    assert.equal(await cdp.evaluate('document.querySelector("#accessPanel").hidden'), true);
  } finally {
    cdp?.socket.close();
    if (browser.exitCode === null) { browser.kill(); await once(browser, "exit"); }
    await new Promise(resolveClose => server.close(resolveClose));
    if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && basename(profile).startsWith("ep-nr1-auth-")) {
      await rm(profile, { recursive: true, force: true });
    }
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseActionParams, safeContinueUrl, actionErrorKey } from "../js/auth-action-core.js";
import { requestPasswordReset, requestEmailVerification } from "../js/account-email.js";

const here = "https://espacopreludio.com.br/conta-acao.html?mode=resetPassword&oobCode=abc";
const hereStaging = "https://espacopreludio.com.br/staging/conta-acao.html";

test("link do Firebase: aceita só modos conhecidos e códigos bem formados", () => {
  assert.deepEqual(parseActionParams("?mode=resetPassword&oobCode=Abc_123-xyzDEF&continueUrl=x"),
    { mode: "resetPassword", oobCode: "Abc_123-xyzDEF", continueUrl: "x" });
  assert.equal(parseActionParams("?mode=signIn&oobCode=Abc_123-xyzDEF").mode, "");
  assert.equal(parseActionParams("?mode=verifyEmail&oobCode=<script>").oobCode, "");
  assert.deepEqual(parseActionParams(""), { mode: "", oobCode: "", continueUrl: "" });
});

test("retorno só para páginas do próprio site, no mesmo ambiente", () => {
  assert.equal(safeContinueUrl("https://espacopreludio.com.br/recuperar.html?passo=2", here),
    "https://espacopreludio.com.br/recuperar.html?passo=2");
  assert.equal(safeContinueUrl("https://www.espacopreludio.com.br/rt-login.html", here),
    "https://www.espacopreludio.com.br/rt-login.html");
  assert.equal(safeContinueUrl("https://espacopreludio.com.br/app/recuperar.html?passo=2", here),
    "https://espacopreludio.com.br/app/recuperar.html?passo=2");
  assert.equal(safeContinueUrl("https://espacopreludio.com.br/staging/recuperar.html?passo=2", hereStaging),
    "https://espacopreludio.com.br/staging/recuperar.html?passo=2");
  for (const bad of [
    "https://evil.example/recuperar.html", "//evil.example/recuperar.html", "javascript:alert(1)",
    "https://espacopreludio.com.br.evil.example/recuperar.html", "http://espacopreludio.com.br/recuperar.html",
    "https://user:pass@espacopreludio.com.br/recuperar.html", "https://espacopreludio.com.br/staging/recuperar.html",
    "https://espacopreludio.com.br/../etc/passwd", "https://espacopreludio.com.br/js/conta-acao.js", ""
  ]) assert.equal(safeContinueUrl(bad, here), null, bad);
  assert.equal(safeContinueUrl("https://espacopreludio.com.br/recuperar.html", hereStaging), null);
});

test("erros do Firebase viram mensagens conhecidas", () => {
  assert.equal(actionErrorKey("auth/expired-action-code"), "expired");
  assert.equal(actionErrorKey("auth/invalid-action-code"), "invalid");
  assert.equal(actionErrorKey("auth/weak-password"), "weak");
  assert.equal(actionErrorKey("qualquer/coisa"), "generic");
});

test("página de ação não carrega monitoramento nem pré-renderização (o link carrega o código da conta)", async () => {
  const html = await readFile(new URL("../conta-acao.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /monitoring\.js|speculationrules/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  const script = await readFile(new URL("../js/conta-acao.js", import.meta.url), "utf8");
  assert.match(script, /history\.replaceState\(null, "", location\.pathname\)/);
});

test("e-mails de conta saem só pelo backend, com uma segunda tentativa", async () => {
  const realFetch = globalThis.fetch;
  const run = async (respond, call) => {
    const requests = [];
    globalThis.fetch = async (url, init) => { requests.push({ url, init }); return respond(); };
    try { await call(); return requests; }
    finally { globalThis.fetch = realFetch; }
  };
  const reset = () => requestPasswordReset({ backend: "https://api.test", email: "a@b.com", retorno: "paciente" });
  const ok = await run(() => new Response("{}", { status: 200 }), reset);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].url, "https://api.test/conta/redefinir-senha");
  assert.deepEqual(JSON.parse(ok[0].init.body), { email: "a@b.com", retorno: "paciente" });
  for (const respond of [() => new Response("{}", { status: 404 }), () => new Response("{}", { status: 503 }), () => { throw new TypeError("offline"); }]) {
    let attempts = 0;
    await assert.rejects(run(() => { attempts++; return respond(); }, reset), { code: "auth/network-request-failed" });
    assert.equal(attempts, 2, "tenta de novo uma vez antes de mostrar erro");
  }
  await assert.rejects(run(() => new Response("{}", { status: 429 }), reset), { code: "auth/too-many-requests" });
  await assert.rejects(run(() => new Response('{"error":"EMAIL_INVALIDO"}', { status: 400 }), reset), { code: "auth/invalid-email" });
  const user = { getIdToken: async () => "tok" };
  const verify = await run(() => new Response("{}", { status: 200 }),
    () => requestEmailVerification({ backend: "https://api.test", user, retorno: "aluno" }));
  assert.equal(verify[0].init.headers.Authorization, "Bearer tok");
});

test("nenhum fluxo envia e-mail de conta pelo Firebase (domínio *.firebaseapp.com)", async () => {
  for (const file of ["recuperar.html", "paciente-recuperar.html", "app/recuperar.html", "admin-login.html",
    "aluno-login.html", "js/instituicao-login.js", "js/rt-login.js", "js/conta-acao.js"]) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.match(source, /requestPasswordReset\(\{/, file);
    assert.doesNotMatch(source, /sendPasswordResetEmail\(auth/, file);
    assert.doesNotMatch(source, /fallback:/, file);
  }
  for (const file of ["aluno-login.html", "js/instituicao-login.js", "js/patient-auth-guard.js", "paciente-cadastro.html"]) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.match(source, /requestEmailVerification\(\{/, file);
    assert.doesNotMatch(source, /sendEmailVerification\((user|cred|credential|auth)/, file);
  }
});

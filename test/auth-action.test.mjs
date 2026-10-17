import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseActionParams, safeContinueUrl, actionErrorKey } from "../js/auth-action-core.js";

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

test("todos os pedidos de redefinição informam o retorno ao site", async () => {
  for (const file of ["recuperar.html", "paciente-recuperar.html", "app/recuperar.html", "admin-login.html",
    "aluno-login.html", "js/instituicao-login.js", "js/rt-login.js"]) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /sendPasswordResetEmail\(auth, ?email\)/, file);
    assert.match(source, /sendPasswordResetEmail\(auth, ?email, ?\{ ?url: ?new URL\(/, file);
  }
});

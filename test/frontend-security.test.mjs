import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");

test("professional and RT entry points load the shared second-factor transport", () => {
  // Behavioral transport coverage lives in twofa-session.test.mjs. This wiring
  // check ensures every independently loaded portal actually installs it.
  for (const file of ["js/auth-guard.js", "js/rt-login.js", "js/rt-painel.js"]) {
    assert.match(read(file), /import "\.\/twofa-fetch\.js\?v=20261017-mfa3"/);
  }
  assert.match(read("js/twofa-fetch.js"), /installClinicalFetch/);
  assert.match(read("js/firebase-config.js"), /installClinicalFetch/);
});

test("staging backend override cannot exfiltrate Firebase tokens", () => {
  const source = read("js/firebase-config.js");
  assert.match(source, /officialStaging/);
  assert.match(source, /url\.username \|\| url\.password/);
  assert.match(source, /!localHost && !officialStaging/);
});

test("clinical twin sends only bounded, locally decrypted summaries", () => {
  const source = read("prontuario.html");
  assert.match(source, /decryptAiSummaryPayload\(data\.encryptedPayload, dek\)/);
  assert.match(source, /JSON\.stringify\(\{ question, entries: buildClinicalTwinEntries/);
  assert.match(source, /250 \* 1024/);
  const builder = source.slice(source.indexOf("function buildClinicalTwinEntries"));
  assert.doesNotMatch(builder.slice(0, builder.indexOf("// ─── Receitas")), /transcript\s*:/);
});

test("dynamic action cards do not interpolate API data into inline handlers", () => {
  const files = [
    "admin-colaboradores.html", "admin-empresa.html", "admin-empresas.html",
    "admin-repasses.html", "notificacoes.html", "app/buscar.html", "app/chat.html",
    "app/consultas.html", "app/dependentes.html", "app/documentos.html"
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /onclick="[^"\n]*\$\{/, file);
  }
});

test("sensitive browser caches are tab-scoped or removed", () => {
  assert.doesNotMatch(read("app/dependentes.html"), /localStorage\.setItem\(`ep:dependentes/);
  assert.doesNotMatch(read("app/humor.html"), /localStorage\.setItem\([^\n]*humor/);
  assert.doesNotMatch(read("painel.html"), /localStorage\.setItem\(preNoteKey/);
  assert.match(read("mensagens.html"), /sessionStorage\.setItem\(lastMsgKey/);
  assert.match(read("empresa-login.html"), /sessionStorage\.setItem\("ep:empresa:token"/);
});

test("VAPID rotation migrates existing browser subscriptions", () => {
  const files = [
    "perfil.html",
    "paciente-mensagens.html",
    "staging/perfil.html",
    "staging/paciente-mensagens.html",
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /pushSubscriptionUsesKey/, file);
    assert.match(source, /applicationServerKey/, file);
    assert.match(source, /await .*\.unsubscribe\(\)/, file);
    assert.match(source, /method: "DELETE"/, file);
  }
});

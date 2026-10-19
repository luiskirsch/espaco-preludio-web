import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applyPortalHeaders, isImmutableAsset } from "../security/edge/worker.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const read = path => readFileSync(join(ROOT, path), "utf8");
const SKIP = new Set(["node_modules", "staging", ".git", ".github", "assets", "test", "scripts", "security", "docs", "i18n"]);
function pages(dir = "") {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith(".")) return [];
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : pages(rel);
    return entry.name.endsWith(".html") && !entry.name.startsWith("__") ? [rel] : [];
  });
}

test("otimizações de carregamento estão aplicadas e em dia (scripts/perf/build.mjs --check)", () => {
  execFileSync(process.execPath, [join(ROOT, "scripts/perf/build.mjs"), "--check", "--quiet"], { cwd: ROOT, stdio: "pipe" });
});

test("a versão pelo conteúdo é a mesma com CRLF no disco (checkout antigo do Windows) e LF (CI)", () => {
  const build = eol => {
    const dir = mkdtempSync(join(tmpdir(), "perf-eol-"));
    try {
      const write = (rel, text) => writeFileSync(join(dir, rel), text.replace(/\n/g, eol));
      mkdirSync(join(dir, "fonts"));
      writeFileSync(join(dir, "fonts/fonts.json"), "{}");
      write("index.html", '<!doctype html>\n<html><head><meta charset="utf-8">\n<script type="module" src="./a.js"></script>\n</head><body></body></html>\n');
      write("a.js", 'import { b } from "./b.js";\nconsole.log(b);\n');
      write("b.js", "export const b = 1;\n");
      execFileSync(process.execPath, [join(ROOT, "scripts/perf/build.mjs"), "--quiet"], { cwd: dir, env: { ...process.env, PERF_ROOT: dir }, stdio: "pipe" });
      const ref = (rel, name) => readFileSync(join(dir, rel), "utf8").split(`${name}?h=`)[1]?.slice(0, 10);
      return { a: ref("index.html", "a.js"), b: ref("a.js", "b.js") };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const lf = build("\n");
  assert.match(`${lf.a} ${lf.b}`, /^[0-9a-f]{10} [0-9a-f]{10}$/, "o build versiona a.js e b.js no site de exemplo");
  assert.deepEqual(build("\r\n"), lf);
});

test("páginas do site usam fontes do próprio domínio e só pré-conectam ao que usam", () => {
  for (const page of pages()) {
    const html = read(page);
    assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/, `${page}: Google Fonts`);
    assert.doesNotMatch(html, /firestore\.googleapis\.com/, `${page}: Firestore não é usado`);
    for (const m of html.matchAll(/href="((?:\.\.?\/)+fonts\/[^"?]+)\?h=[0-9a-f]{10}"/g)) {
      assert.ok(existsSync(resolve(ROOT, page, "..", m[1])), `${page}: ${m[1]} inexistente`);
    }
  }
});

test("módulos pré-carregados existem e usam a mesma URL versionada dos imports", () => {
  for (const page of pages()) {
    const html = read(page);
    const block = html.match(/<!-- ep:perf[\s\S]*?<!-- \/ep:perf -->/)?.[0] || "";
    if (/firebasejs\/[^"]+\/firebase-auth\.js/.test(html.replace(block, ""))) {
      assert.match(block, /rel="modulepreload" href="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+\/firebase-app\.js"/, page);
    }
    for (const m of block.matchAll(/rel="modulepreload" href="(\.[^"?]+)\?h=([0-9a-f]{10})"/g)) {
      assert.ok(existsSync(resolve(ROOT, page, "..", m[1])), `${page}: ${m[1]}`);
    }
    // Nenhuma referência local a JS/CSS fica sem versão pelo conteúdo (exceto o i18n, com versão própria).
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="((?:\.\.?)?\/[^"]+\.(?:js|css))(?:\?([^"]*))?"/g)) {
      if (/\/i18n\/init\.js$/.test(m[1])) continue;
      assert.match(m[2] || "", /^h=[0-9a-f]{10}$/, `${page}: ${m[1]} sem ?h=`);
    }
  }
});

test("Worker: URLs com hash de conteúdo e idiomas versionados ganham cache de 1 ano", () => {
  const css = (url, init = {}) => applyPortalHeaders(new Response("body{}", { status: init.status || 200, headers: { "Content-Type": "text/css", "Cache-Control": "max-age=600" } }), new Request(url));
  assert.equal(css("https://espacopreludio.com.br/css/app.css?h=0123456789").headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(css("https://espacopreludio.com.br/css/app.css?v=3").headers.get("Cache-Control"), "max-age=600");
  assert.equal(css("https://espacopreludio.com.br/css/app.css?h=xyz").headers.get("Cache-Control"), "max-age=600");
  assert.equal(css("https://espacopreludio.com.br/css/app.css?h=0123456789", { status: 404 }).headers.get("Cache-Control"), "max-age=600");
  assert.ok(isImmutableAsset(new URL("https://espacopreludio.com.br/i18n/locales/en-US/common.json?v=ad2a1e906")));
  assert.ok(!isImmutableAsset(new URL("https://espacopreludio.com.br/i18n/dynamic.js?v=ad2a1e906")));
  const html = applyPortalHeaders(new Response("<p>x</p>", { headers: { "Content-Type": "text/html" } }), new Request("https://espacopreludio.com.br/a.html?h=0123456789"), { nonce: "abcdefghijklmnopqrstuvwxyz012345" });
  assert.equal(html.headers.get("Cache-Control"), "private, no-store, max-age=0");
});

test("service workers: cache imutável para ?h= e o do app restrito a /app/", () => {
  for (const sw of ["sw.js", "sw-app.js"]) {
    const source = read(sw);
    assert.match(source, /searchParams\.get\("h"\)/, sw);
    const precache = source.match(/const PRECACHE(?:_URLS)? = \[([\s\S]*?)\];/)[1];
    assert.doesNotMatch(precache, /\.html"|\?v=/, `${sw}: HTML (no-store) ou arquivo versionado no pré-cache`);
  }
  assert.match(read("app/sw-register.js"), /scope: `\$\{base\}\/app\/`/);
});

test("entrada das telas do portal não esconde o conteúdo até o fim do carregamento", () => {
  assert.doesNotMatch(read("app/app.css"), /\.a-page-enter\s*\{[^}]*animation/);
});

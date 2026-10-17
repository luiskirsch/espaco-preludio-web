import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { freshNonce, handleRequest, applyPortalHeaders } from "../security/edge/worker.mjs";
import { runCspAction } from "../js/csp-actions.js";

test("HTML receives a fresh nonce in its CSP and trusted scripts, without reusable validators", async () => {
  const nonces = new Set();
  class Rewriter {
    on(selector, handler) { assert.equal(selector, "script"); this.handler = handler; return this; }
    async transform(response) {
      let nonce;
      this.handler.element({ setAttribute(name, value) { assert.equal(name, "nonce"); nonce = value; } });
      assert.match(response.headers.get("Content-Security-Policy"), new RegExp("nonce-" + nonce.replace(/[+]/g, "\\+")));
      assert.doesNotMatch(response.headers.get("Content-Security-Policy"), /script-src[^;]*'unsafe-inline'/);
      nonces.add(nonce);
      return response;
    }
  }
  for (let i = 0; i < 3; i++) {
    const response = await handleRequest(new Request("https://espacopreludio.com.br/login.html", { headers: {
      "If-None-Match": "old-etag", "If-Modified-Since": "yesterday"
    } }), async request => {
      assert.equal(request.headers.has("If-None-Match"), false);
      assert.equal(request.headers.has("If-Modified-Since"), false);
      return new Response("<script>trusted()</script>", { headers: { "Content-Type": "text/html", ETag: "old", "Content-Length": "100" } });
    }, { HtmlRewriter: Rewriter });
    assert.equal(response.headers.get("ETag"), null);
    assert.equal(response.headers.get("Content-Length"), null);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
  }
  assert.equal(nonces.size, 3);
  assert.match(freshNonce(), /^[A-Za-z0-9+/]{43}=$/);
  assert.throws(() => applyPortalHeaders(new Response("html", { headers: { "Content-Type": "text/html" } }), new Request("https://espacopreludio.com.br/")), /NONCE/);
});

test("UI actions do not interpret injected code or arbitrary global names", () => {
  const calls = [], elements = new Map([["cancelModal", { style: { display: "grid" } }]]);
  const context = { window: { showTab: tab => calls.push(tab), location: {} }, document: { getElementById: id => elements.get(id) } };
  assert.equal(runCspAction("tab-upcoming", context), true);
  assert.equal(runCspAction("close-cancel", context), true);
  assert.equal(elements.get("cancelModal").style.display, "none");
  assert.deepEqual(calls, ["prox"]);
  for (const injected of ["alert(1)", "location='https://evil.invalid'", "constructor", "__proto__"]) assert.equal(runCspAction(injected, context), false);
});

test("static pages and runtime templates contain no executable HTML event attributes", () => {
  const files = execFileSync("git", ["ls-files", "*.html", "*.js"], { encoding: "utf8" }).trim().split(/\r?\n/)
    .filter(name => !/^(?:staging|i18n|test)\//.test(name));
  for (const name of files) {
    const text = readFileSync(name, "utf8");
    assert.doesNotMatch(text, /\bon[a-z]+\s*=\s*["']/, name);
    assert.doesNotMatch(text, /setAttribute\(\s*["']on[a-z]+["']/, name);
  }
});

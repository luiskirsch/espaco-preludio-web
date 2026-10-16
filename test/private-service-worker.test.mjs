import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

for (const filename of ["sw.js", "sw-app.js"]) {
  function fixture() {
    const listeners = new Map(), writes = [];
    vm.runInNewContext(readFileSync(new URL("../" + filename, import.meta.url), "utf8"), {
      self: { location: { origin: "https://espacopreludio.com.br" },
        addEventListener: (name, fn) => listeners.set(name, fn), skipWaiting() {} },
      URL, Response, Promise,
      fetch: async () => new Response("private response", { headers: { "Cache-Control": "private, no-store" } }),
      caches: { open: async () => ({ put: async (...args) => writes.push(args) }), match: async () => undefined }
    });
    return { listeners, writes };
  }
  test(filename + " excludes credentials, external requests, and secret-bearing URLs from caching", () => {
    const { listeners } = fixture();
    for (const options of [
      { url: "https://espacopreludio.com.br/api/data", headers: new Headers({ Authorization: "Bearer test" }) },
      { url: "https://firestore.googleapis.com/v1/projects/test/documents/data" },
      { url: "https://espacopreludio.com.br/documento-publico.html?token=secret" }
    ]) {
      let intercepted = false;
      listeners.get("fetch")({ request: { method: "GET", mode: "navigate", destination: "document", headers: new Headers(), ...options }, respondWith() { intercepted = true; } });
      assert.equal(intercepted, false, options.url);
    }
  });
  test(filename + " honors no-store for navigation and installation precache", async () => {
    const { listeners, writes } = fixture();
    let response;
    listeners.get("fetch")({ request: { method: "GET", mode: "navigate", destination: "document", headers: new Headers(), url: "https://espacopreludio.com.br/painel.html" }, respondWith(promise) { response = promise; } });
    assert.equal((await response).status, 200);
    assert.equal(writes.length, 0);
    let installed;
    listeners.get("install")({ waitUntil(promise) { installed = promise; } });
    await installed;
    assert.equal(writes.length, 0);
  });
}

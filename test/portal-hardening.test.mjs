import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryTable } from "../js/db.js";
import { cachedGet } from "../js/api-cache.js";
import { applyPortalHeaders, handleRequest, portalPolicy } from "../security/edge/worker.mjs";

test("patient cache cannot survive a new page instance or mutate stored values by reference", async () => {
  const first = createMemoryTable("uid"), second = createMemoryTable("uid");
  const row = { uid: "patient-a", profile: { name: "Private" } };
  await first.put(row); row.profile.name = "changed";
  assert.equal((await first.get("patient-a")).profile.name, "Private");
  assert.equal(await first.get("patient-b"), undefined);
  assert.equal(await second.get("patient-a"), undefined);
  await first.clear(); assert.equal(await first.get("patient-a"), undefined);
});

test("an unauthorized read cannot render a previously successful clinical response", async t => {
  let allowed = true;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "omit");
    return Response.json(allowed ? { ok: true, items: ["own-session"] } : { ok: false, error: "TOKEN_INVALIDO" }, { status: allowed ? 200 : 401 });
  });
  const rendered = [];
  const args = { url: "https://api.example.invalid/therapy/sessoes", uid: "patient-a", idToken: "test", key: "sessions", onData: data => rendered.push(data) };
  await cachedGet(args); allowed = false;
  await assert.rejects(cachedGet(args), { code: "TOKEN_INVALIDO" });
  assert.equal(rendered.length, 1);
});

test("portal headers preserve video permissions, HTML, status, and existing cookies", async () => {
  const response = applyPortalHeaders(new Response("<html>test</html>", { status: 403, headers: {
    "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "session=opaque; Secure; HttpOnly",
    "X-Powered-By": "server", "Cache-Control": "public, max-age=3600"
  } }), new Request("https://espacopreludio.com.br/app/login.html"), { nonce: "synthetic-test-nonce-0123456789" });
  assert.equal(response.status, 403); assert.equal(await response.text(), "<html>test</html>");
  assert.match(response.headers.get("Permissions-Policy"), /camera=\(self\), microphone=\(self\)/);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.match(response.headers.get("Strict-Transport-Security"), /max-age=/);
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly/);
  assert.equal(response.headers.get("X-Powered-By"), null);
  assert.match(response.headers.get("Content-Security-Policy"), /connect-src/);
  assert.match(response.headers.get("Content-Security-Policy"), /'nonce-synthetic-test-nonce-0123456789'/);
  assert.match(response.headers.get("Content-Security-Policy"), /script-src-attr 'none'/);
  assert.doesNotMatch(response.headers.get("Content-Security-Policy"), /script-src[^;]*'unsafe-inline'/);
  assert.equal(response.headers.get("Content-Security-Policy-Report-Only"), null);
});

test("production CSP does not authorize the staging API, and static cache headers survive", () => {
  assert.doesNotMatch(portalPolicy("/app/home.html"), /osl-video-server-staging/);
  assert.match(portalPolicy("/staging/app/home.html"), /osl-video-server-staging/);
  const response = applyPortalHeaders(new Response("body{}", { headers: { "Content-Type": "text/css", "Cache-Control": "public, max-age=600" } }), new Request("https://espacopreludio.com.br/css/app.css"));
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=600");
});

test("edge layer rejects foreign hosts and upgrades HTTP before contacting the origin", async () => {
  const origin = () => { throw Error("must not fetch"); };
  assert.equal((await handleRequest(new Request("https://attacker.invalid/"), origin)).status, 421);
  const redirect = await handleRequest(new Request("http://espacopreludio.com.br/app/login.html"), origin);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("Location"), "https://espacopreludio.com.br/app/login.html");
});

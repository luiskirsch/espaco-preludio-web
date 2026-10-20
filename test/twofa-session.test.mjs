import test from "node:test";
import assert from "node:assert/strict";
import { createClinicalFetch, get2faSessionToken, verificationRedirect, isRtAuthContext, isCollaboratorAuthContext, mfaNavigation, safeMfaReturn } from "../js/twofa-session.js";

function fixture(response = Response.json({ ok: true })) {
  const calls = [], redirects = [];
  const entries = new Map([["ep:twofa-session", JSON.stringify({ token: "opaque-second-factor", savedAt: Date.now() })]]);
  const storage = { getItem: key => entries.get(key), removeItem: key => entries.delete(key) };
  const location = { href: "https://portal.example.invalid/staging/rt-painel.html", pathname: "/staging/rt-painel.html", search: "?tab=team", hash: "", replace: url => redirects.push(url) };
  const fetch = createClinicalFetch({ backend: "https://api.example.invalid", storage, location,
    fetch: async (input, init) => { calls.push({ input, init }); return response.clone(); } });
  return { fetch, entries, storage, location, calls, redirects };
}

test("second factor reaches authorized therapy and RT requests with private fetch options", async () => {
  const f = fixture();
  for (const path of ["/therapy/profissional/me", "/rt/me", "/RT/dashboard"]) {
    await f.fetch("https://api.example.invalid" + path, { headers: { Authorization: "Bearer synthetic" } });
    const { init } = f.calls.at(-1);
    assert.equal(init.headers.get("X-Therapy-2FA"), "opaque-second-factor");
    assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "omit");
  }
  await f.fetch(new Request("https://api.example.invalid/rt/me", { headers: { Authorization: "Bearer request-token" } }));
  assert.equal(f.calls.at(-1).init.headers.get("Authorization"), "Bearer request-token");
});

test("second factor never leaks to another origin, a game route, or an anonymous invitation", async () => {
  const f = fixture();
  for (const url of ["https://attacker.invalid/therapy/me", "https://api.example.invalid/game/me", "https://api.example.invalid.evil.invalid/rt/me"]) {
    await f.fetch(url, { headers: { Authorization: "Bearer synthetic" } });
    assert.equal(new Headers(f.calls.at(-1).init.headers).has("X-Therapy-2FA"), false);
  }
  await f.fetch("https://api.example.invalid/therapy/sessao/join");
  assert.equal(f.calls.at(-1).init.headers.has("X-Therapy-2FA"), false);
});

test("server challenges clear stale proof and redirect once while preserving the RT return page", async () => {
  const f = fixture(Response.json({ error: "TWOFA_REQUIRED" }, { status: 401 }));
  for (let i = 0; i < 2; i++) {
    const response = await f.fetch("https://api.example.invalid/rt/me");
    assert.equal((await response.json()).error, "TWOFA_REQUIRED");
  }
  assert.equal(f.entries.size, 0); assert.equal(f.redirects.length, 1);
  const redirect = new URL(f.redirects[0], f.location.href);
  assert.equal(redirect.pathname, "/staging/2fa-verify.html");
  assert.equal(redirect.searchParams.get("redirect"), "./rt-painel.html?tab=team");
  assert.equal(redirect.searchParams.get("context"), "rt");
  assert.equal(isRtAuthContext(redirect.pathname, redirect.search), true);
  assert.equal(verificationRedirect({ pathname: "/painel.html", search: "", hash: "" }), "./2fa-verify.html?redirect=.%2Fpainel.html");
  assert.equal(verificationRedirect({ pathname: "/staging/app/home.html", search: "", hash: "" }), "../2fa-verify.html?redirect=.%2Fapp%2Fhome.html");
  assert.equal(safeMfaReturn("./app/home.html"), "./app/home.html");
  assert.equal(safeMfaReturn("./app/../evil.html"), "./painel.html");
});

test("MFA verification keeps RT Firebase Auth isolated from the professional login", () => {
  assert.equal(isRtAuthContext("/rt-login.html"), true);
  assert.equal(isRtAuthContext("/staging/rt-painel.html"), true);
  assert.equal(isRtAuthContext("/2fa-verify.html", "?context=rt"), true);
  assert.equal(isRtAuthContext("/staging/2fa-verify.html", "?context=rt"), true);
  assert.equal(isRtAuthContext("/2fa-verify.html", "?redirect=./rt-painel.html"), true);
  assert.equal(isRtAuthContext("/2fa-verify.html", "?redirect=https://evil.invalid/rt-painel.html"), false);
  assert.equal(isRtAuthContext("/2fa-verify.html", "?redirect=//evil.invalid/rt-painel.html"), false);
  assert.equal(isRtAuthContext("/painel.html", "?context=rt"), false);
});

test("ordinary auth errors and the verification page do not trigger a second-factor redirect loop", async () => {
  const ordinary = fixture(Response.json({ error: "TOKEN_INVALIDO" }, { status: 401 }));
  await ordinary.fetch("https://api.example.invalid/rt/me");
  assert.equal(ordinary.redirects.length, 0);
  const verify = fixture(Response.json({ error: "TWOFA_SESSION_INVALID" }, { status: 401 }));
  verify.location.pathname = "/staging/2fa-verify.html";
  await verify.fetch("https://api.example.invalid/therapy/2fa/verify");
  assert.equal(verify.redirects.length, 0);
});

test('collaborator authentication follows the portal through MFA without crossing into another account context', () => {
  for (const path of ['/app/login.html', '/app/home.html', '/app/diario.html', '/staging/app/perfil.html', '/staging/app/']) {
    assert.equal(isCollaboratorAuthContext(path), true, path);
  }
  const location = { pathname: '/staging/app/diario.html', search: '?page=4', hash: '#writing' };
  const redirect = new URL(verificationRedirect(location), 'https://portal.example.invalid/staging/app/diario.html');
  assert.equal(isCollaboratorAuthContext(redirect.pathname, redirect.search), true);
  assert.deepEqual(mfaNavigation('collaborator', redirect.searchParams.get('redirect')), {
    destination: './app/diario.html?page=4#writing', loginPage: './app/login.html?redirect=.%2Fdiario.html%3Fpage%3D4%23writing'
  });
  for (const target of ['https://evil.invalid/app/home.html', '//evil.invalid/app/home.html', './app/../painel.html', './painel.html', null]) {
    assert.equal(isCollaboratorAuthContext('/2fa-verify.html', '?redirect=' + encodeURIComponent(target)), false);
    assert.equal(mfaNavigation('collaborator', target).destination, './app/home.html');
  }
  for (const path of ['/login.html', '/painel.html', '/aluno-diario.html', '/paciente-painel.html', '/instituicao-painel.html', '/rt-painel.html']) {
    assert.equal(isCollaboratorAuthContext(path), false, path);
  }
  assert.equal(isCollaboratorAuthContext('/2fa-verify.html', '?context=rt&redirect=./app/home.html'), false);
  assert.deepEqual(mfaNavigation('rt', './rt-painel.html'), { destination: './rt-painel.html', loginPage: './rt-login.html' });
});

test('collaborator MFA proof is independent of professional proof and a challenge clears only its own session', async () => {
  const f = fixture(Response.json({ error: 'TWOFA_REQUIRED' }, { status: 401 }));
  f.location.pathname = '/app/diario.html'; f.location.search = ''; f.location.href = 'https://portal.example.invalid/app/diario.html';
  f.entries.set('ep:twofa-session:collaborator', JSON.stringify({ token: 'collaborator-proof', savedAt: Date.now() }));
  assert.equal(get2faSessionToken(f.storage, f.location), 'collaborator-proof');
  assert.equal(get2faSessionToken(f.storage, { pathname: '/painel.html' }), 'opaque-second-factor');
  await f.fetch('https://api.example.invalid/therapy/paciente/diario', { headers: { Authorization: 'Bearer collaborator-user' } });
  assert.equal(f.calls[0].init.headers.get('X-Therapy-2FA'), 'collaborator-proof');
  assert.equal(f.entries.has('ep:twofa-session:collaborator'), false);
  assert.equal(f.entries.has('ep:twofa-session'), true);
  const target = new URL(f.redirects[0], f.location.href);
  assert.equal(isCollaboratorAuthContext(target.pathname, target.search), true);
  assert.equal(get2faSessionToken(f.storage, f.location), '', 'A professional proof never substitutes the missing collaborator proof');
});

test("malformed, expired and future session entries are ignored", () => {
  const f = fixture();
  for (const entry of ["not-json", "null", JSON.stringify({ token: {}, savedAt: Date.now() }),
    JSON.stringify({ token: "expired", savedAt: Date.now() - 9 * 3600_000 }), JSON.stringify({ token: "future", savedAt: Date.now() + 60_000 })]) {
    f.entries.set("ep:twofa-session", entry);
    assert.equal(get2faSessionToken(f.storage), "");
  }
});

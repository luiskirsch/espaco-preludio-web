import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/support-account.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");

test("account translations preserve accents instead of replacement question marks", () => {
  for (const lang of ["pt-BR", "en-US", "es-ES"]) {
    const dict = JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}/suporte.json`, import.meta.url), "utf8"));
    for (const value of [...Object.values(dict.account), dict.faq.q9.a]) {
      assert.doesNotMatch(value, /[\p{L}]\?[\p{L}]|\?\?|\uFFFD/u, `${lang}: ${value}`);
    }
    assert.ok(dict.account.processing.endsWith("…"));
    if (lang === "pt-BR") assert.match(dict.account.noSubscription, /não.*Você/u);
    if (lang === "es-ES") assert.match(dict.account.title, /suscripción/u);
  }
});

function setup({ therapist = {}, ok = true } = {}) {
  const elements = new Map();
  const calls = [];
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set(id === "closeAccountForm" ? ["ep-hide"] : []);
      elements.set(id, {
        value: "", disabled: false, textContent: "", handlers: {}, attrs: {},
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        addEventListener(name, fn) { this.handlers[name] = fn; },
        setAttribute(name, value) { this.attrs[name] = value; },
        removeAttribute() {}, focus() {}, reset() {}
      });
    }
    return elements.get(id);
  };
  const context = {
    document: { getElementById: element, addEventListener() {} },
    window: { confirm: () => true, location: { replace: path => calls.push(["redirect", path]) } },
    auth: { currentUser: { getIdToken: async () => "fresh-token" } },
    BACKEND_BASE_URL: "https://backend.test",
    fetch: async (url, options) => {
      calls.push(["request", url, options]);
      return { ok, json: async () => ({ ok }) };
    },
    signOut: async () => calls.push(["signOut"]),
    clearDek: () => calls.push(["clearDek"])
  };
  vm.runInNewContext(source, context);
  context.setupAccountControls({ therapist });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { element, calls, flush };
}

test("help bubble leads to support where closure is available to exempt accounts", () => {
  const guard = readFileSync(new URL("../js/auth-guard.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../suporte.html", import.meta.url), "utf8");
  assert.match(guard, /help.href = "\.\/suporte.html"/);
  assert.ok(html.indexOf('id="conta-assinatura"') < html.indexOf("<!-- Contato -->"));
  const { element } = setup({ therapist: { legacyExempt: true } });
  assert.equal(element("cancelSubscriptionBtn").disabled, true);
  element("showCloseAccountBtn").handlers.click();
  assert.equal(element("closeAccountForm").classList.contains("ep-hide"), false);
  assert.equal(element("showCloseAccountBtn").attrs["aria-expanded"], "true");
});

test("closure requires typed confirmation before making any request", async () => {
  const { element, calls, flush } = setup();
  element("closeAccountForm").handlers.submit({ preventDefault() {} });
  await flush();
  assert.deepEqual(calls, []);
  assert.match(element("accountStatus").textContent, /ENCERRAR/);
});

test("failed closure preserves the session and allows retry", async () => {
  const { element, calls, flush } = setup({ ok: false });
  element("closeAccountConfirmation").value = "ENCERRAR";
  element("closeAccountForm").handlers.submit({ preventDefault() {} });
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(element("closeAccountBtn").disabled, false);
  assert.match(element("accountStatus").textContent, /Não foi possível/);
});

test("successful closure sends fresh authorization and signs out after confirmation", async () => {
  const { element, calls, flush } = setup();
  element("closeAccountConfirmation").value = "ENCERRAR";
  element("closeAccountForm").handlers.submit({ preventDefault() {} });
  await flush();
  assert.match(calls[0][1], /\/conta\/encerrar$/);
  assert.equal(calls[0][2].headers.Authorization, "Bearer fresh-token");
  assert.deepEqual(JSON.parse(calls[0][2].body), { confirmation: "ENCERRAR" });
  assert.deepEqual(calls.slice(1), [["clearDek"], ["signOut"], ["redirect", "./login.html"]]);
});

test("subscription cancellation keeps the session and prevents another cancellation", async () => {
  const { element, calls, flush } = setup({ therapist: { mpPreapprovalId: "subscription", plano: "empresa" } });
  assert.equal(element("cancelSubscriptionBtn").disabled, false);
  element("cancelSubscriptionBtn").handlers.click();
  await flush();
  assert.equal(calls.length, 1);
  assert.match(calls[0][1], /\/plano\/cancelar$/);
  assert.equal(element("cancelSubscriptionBtn").disabled, true);
  assert.equal(element("showCloseAccountBtn").disabled, false);
});

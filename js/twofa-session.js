// Shared second-factor transport for clinical and technical portals.
const KEY = "ep:twofa-session";
const TTL = 8 * 60 * 60 * 1000;

export function get2faSessionToken(storage) {
  try {
    storage ||= globalThis.sessionStorage;
    const entry = JSON.parse(storage.getItem(KEY) || "null");
    if (!entry || typeof entry.token !== "string" || !entry.token || !Number.isFinite(entry.savedAt)) return "";
    if (entry.savedAt > Date.now() || Date.now() - entry.savedAt >= TTL) {
      storage.removeItem(KEY); return "";
    }
    return entry.token;
  } catch { return ""; }
}
export function save2faSession(token) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ token, savedAt: Date.now() })); } catch {}
}
export function clear2faSession(storage) {
  try { (storage || globalThis.sessionStorage).removeItem(KEY); } catch {}
}
export function hasValid2faSession() { return !!get2faSessionToken(); }
export function isTwoFactorChallenge(error) {
  return ["TWOFA_REQUIRED", "TWOFA_SESSION_INVALID"].includes(typeof error === "string" ? error : error?.message);
}
export function verificationRedirect(location) {
  // The verification page accepts ./relative paths; preserve the current page
  // inside the same production/staging directory without an external redirect.
  const target = "./" + location.pathname.split("/").at(-1) + location.search + location.hash;
  return "./2fa-verify.html?redirect=" + encodeURIComponent(target);
}

export function createClinicalFetch({ fetch: nativeFetch, backend, location, storage }) {
  let redirecting = false;
  return async function clinicalFetch(input, init = {}) {
    let url;
    try {
      const raw = typeof input === "string" || input instanceof URL ? input : input?.url;
      url = new URL(raw, location.href);
    } catch { return nativeFetch(input, init); }
    if (url.origin !== new URL(backend).origin || !/^\/(?:therapy|rt)\//i.test(url.pathname)) {
      return nativeFetch(input, init);
    }
    const requestHeaders = typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init.headers || requestHeaders);
    const token = get2faSessionToken(storage);
    if (token && headers.has("Authorization") && !headers.has("X-Therapy-2FA")) headers.set("X-Therapy-2FA", token);
    const response = await nativeFetch(input, { ...init, headers, cache: "no-store", credentials: "omit" });
    if (response.status === 401 && !location.pathname.endsWith("/2fa-verify.html")) {
      const data = await response.clone().json().catch(() => ({}));
      if (isTwoFactorChallenge(data.error)) {
        clear2faSession(storage);
        if (!redirecting) { redirecting = true; location.replace(verificationRedirect(location)); }
      }
    }
    return response;
  };
}

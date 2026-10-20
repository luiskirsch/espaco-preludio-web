// Shared second-factor transport for clinical and technical portals.
const KEY = "ep:twofa-session";
const TTL = 2 * 60 * 60 * 1000;
const sessionKey = location => isCollaboratorAuthContext(location?.pathname || '', location?.search || '') ? KEY + ':collaborator' : KEY;

export function get2faSessionToken(storage, location = globalThis.location) {
  try {
    storage ||= globalThis.sessionStorage;
    const key = sessionKey(location);
    const entry = JSON.parse(storage.getItem(key) || "null");
    if (!entry || typeof entry.token !== "string" || !entry.token || !Number.isFinite(entry.savedAt)) return "";
    if (entry.savedAt > Date.now() || Date.now() - entry.savedAt >= TTL) {
      storage.removeItem(key); return "";
    }
    return entry.token;
  } catch { return ""; }
}
export function save2faSession(token) {
  try { sessionStorage.setItem(sessionKey(globalThis.location), JSON.stringify({ token, savedAt: Date.now() })); } catch {}
}
export function clear2faSession(storage, location = globalThis.location) {
  try { (storage || globalThis.sessionStorage).removeItem(sessionKey(location)); } catch {}
}
export function hasValid2faSession() { return !!get2faSessionToken(); }
export function isTwoFactorChallenge(error) {
  return ["TWOFA_REQUIRED", "TWOFA_SESSION_INVALID", "TWOFA_ENROLLMENT_REQUIRED"].includes(typeof error === "string" ? error : error?.message);
}
export function isRtAuthContext(pathname, search = "") {
  if (/\/rt-(?:login|painel)\.html$/.test(pathname)) return true;
  if (!pathname.endsWith("/2fa-verify.html")) return false;
  const params = new URLSearchParams(search);
  // Also accept the narrow relative return path emitted by the previous release.
  return params.get("context") === "rt" || /^\.\/rt-(?:login|painel)\.html(?:[?#]|$)/.test(params.get("redirect") || "");
}
export function isCollaboratorAuthContext(pathname, search = "") {
  if (/\/app(?:\/|$)/.test(pathname)) return true;
  if (!pathname.endsWith('/2fa-verify.html') || isRtAuthContext(pathname, search)) return false;
  const target = new URLSearchParams(search).get('redirect');
  return typeof target === 'string' && target.startsWith('./app/') && safeMfaReturn(target, '') === target;
}
export function mfaNavigation(context, rawReturn) {
  const collaborator = context === 'collaborator';
  const fallback = collaborator ? './app/home.html' : context === 'rt' ? './rt-painel.html' : './painel.html';
  let destination = safeMfaReturn(rawReturn, fallback);
  if (collaborator && !destination.startsWith('./app/')) destination = fallback;
  const loginPage = collaborator ? './app/login.html?redirect=' + encodeURIComponent(destination.replace('./app/', './'))
    : context === 'rt' ? './rt-login.html' : './login.html';
  return { destination, loginPage };
}
export function verificationRedirect(location) {
  // The verification page accepts ./relative paths; preserve the current page
  // inside the same production/staging directory without an external redirect.
  // Pages under /app/ (patient/collaborator portal) live one level down: the
  // verification page is in the parent directory and the return path keeps app/.
  const parts = location.pathname.split("/");
  const inApp = parts.at(-2) === "app";
  const target = "./" + (inApp ? "app/" : "") + parts.at(-1) + location.search + location.hash;
  return (inApp ? "../" : "./") + "2fa-verify.html?redirect=" + encodeURIComponent(target) +
    (isRtAuthContext(location.pathname, location.search) ? "&context=rt" : "");
}
export function safeMfaReturn(raw, fallback = "./painel.html") {
  return typeof raw === "string" && /^\.\/(?:app\/)?[A-Za-z0-9_-]+\.html(?:[?#][A-Za-z0-9_.?=&%#-]*)?$/.test(raw) ? raw : fallback;
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
    const token = get2faSessionToken(storage, location);
    if (token && headers.has("Authorization") && !headers.has("X-Therapy-2FA")) headers.set("X-Therapy-2FA", token);
    const response = await nativeFetch(input, { ...init, headers, cache: "no-store", credentials: "omit" });
    if (response.status === 401 && !location.pathname.endsWith("/2fa-verify.html")) {
      const data = await response.clone().json().catch(() => ({}));
      if (isTwoFactorChallenge(data.error)) {
        clear2faSession(storage, location);
        if (!redirecting) { redirecting = true; location.replace(verificationRedirect(location)); }
      }
    }
    return response;
  };
}

const FETCH_INSTALLATION = Symbol.for("ep.clinical.fetch.v3");
export function installClinicalFetch({ backend, scope = globalThis }) {
  if (!scope.location || typeof scope.fetch !== "function") return;
  const previous = scope[FETCH_INSTALLATION];
  if (previous?.backend === backend && scope.fetch === previous.fetch) return;
  let storage; try { storage = scope.sessionStorage; } catch {}
  const nativeFetch = previous?.nativeFetch || scope.fetch.bind(scope);
  const wrapped = createClinicalFetch({ fetch: nativeFetch, backend, location: scope.location, storage });
  scope.fetch = wrapped;
  scope[FETCH_INSTALLATION] = { backend, nativeFetch, fetch: wrapped };
}

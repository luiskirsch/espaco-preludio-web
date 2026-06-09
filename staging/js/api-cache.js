// Espaço Prelúdio — cache SWR genérico para endpoints de listagem do backend.
//
// Camadas de cache:
//   1. sessionStorage (quente, 30s)  — dados da aba atual. Sync, zero-latência.
//   2. IndexedDB/Dexie (morno, 30min) — sobrevive ao fechar/reabrir aba.
//
// Pattern: stale-while-revalidate (SWR).
//   - sessionStorage: onData(cached, "stale") síncrono via microtask (instantâneo).
//   - IndexedDB (se sessionStorage vazio): onData(cached, "stale") async (~1-5ms).
//   - Fetch fresh: onData(fresh, "fresh") após roundtrip — só chamado se mudou.
//
// Uso:
//   import { cachedGet, invalidate } from "./js/api-cache.js?v=4";
//   cachedGet({ url, idToken, uid, key: "sessoes", ttl: 30_000, onData: (d, src) => render(d) });
//   invalidate("sessoes", uid); // após mutação

import db from "./db.js";

const NS          = "ep:api:v1:";
const IDB_NS      = "ep:api:idb:v1:";
const DEFAULT_TTL = 30_000;
const IDB_TTL     = 30 * 60_000;

function makeKey(scope, uid)    { return NS    + scope + ":" + uid; }
function makeIdbKey(scope, uid) { return IDB_NS + scope + ":" + uid; }

// ── sessionStorage (quente, 30s) ──────────────────────────────────────────

function readCache(scope, uid) {
  try {
    const raw = sessionStorage.getItem(makeKey(scope, uid));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.t > (entry.ttl || DEFAULT_TTL)) return null;
    return entry.data;
  } catch { return null; }
}

function writeCache(scope, uid, data, ttl) {
  try {
    sessionStorage.setItem(makeKey(scope, uid), JSON.stringify({
      t: Date.now(), ttl: ttl || DEFAULT_TTL, data
    }));
  } catch {}
}

// ── IndexedDB (morno, 30min) ──────────────────────────────────────────────

async function readIdb(scope, uid) {
  try {
    const entry = await db.apiCache.get(makeIdbKey(scope, uid));
    if (!entry) return null;
    if (Date.now() - entry.t > IDB_TTL) return null;
    return entry.data;
  } catch { return null; }
}

function writeIdb(scope, uid, data) {
  db.apiCache.put({ key: makeIdbKey(scope, uid), t: Date.now(), data }).catch(() => {});
}

function removeIdb(scope, uid) {
  db.apiCache.delete(makeIdbKey(scope, uid)).catch(() => {});
}

async function removeIdbByPrefix(prefix, uid) {
  try {
    const root = makeIdbKey(prefix, uid);
    const variant = root + ":";
    const keys = await db.apiCache.toCollection().primaryKeys();
    const toDelete = keys.filter(k => k === root || k.startsWith(variant));
    if (toDelete.length) await db.apiCache.bulkDelete(toDelete);
  } catch {}
}

// ── Invalidação pública ───────────────────────────────────────────────────

export function invalidate(scope, uid) {
  try { sessionStorage.removeItem(makeKey(scope, uid)); } catch {}
  removeIdb(scope, uid);
}

export function invalidatePrefix(prefix, uid) {
  try {
    const root = makeKey(prefix, uid);
    const variant = root + ":";
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k === root || (k && k.startsWith(variant))) toRemove.push(k);
    }
    toRemove.forEach(k => sessionStorage.removeItem(k));
  } catch {}
  removeIdbByPrefix(prefix, uid);
}

// ── cachedGet ─────────────────────────────────────────────────────────────

export function cachedGet({ url, idToken, uid, key, ttl, onData, getFreshToken }) {
  // 1. sessionStorage (sync — dispara microtask se tiver cache quente).
  const ssCache = readCache(key, uid);
  if (ssCache) queueMicrotask(() => onData?.(ssCache, "stale"));

  return (async () => {
    // 2. IndexedDB — só consulta se sessionStorage estava vazio.
    let cached = ssCache;
    if (!cached) {
      cached = await readIdb(key, uid);
      if (cached) {
        writeCache(key, uid, cached, ttl); // aquece sessionStorage para próximas leituras
        onData?.(cached, "stale");
      }
    }

    async function doFetch(token) {
      const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    }

    // 3. Fetch fresh em background.
    let { res, data } = await doFetch(idToken);
    const tokenInvalid = res.status === 401 || data?.error === "TOKEN_INVALIDO";
    if (tokenInvalid && getFreshToken) {
      const fresh = await getFreshToken();
      if (fresh) ({ res, data } = await doFetch(fresh));
    }
    if (!res.ok || data?.ok === false) {
      const err = new Error(data?.error || ("HTTP_" + res.status));
      err.code = data?.error || ("HTTP_" + res.status);
      throw err;
    }
    writeCache(key, uid, data, ttl);
    writeIdb(key, uid, data);
    if (!cached || JSON.stringify(cached) !== JSON.stringify(data)) {
      onData?.(data, "fresh");
    }
    return data;
  })();
}

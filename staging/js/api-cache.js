// Validate authorization on every read. Clinical responses are never restored
// from browser storage or rendered before the server accepts the session.
import db from "./db.js";

const NS = "ep:api:v1:";
const makeKey = (scope, uid) => NS + scope + ":" + uid;

if (typeof sessionStorage !== "undefined") {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(NS)) sessionStorage.removeItem(key);
    }
  } catch { /* storage disabled */ }
}

export function invalidate(scope, uid) {
  return db.apiCache.delete(makeKey(scope, uid));
}

export async function invalidatePrefix(prefix, uid) {
  const keys = await db.apiCache.toCollection().primaryKeys();
  await db.apiCache.bulkDelete(keys.filter(key =>
    key.startsWith(NS + prefix) && key.endsWith(":" + uid)));
}

export async function cachedGet({ url, idToken, uid, key, onData, getFreshToken }) {
  async function read(token) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "omit", cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }
  let { res, data } = await read(idToken);
  if (res.status === 401 && getFreshToken) {
    const fresh = await getFreshToken();
    if (fresh) ({ res, data } = await read(fresh));
  }
  if (!res.ok || data?.ok === false) {
    await invalidate(key, uid);
    const error = new Error(data?.error || "HTTP_" + res.status);
    error.code = data?.error || "HTTP_" + res.status;
    throw error;
  }
  await db.apiCache.put({ key: makeKey(key, uid), data });
  onData?.(data, "fresh");
  return data;
}

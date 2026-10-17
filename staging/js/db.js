// Page-memory cache shared by api-cache.js and auth-guard.js?v=20261017-mfa3.
export function createMemoryTable(primaryKey) {
  const rows = new Map();
  return {
    async get(key) { return rows.has(key) ? structuredClone(rows.get(key)) : undefined; },
    async put(row) {
      const key = row[primaryKey];
      if (key == null) throw new TypeError("Missing cache key");
      rows.set(key, structuredClone(row));
      return key;
    },
    async delete(key) { rows.delete(key); },
    async clear() { rows.clear(); },
    async bulkDelete(keys) { for (const key of keys) rows.delete(key); },
    toCollection() { return { async primaryKeys() { return [...rows.keys()]; } }; }
  };
}

// No patient response or professional profile is persisted in IndexedDB.
// Remove the old cache without touching Firebase's separate auth database.
if (typeof indexedDB !== "undefined") {
  try { indexedDB.deleteDatabase("ep_db"); } catch { /* unavailable storage */ }
}
const db = { apiCache: createMemoryTable("key"), profile: createMemoryTable("uid") };

if (typeof sessionStorage !== "undefined") {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith("ep:api:") || /^ep:profile:v\d+$/.test(key))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch { /* unavailable storage */ }
}

// Migração única: remove chaves antigas de localStorage (substituídas pelo IDB).
if (typeof localStorage !== "undefined") {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("ep:api:ls:v1:") || k === "ep:profile:ls:v2")) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

export default db;

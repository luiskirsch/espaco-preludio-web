// IndexedDB via Dexie.js — instância compartilhada por api-cache.js e auth-guard.js.
import Dexie from "https://cdn.jsdelivr.net/npm/dexie@4/dist/dexie.mjs";

const db = new Dexie("ep_db");
db.version(1).stores({
  apiCache: "key, t",
  profile:  "uid, t"
});

// Migração única: remove chaves antigas de localStorage (substituídas pelo IDB).
if (!localStorage.getItem("ep:idb:migrated:v1")) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("ep:api:ls:v1:") || k === "ep:profile:ls:v2")) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
  try { localStorage.setItem("ep:idb:migrated:v1", "1"); } catch {}
}

export default db;

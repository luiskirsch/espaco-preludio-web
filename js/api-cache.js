// Espaço Prelúdio — cache SWR genérico para endpoints de listagem do backend.
//
// Camadas de cache:
//   1. sessionStorage (quente, 30s) — dados da aba atual.
//   2. localStorage   (morno, 5min) — sobrevive ao fechar/reabrir aba.
//
// Pattern: stale-while-revalidate (SWR).
//   - Cache quente ou morno: onData(cached, "stale") IMEDIATAMENTE,
//     depois revalida em background; se mudou, chama onData(fresh, "fresh").
//   - Sem cache: fetch normal + grava ambas as camadas + onData(data, "fresh").
//
// Use pra GET de listagem onde dados são raramente mutados pelo próprio user
// na janela do TTL: /sessoes, /pacientes, /blackouts, /documentos.
// NÃO use pra ações (criar/deletar/editar) — essas devem invalidar o cache.
//
// Uso:
//   import { cachedGet, invalidate } from "./js/api-cache.js?v=3";
//   cachedGet({
//     url: `${BACKEND_BASE_URL}/therapy/sessoes`,
//     idToken, uid, key: "sessoes", ttl: 30_000,
//     onData: (data, source) => render(data.sessions)
//   });
//
//   // Depois de criar/cancelar/encerrar consulta:
//   invalidate("sessoes", uid);

const NS = "ep:api:v1:";
const LS_NS = "ep:api:ls:v1:";
const DEFAULT_TTL_MS = 30_000;
const LS_TTL_MS = 5 * 60 * 1000;

function makeKey(scope, uid) { return NS + scope + ":" + uid; }
function makeLsKey(scope, uid) { return LS_NS + scope + ":" + uid; }

// ── sessionStorage (quente, 30s) ──────────────────────────────────────────

function readCache(scope, uid) {
  try {
    const raw = sessionStorage.getItem(makeKey(scope, uid));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.t > (entry.ttl || DEFAULT_TTL_MS)) return null;
    return entry.data;
  } catch { return null; }
}

function writeCache(scope, uid, data, ttl) {
  try {
    sessionStorage.setItem(makeKey(scope, uid), JSON.stringify({
      t: Date.now(), ttl: ttl || DEFAULT_TTL_MS, data
    }));
  } catch {}
}

// ── localStorage (morno, 5 min) ───────────────────────────────────────────

function readPersistentCache(scope, uid) {
  try {
    const raw = localStorage.getItem(makeLsKey(scope, uid));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.t > LS_TTL_MS) return null;
    return entry.data;
  } catch { return null; }
}

function writePersistentCache(scope, uid, data) {
  try {
    localStorage.setItem(makeLsKey(scope, uid), JSON.stringify({ t: Date.now(), data }));
  } catch {}
}

function removePersistentCache(scope, uid) {
  try { localStorage.removeItem(makeLsKey(scope, uid)); } catch {}
}

// ── Invalidação pública ───────────────────────────────────────────────────

export function invalidate(scope, uid) {
  try { sessionStorage.removeItem(makeKey(scope, uid)); } catch {}
  removePersistentCache(scope, uid);
}

// Invalida TODAS as keys com o prefixo (ex: "sessoes" também limpa
// "sessoes:all"). Útil quando uma mutação afeta múltiplas views da mesma
// entidade — painel usa "sessoes" (filtra ocultas), agenda usa "sessoes:all"
// (inclui ocultas); um encerrar/cancelar precisa invalidar ambas.
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
  try {
    const lsRoot = makeLsKey(prefix, uid);
    const lsVariant = lsRoot + ":";
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === lsRoot || (k && k.startsWith(lsVariant))) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── cachedGet ─────────────────────────────────────────────────────────────
//
// Faz GET cacheado. Chama onData(parsedJson, source) onde source = "stale"
// (do cache, instantâneo) e/ou "fresh" (do backend, depois do roundtrip).
//
// Garantias:
//   - onData é sempre chamado pelo menos uma vez (com "fresh" se sem cache).
//   - Se há cache válido: onData("stale") chamado síncrono na próxima tick,
//     depois onData("fresh") quando o refetch terminar (se mudou).
//   - Em erro de rede, o cache stale é mantido — UX continua funcional.
//   - Se `getFreshToken` for fornecido e o backend devolver TOKEN_INVALIDO/401
//     (Firebase ID token expirou — TTL 1h), faz 1 retry com token renovado.
//
// Retorna Promise que resolve quando o fetch fresh termina (use se quiser
// await pra encadear ações; pra render normal use só o onData).
export function cachedGet({ url, idToken, uid, key, ttl, onData, getFreshToken }) {
  // 1. sessionStorage (dados da aba — mais rápido).
  let cached = readCache(key, uid);

  // 2. Fallback: localStorage (dados do acesso anterior — sobrevive ao fechar aba).
  if (!cached) {
    cached = readPersistentCache(key, uid);
    if (cached) writeCache(key, uid, cached, ttl); // aquece sessionStorage
  }

  if (cached) {
    queueMicrotask(() => onData?.(cached, "stale"));
  }

  async function doFetch(token) {
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  return (async () => {
    let { res, data } = await doFetch(idToken);
    // Token expirado → tenta refresh + retry uma única vez.
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
    writePersistentCache(key, uid, data);
    if (!cached || JSON.stringify(cached) !== JSON.stringify(data)) {
      onData?.(data, "fresh");
    }
    return data;
  })();
}

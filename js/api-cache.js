// Espaço Prelúdio — cache SWR genérico para endpoints de listagem do backend.
//
// Pattern: stale-while-revalidate (SWR).
//   - 1ª chamada: fetch normal + grava cache + dispara onData(data, "fresh")
//   - Chamada subsequente dentro do TTL: dispara onData(cached, "stale")
//     IMEDIATAMENTE, e em paralelo refaz fetch. Quando volta, dispara
//     onData(fresh, "fresh") se os dados mudaram.
//   - Cache vive em sessionStorage (some quando aba fecha) — chave única
//     por endpoint + uid.
//
// Use pra GET de listagem onde dados são raramente mutados pelo próprio user
// na janela do TTL: /sessoes, /pacientes, /blackouts, /documentos.
// NÃO use pra ações (criar/deletar/editar) — essas devem invalidar o cache.
//
// Uso:
//   import { cachedGet, invalidate } from "./js/api-cache.js?v=2-76";
//   cachedGet({
//     url: `${BACKEND_BASE_URL}/therapy/sessoes`,
//     idToken, uid, key: "sessoes", ttl: 30_000,
//     onData: (data, source) => render(data.sessions)
//   });
//
//   // Depois de criar/cancelar/encerrar consulta:
//   invalidate("sessoes", uid);

const NS = "ep:api:v1:";
const DEFAULT_TTL_MS = 30_000;

function makeKey(scope, uid) { return NS + scope + ":" + uid; }

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

export function invalidate(scope, uid) {
  try { sessionStorage.removeItem(makeKey(scope, uid)); } catch {}
}

// Faz GET cacheado. Chama onData(parsedJson, source) onde source = "stale"
// (do cache, instantâneo) e/ou "fresh" (do backend, depois do roundtrip).
//
// Garantias:
//   - onData é sempre chamado pelo menos uma vez (com "fresh" se sem cache).
//   - Se há cache válido: onData("stale") chamado síncrono na próxima tick,
//     depois onData("fresh") quando o refetch terminar (se mudou).
//   - Em erro de rede, o cache stale é mantido — UX continua funcional.
//
// Retorna Promise que resolve quando o fetch fresh termina (use se quiser
// await pra encadear ações; pra render normal use só o onData).
export function cachedGet({ url, idToken, uid, key, ttl, onData }) {
  const cached = readCache(key, uid);
  if (cached) {
    // Dispara onData("stale") em microtask pra preservar a semântica
    // assíncrona esperada pelo caller.
    queueMicrotask(() => onData?.(cached, "stale"));
  }

  return fetch(url, { headers: { "Authorization": `Bearer ${idToken}` } })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        // Mantém cache stale na UI; reporta erro estruturado pro caller.
        const err = new Error(data?.error || ("HTTP_" + res.status));
        err.code = data?.error || ("HTTP_" + res.status);
        throw err;
      }
      writeCache(key, uid, data, ttl);
      // Só re-renderiza se há diferença real (evita flicker desnecessário).
      if (!cached || JSON.stringify(cached) !== JSON.stringify(data)) {
        onData?.(data, "fresh");
      }
      return data;
    });
}

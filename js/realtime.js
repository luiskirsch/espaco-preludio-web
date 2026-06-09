// Espaço Prelúdio — realtime via Socket.io.
// Invalida caches automaticamente quando o backend emite eventos de mutação.
// Chamado por auth-guard.js após requireTherapist() → singleton, seguro chamar N vezes.

import { invalidatePrefix } from "./api-cache.js?v=4";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";

let _socket = null;
let _uid    = null;

async function loadIo() {
  const mod = await import("https://cdn.socket.io/4.7.5/socket.io.esm.min.js");
  return mod.io || mod.default;
}

export async function connectRealtime(uid, initialToken) {
  if (_socket || !uid) return;
  _uid = uid;

  try {
    const io = await loadIo();

    _socket = io(BACKEND_BASE_URL, {
      // auth como função: garante token fresco em cada (re)conexão (Firebase TTL 1h).
      auth: async (cb) => {
        try {
          const user = auth.currentUser;
          cb({ token: user ? await user.getIdToken() : (initialToken || "") });
        } catch { cb({ token: initialToken || "" }); }
      },
      transports: ["websocket", "polling"],
      reconnectionDelay: 3000,
      reconnectionAttempts: 8
    });

    _socket.on("sessoes:changed", () => {
      invalidatePrefix("sessoes", _uid);
      document.dispatchEvent(new CustomEvent("ep:data:changed", { detail: { key: "sessoes" } }));
    });

    _socket.on("blackouts:changed", () => {
      invalidatePrefix("blackouts", _uid);
      document.dispatchEvent(new CustomEvent("ep:data:changed", { detail: { key: "blackouts" } }));
    });

    _socket.on("pacientes:changed", () => {
      invalidatePrefix("pacientes", _uid);
      document.dispatchEvent(new CustomEvent("ep:data:changed", { detail: { key: "pacientes" } }));
    });

    _socket.on("disconnect", () => { _socket = null; });
  } catch { /* realtime é melhoria, não requisito */ }
}

export function disconnectRealtime() {
  _socket?.disconnect();
  _socket = null;
}

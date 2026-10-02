import { decryptNote, encryptNote, generateThreadKey, unwrapKey, wrapKey } from "./crypto.js";

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Chave de resultado de UMA sessão, derivada da DEK (HKDF-SHA-256). A
// transcrição progressiva cifra cada pedaço no servidor com ela; precisa ser a
// mesma em todo pedaço, recarga, reentrada e no "Tentar de novo" — derivar
// evita guardar a chave em qualquer lugar.
export async function deriveAiSessionKey(dek, sessionId) {
  if (!(dek instanceof Uint8Array) || dek.length !== 32) throw new Error("DEK_INDISPONIVEL");
  if (!sessionId) throw new Error("SESSAO_OBRIGATORIA");
  const base = await crypto.subtle.importKey("raw", dek, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: new TextEncoder().encode("ep-ai-summary-session-v1"),
    info: new TextEncoder().encode(String(sessionId)),
  }, base, 256);
  return new Uint8Array(bits);
}

// Sem sessionId: chave aleatória (modo antigo, áudio inteiro). Com sessionId:
// chave derivada da sessão (transcrição progressiva).
export async function createAiSummaryEnvelope(dek, { sessionId } = {}) {
  if (!(dek instanceof Uint8Array) || dek.length !== 32) throw new Error("DEK_INDISPONIVEL");
  const key = sessionId ? await deriveAiSessionKey(dek, sessionId) : generateThreadKey();
  const wrapped = await wrapKey(key, dek);
  return {
    key,
    headers: {
      "X-AI-Result-Key": bytesToBase64(key),
      "X-AI-Wrapped-Key": wrapped.ciphertext,
      "X-AI-Wrapped-Key-IV": wrapped.iv,
    },
  };
}

export async function decryptAiSummaryPayload(encrypted, dek) {
  if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.wrappedKey || !encrypted?.wrappedKeyIv) {
    throw new Error("RESUMO_CIFRADO_INVALIDO");
  }
  const key = await unwrapKey({ ciphertext: encrypted.wrappedKey, iv: encrypted.wrappedKeyIv }, dek);
  try {
    const plaintext = await decryptNote({ ciphertext: encrypted.ciphertext, iv: encrypted.iv }, key);
    if (plaintext.startsWith("[")) throw new Error("RESUMO_CIFRADO_CORROMPIDO");
    return JSON.parse(plaintext);
  } finally {
    key.fill(0);
  }
}

export async function migrateLegacyAiSummary({ backendBaseUrl, sessionId, idToken, dek }) {
  const envelope = await createAiSummaryEnvelope(dek);
  try {
    const response = await fetch(
      `${String(backendBaseUrl).replace(/\/+$/, "")}/therapy/session/${encodeURIComponent(sessionId)}/ai-summary/encrypt-legacy`,
      { method: "POST", headers: { "Authorization": `Bearer ${idToken}`, ...envelope.headers } }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP_${response.status}`);
    return data;
  } finally {
    envelope.key.fill(0);
  }
}

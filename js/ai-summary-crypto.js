import { decryptNote, encryptNote, generateThreadKey, unwrapKey, wrapKey } from "./crypto.js";

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function createAiSummaryEnvelope(dek) {
  if (!(dek instanceof Uint8Array) || dek.length !== 32) throw new Error("DEK_INDISPONIVEL");
  const key = generateThreadKey();
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

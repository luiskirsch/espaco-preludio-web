// Espaço Prelúdio — primitivas E2EE (AES-GCM + PBKDF2).
//
// Modelo (DEK / KEK):
//   1) Ao criar conta: gera salt aleatório (16 bytes) + DEK aleatória (32 bytes / AES-256).
//      KEK = PBKDF2(senha, salt, 200_000 iters, SHA-256).
//      wrappedDEK = AES-GCM(DEK, KEK, iv1).
//      Servidor recebe e armazena {salt, wrappedDEK, wrappedDEKIv}. NÃO recebe DEK.
//      Recovery phrase = DEK em base32-ish legível, exibida UMA VEZ.
//
//   2) Ao fazer login: cliente busca {salt, wrappedDEK, wrappedDEKIv}, deriva KEK
//      a partir da senha digitada e desembrulha o DEK. DEK fica em sessionStorage.
//
//   3) Notas: cada nota cifrada com IV aleatório por AES-GCM(plaintext, DEK, ivN).
//      Servidor recebe {ciphertext, iv} — não consegue decifrar.
//
//   4) Recuperação: usuário cola recovery phrase → reconstrói DEK → re-embrulha com
//      KEK derivado da nova senha. Notas seguem decifráveis (DEK não muda).
//
// Tudo usa WebCrypto. Funciona em qualquer navegador moderno.

const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_HASH       = "SHA-256";
const AES_LENGTH        = 256;
const SALT_BYTES        = 16;
const DEK_BYTES         = 32;
const IV_BYTES          = 12;

const SESSION_DEK_KEY    = "ep_dek_b64";
const SESSION_USER_KEY   = "ep_user";

// ─── Helpers base64 ─────────────────────────────────────────

function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function strToBytes(str) { return new TextEncoder().encode(str); }
function bytesToStr(bytes) { return new TextDecoder().decode(bytes); }

// ─── Random helpers ─────────────────────────────────────────

export function generateSalt() {
  const arr = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(arr);
  return bytesToB64(arr);
}

export function generateIv() {
  const arr = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(arr);
  return arr;
}

export function generateDEK() {
  const arr = new Uint8Array(DEK_BYTES);
  crypto.getRandomValues(arr);
  return arr;
}

// ─── PBKDF2 → AES-GCM key (KEK) ─────────────────────────────

async function deriveKek(password, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    strToBytes(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH
    },
    baseKey,
    { name: "AES-GCM", length: AES_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── DEK como CryptoKey (importada de raw bytes) ────────────

async function importDek(dekBytes) {
  return crypto.subtle.importKey(
    "raw",
    dekBytes,
    { name: "AES-GCM", length: AES_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── Wrap / Unwrap DEK ──────────────────────────────────────

export async function wrapDek(dekBytes, password, saltB64) {
  const saltBytes = b64ToBytes(saltB64);
  const kek = await deriveKek(password, saltBytes);
  const iv = generateIv();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    kek,
    dekBytes
  );
  return {
    wrappedDEK:   bytesToB64(new Uint8Array(ct)),
    wrappedDEKIv: bytesToB64(iv)
  };
}

export async function unwrapDek({ wrappedDEK, wrappedDEKIv, e2eeSalt }, password) {
  const saltBytes = b64ToBytes(e2eeSalt);
  const kek       = await deriveKek(password, saltBytes);
  const ivBytes   = b64ToBytes(wrappedDEKIv);
  const ctBytes   = b64ToBytes(wrappedDEK);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      kek,
      ctBytes
    );
    return new Uint8Array(plain);
  } catch (error) {
    throw new Error("SENHA_INCORRETA_OU_DEK_CORROMPIDA");
  }
}

// ─── Note encrypt / decrypt ─────────────────────────────────

export async function encryptNote(plaintext, dekBytes) {
  const dek = await importDek(dekBytes);
  const iv  = generateIv();
  const ct  = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    dek,
    strToBytes(plaintext)
  );
  return {
    ciphertext: bytesToB64(new Uint8Array(ct)),
    iv:         bytesToB64(iv)
  };
}

export async function decryptNote({ ciphertext, iv }, dekBytes) {
  const dek = await importDek(dekBytes);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(iv) },
      dek,
      b64ToBytes(ciphertext)
    );
    return bytesToStr(new Uint8Array(plain));
  } catch (error) {
    return "[nota corrompida ou chave inválida]";
  }
}

// ─── Recovery phrase ────────────────────────────────────────
// 32 bytes da DEK em base32 (sem ambiguidades I/L/0/O), agrupados em blocos
// legíveis. Usuário copia/imprime/guarda offline. NÃO é mnemônico BIP39 — é
// o próprio DEK em formato resistente a transcrição manual.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 30 chars sem 0/O/1/I/L

function bytesToBase32Custom(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

function base32CustomToBytes(str) {
  const clean = String(str || "").toUpperCase().replace(/[^A-Z2-9]/g, "");
  const out = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("RECOVERY_INVALIDO");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function dekToRecoveryPhrase(dekBytes) {
  const raw = bytesToBase32Custom(dekBytes); // ~52 chars para 32 bytes
  // Quebra em grupos de 4 chars separados por espaço — 13 grupos
  return raw.match(/.{1,4}/g).join(" ");
}

export function recoveryPhraseToDek(phrase) {
  const bytes = base32CustomToBytes(phrase);
  if (bytes.length < DEK_BYTES) {
    throw new Error("RECOVERY_INCOMPLETO");
  }
  return bytes.slice(0, DEK_BYTES);
}

// ─── Sessão (DEK em sessionStorage durante a aba) ───────────

export function rememberDek(dekBytes) {
  try { sessionStorage.setItem(SESSION_DEK_KEY, bytesToB64(dekBytes)); } catch {}
}

export function recallDek() {
  try {
    const b64 = sessionStorage.getItem(SESSION_DEK_KEY);
    return b64 ? b64ToBytes(b64) : null;
  } catch { return null; }
}

export function clearDek() {
  try { sessionStorage.removeItem(SESSION_DEK_KEY); } catch {}
  try { sessionStorage.removeItem(SESSION_USER_KEY); } catch {}
}

export function rememberUser(user) {
  try { sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user || {})); } catch {}
}

export function recallUser() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_USER_KEY) || "null"); } catch { return null; }
}

// Anexos do chat (fotos e PDF) — cifrados de ponta a ponta.
//
// O arquivo é cifrado no navegador com a chave da conversa (AES-GCM) antes de
// subir; o servidor guarda só bytes cifrados. A mensagem que referencia o
// anexo também é cifrada e leva nome, tipo e tamanho:
//   FILE_CARD:{"fileId":"…","name":"exame.pdf","mime":"application/pdf","size":12345}
// Usado pelo portal do colaborador (app/chat.html) e pelas mensagens do
// profissional (mensagens.html).

export const FILE_PREFIX = "FILE_CARD:";
export const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT_MIME = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/i;
export const ACCEPT_ATTR = "image/*,application/pdf";

const b64 = buf => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function aesKey(threadKeyBytes) {
  return crypto.subtle.importKey("raw", threadKeyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function parseFileCard(plain) {
  if (!String(plain || "").startsWith(FILE_PREFIX)) return null;
  try {
    const c = JSON.parse(plain.slice(FILE_PREFIX.length));
    return c && typeof c.fileId === "string" && /^[\w-]{4,80}$/.test(c.fileId) ? c : null;
  } catch { return null; }
}

export function fileLabel(card) {
  return `${String(card.mime || "").startsWith("image/") ? "📷 Foto" : "📄"} ${card.name || "arquivo"}`;
}

export function formatSize(n) {
  if (!n) return "";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Fotos grandes são reduzidas (lado maior 1600px, JPEG) para caber no limite.
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 900 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

export function validateFile(file) {
  if (!file) return "Nenhum arquivo selecionado.";
  if (!ACCEPT_MIME.test(file.type || "")) return "Envie uma foto ou um PDF.";
  return null;
}

// Cifra, envia e devolve o texto da mensagem (FILE_CARD:…) para o chat enviar.
export async function uploadAttachment({ file, threadKeyBytes, uploadUrl, idToken }) {
  const invalid = validateFile(file);
  if (invalid) throw new Error(invalid);
  const ready = await shrinkImage(file);
  if (ready.size > MAX_BYTES) throw new Error("Arquivo muito grande (máximo 4 MB).");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await ready.arrayBuffer();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(threadKeyBytes), data);
  const r = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fileBase64: b64(cipher), fileIv: b64(iv) })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(r.status === 413 ? "Arquivo muito grande (máximo 4 MB)." : "Não foi possível enviar o arquivo.");
  return FILE_PREFIX + JSON.stringify({ fileId: d.fileId, name: ready.name.slice(0, 120), mime: ready.type, size: ready.size });
}

// Baixa e decifra; o resultado (URL local) fica em cache por arquivo.
const blobCache = new Map();
export async function fetchAttachment({ card, threadKeyBytes, downloadUrl, idToken }) {
  if (blobCache.has(card.fileId)) return blobCache.get(card.fileId);
  const promise = (async () => {
    const r = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${idToken}` } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error("download");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(d.fileIv) }, await aesKey(threadKeyBytes), unb64(d.fileBase64));
    return URL.createObjectURL(new Blob([plain], { type: card.mime || "application/octet-stream" }));
  })();
  blobCache.set(card.fileId, promise);
  promise.catch(() => blobCache.delete(card.fileId));
  return promise;
}

const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// HTML do anexo dentro do balão; a imagem é preenchida por hydrateAttachments.
export function renderFileCard(card) {
  const id = escHtml(card.fileId);
  if (String(card.mime || "").startsWith("image/")) {
    return `<button type="button" class="chat-file chat-file--image" data-file-id="${id}" aria-label="Abrir foto"><span class="chat-file__ph">📷</span></button>`;
  }
  return `<button type="button" class="chat-file chat-file--doc" data-file-id="${id}">
    <span class="chat-file__icon">PDF</span>
    <span class="chat-file__meta"><strong data-no-i18n>${escHtml(card.name || "documento.pdf")}</strong><small>${escHtml(formatSize(card.size))}</small></span>
  </button>`;
}

// Carrega miniaturas e liga o clique para abrir o arquivo.
export function hydrateAttachments(container, { cards, threadKeyBytes, downloadUrlFor, getToken }) {
  container.querySelectorAll("[data-file-id]").forEach(el => {
    const card = cards.get(el.dataset.fileId);
    if (!card || el.dataset.hydrated) return;
    el.dataset.hydrated = "1";
    const load = async () => fetchAttachment({ card, threadKeyBytes, downloadUrl: downloadUrlFor(card.fileId), idToken: await getToken() });
    if (String(card.mime || "").startsWith("image/")) {
      load().then(url => { el.innerHTML = `<img src="${url}" alt="">`; })
        .catch(() => { el.innerHTML = `<span class="chat-file__ph">⚠️</span>`; });
    }
    el.addEventListener("click", async () => {
      try {
        const url = await load();
        const a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener";
        if (!String(card.mime || "").startsWith("image/") && !/pdf/i.test(card.mime || "")) a.download = card.name || "arquivo";
        document.body.appendChild(a); a.click(); a.remove();
      } catch { alert("Não foi possível abrir o arquivo."); }
    });
  });
}

export const FILE_CSS = `
.chat-file { display: block; border: 0; padding: 0; background: none; cursor: pointer; color: inherit; font: inherit; text-align: left; }
.chat-file--image { width: 240px; max-width: 62vw; min-height: 120px; border-radius: 10px; overflow: hidden; background: rgba(0,0,0,.06); display: grid; place-items: center; }
.chat-file--image img { display: block; width: 100%; height: auto; max-height: 320px; object-fit: cover; }
.chat-file__ph { font-size: 28px; opacity: .6; }
.chat-file--doc { display: flex; align-items: center; gap: 10px; min-width: 200px; max-width: 260px; padding: 8px; border-radius: 10px; background: rgba(0,0,0,.06); }
.chat-file__icon { flex: 0 0 auto; width: 38px; height: 46px; border-radius: 6px; background: #c0392b; color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; }
.chat-file__meta { min-width: 0; display: flex; flex-direction: column; }
.chat-file__meta strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-file__meta small { font-size: 11px; opacity: .7; }
`;

// ─── Seletor de emojis para o campo de mensagem ───────────────────────────
export const EMOJIS = ["😀","😃","😄","😁","😊","🙂","😉","😍","🥰","😘","😅","😂","🤣","😌","😇","🤗","🤔","😐","😶","🙄","😏","😴","😢","😭","😔","😟","😕","🙁","😮","😯","😲","😳","🥺","😤","😠","😡","🤯","😬","🥲","🙏","👍","👎","👏","🙌","👋","🤝","💪","❤️","🧡","💛","💚","💙","💜","🤍","💔","✨","🌱","🌸","🌞","🌙","⭐","🔥","🎉","✅","❌","☕","📅","📎","💬","🌈"];

export function attachEmojiPicker({ button, input, mount }) {
  const panel = document.createElement("div");
  panel.className = "chat-emoji-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Emojis");
  panel.innerHTML = EMOJIS.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join("");
  (mount || document.body).appendChild(panel);
  const place = () => {
    const r = button.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, r.left)) + "px";
    panel.style.top = Math.max(8, r.top - panel.offsetHeight - 8) + "px";
  };
  button.addEventListener("click", e => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) place();
  });
  panel.addEventListener("click", e => {
    const b = e.target.closest("[data-emoji]");
    if (!b) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + b.dataset.emoji + input.value.slice(end);
    const pos = start + b.dataset.emoji.length;
    input.focus();
    input.setSelectionRange(pos, pos);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("click", e => { if (!panel.hidden && !panel.contains(e.target) && e.target !== button) panel.hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") panel.hidden = true; });
  return panel;
}

export const EMOJI_CSS = `
.chat-emoji-panel { position: fixed; z-index: 60; width: 300px; max-width: calc(100vw - 16px); max-height: 240px; overflow-y: auto; display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: 8px; border-radius: 14px; background: #fff; border: 1px solid rgba(0,0,0,.08); box-shadow: 0 12px 32px rgba(0,0,0,.18); }
.chat-emoji-panel[hidden] { display: none; }
.chat-emoji-panel button { border: 0; background: none; font-size: 22px; line-height: 1; padding: 5px 0; border-radius: 8px; cursor: pointer; }
.chat-emoji-panel button:hover, .chat-emoji-panel button:focus-visible { background: rgba(0,0,0,.06); }
`;

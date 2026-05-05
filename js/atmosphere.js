// Espaço Prelúdio — atmosfera (clima da sala + som ambiente).
//
// Compartilhado entre consultorio.html (profissional) e entrar.html (paciente).
// Cada lado escolhe seu próprio clima e som — local-only, persistido em
// localStorage.

const MODE_KEY   = "ep_consult_mode";
const SOUND_KEY  = "ep_consult_sound";
const VOLUME_KEY = "ep_consult_volume";

const VALID_MODES  = new Set(["foco", "entardecer", "calmo"]);
const VALID_SOUNDS = new Set(["off", "brown"]);

const VOLUME_MAX = 0.10;        // teto seguro para brown noise
const VOLUME_DEFAULT = 0.04;    // ~ -28 dBFS, acolhedor sem mascarar voz

// ─── Modo de clima ──────────────────────────────────────────

export function readMode() {
  const v = localStorage.getItem(MODE_KEY);
  return VALID_MODES.has(v) ? v : "foco";
}

export function applyMode(mode) {
  if (!VALID_MODES.has(mode)) mode = "foco";
  document.body.classList.remove("ep-mode-foco", "ep-mode-entardecer", "ep-mode-calmo");
  document.body.classList.add("ep-mode-" + mode);
  document.querySelectorAll("[data-mode]").forEach(b => {
    b.classList.toggle("is-active", b.dataset.mode === mode);
  });
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
}

export function bindModeButtons(rootSelector = "[data-mode]") {
  document.querySelectorAll(rootSelector).forEach(b => {
    b.addEventListener("click", () => applyMode(b.dataset.mode));
  });
}

// ─── Som ambiente (brown noise gerado por AudioContext) ─────

let _ctx    = null;
let _source = null;
let _gain   = null;

export function readSound() {
  const v = localStorage.getItem(SOUND_KEY);
  return VALID_SOUNDS.has(v) ? v : "off";
}

export function readVolume() {
  const raw = parseFloat(localStorage.getItem(VOLUME_KEY) || "");
  if (!Number.isFinite(raw)) return VOLUME_DEFAULT;
  return Math.max(0, Math.min(VOLUME_MAX, raw));
}

function persistSound(sound)   { try { localStorage.setItem(SOUND_KEY, sound); } catch {} }
function persistVolume(volume) { try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch {} }

function makeBrownNoiseBuffer(ctx) {
  const size = 2 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < size; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + (0.02 * w)) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

export async function startBrownNoise(volume = readVolume()) {
  if (_ctx) return;
  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _source = _ctx.createBufferSource();
    _source.buffer = makeBrownNoiseBuffer(_ctx);
    _source.loop = true;
    _gain = _ctx.createGain();
    _gain.gain.value = 0;
    _gain.gain.linearRampToValueAtTime(volume, _ctx.currentTime + 1.2);
    _source.connect(_gain).connect(_ctx.destination);
    _source.start(0);
  } catch (err) {
    console.warn("ambient_start_error", err);
    _ctx = null; _source = null; _gain = null;
  }
}

export async function stopBrownNoise() {
  if (!_ctx) return;
  try {
    if (_gain) _gain.gain.linearRampToValueAtTime(0, _ctx.currentTime + 0.6);
  } catch {}
  await new Promise(r => setTimeout(r, 700));
  try { _source?.stop(); _ctx?.close(); } catch {}
  _ctx = null; _source = null; _gain = null;
}

export function setVolume(volume) {
  const v = Math.max(0, Math.min(VOLUME_MAX, Number(volume) || 0));
  persistVolume(v);
  if (_gain && _ctx) {
    _gain.gain.linearRampToValueAtTime(v, _ctx.currentTime + 0.25);
  }
}

export async function applySound(sound) {
  const s = VALID_SOUNDS.has(sound) ? sound : "off";
  persistSound(s);
  document.querySelectorAll("[data-sound]").forEach(b => {
    b.classList.toggle("is-active", b.dataset.sound === s);
  });
  if (s === "off") await stopBrownNoise();
  else if (s === "brown") await startBrownNoise(readVolume());
  // Slider de volume só faz sentido quando há som tocando.
  document.querySelectorAll("[data-ambient-volume]").forEach(slider => {
    slider.disabled = (s === "off");
  });
}

// ─── Painel "Ajustar ambiente" — toggle + outside-click ─────

export function bindAmbientPanel({ buttonId, panelId } = {}) {
  const btn = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  if (!btn || !panel) return;

  function close() {
    panel.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }
  function toggle() {
    const open = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("is-open")) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    close();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

// ─── Inicialização one-shot ─────────────────────────────────

export async function initAtmosphere({ buttonId, panelId } = {}) {
  applyMode(readMode());
  bindModeButtons();

  document.querySelectorAll("[data-sound]").forEach(b => {
    b.addEventListener("click", () => applySound(b.dataset.sound));
  });
  await applySound(readSound());

  document.querySelectorAll("[data-ambient-volume]").forEach(slider => {
    const v = readVolume();
    slider.value = String(Math.round((v / VOLUME_MAX) * 100));
    slider.addEventListener("input", () => {
      const pct = Number(slider.value) / 100;
      setVolume(pct * VOLUME_MAX);
    });
  });

  if (buttonId && panelId) bindAmbientPanel({ buttonId, panelId });
}

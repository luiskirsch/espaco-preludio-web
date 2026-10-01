// Espaço Prelúdio — painel "Ambiente" da sala de vídeo.
//
// Como você aparece e é ouvido(a) na consulta: fundo (desfoque / fundo
// neutro), luz de tela, câmera, microfone, saída de som, redução de ruído e
// "esconder minha imagem". Usado no consultório (profissional) e na sala do
// paciente. Tudo roda no navegador; as preferências ficam neste dispositivo.
//
// Desfoque/fundo usam @livekit/track-processors (MediaPipe no navegador). Se o
// aparelho não der conta (quadro demorando demais), o efeito é desligado com
// aviso — vídeo fluido vale mais que fundo bonito.

import { applyMode, readMode, stopBrownNoise } from "./atmosphere.js";

const PREFS_KEY = "ep_room_ambient_v1";
const TRACK_PROCESSORS_VERSION = "0.8.1";
// Detecção de aparelho lento. Mede filterTimeMs (tempo real do quadro: a
// biblioteca soma a segmentação duas vezes em processingTimeMs). Ignora o
// aquecimento (modelo + shaders da GPU) e só desliga se a mediana passar de
// ~15fps por várias janelas seguidas — pico isolado não conta.
const SLOW_FRAME_MS = 66;
const SLOW_FRAME_WINDOW = 60;
const SLOW_WARMUP_FRAMES = 120;
const SLOW_WINDOWS_TO_DISABLE = 3;

const DEFAULTS = { background: "none", screenLight: 0, hideSelf: false, noise: "standard" };

function tr(key, fallback) {
  try {
    const v = window.EP_I18N?.t?.(key);
    if (v && v !== key && v !== key.split(":").pop()) return v;
  } catch {}
  return fallback;
}

function readPrefs() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")) }; }
  catch { return { ...DEFAULTS }; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

// Fundos neutros gerados em canvas (sem foto de banco de imagens): parede
// lisa com luz suave, que lê como "consultório" sem distrair.
function neutralBackground(kind) {
  const c = document.createElement("canvas");
  c.width = 1280; c.height = 720;
  const g = c.getContext("2d");
  const [base, light, shade] = kind === "dark"
    ? ["#2a2622", "#3d3730", "#171512"]
    : ["#d9cfbf", "#efe7da", "#b8ab97"];
  g.fillStyle = base; g.fillRect(0, 0, 1280, 720);
  const r = g.createRadialGradient(420, 260, 40, 520, 320, 900);
  r.addColorStop(0, light); r.addColorStop(1, shade);
  g.globalAlpha = 0.9; g.fillStyle = r; g.fillRect(0, 0, 1280, 720);
  // rodapé de parede discreto
  g.globalAlpha = 0.18; g.fillStyle = shade; g.fillRect(0, 560, 1280, 160);
  return c.toDataURL("image/jpeg", 0.9);
}

let _styleInjected = false;
function injectStyle() {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .ep-ambient__panel.ep-room-ambient { width: min(380px, calc(100vw - 16px)); max-height: calc(100vh - 90px); overflow-y: auto; overscroll-behavior: contain; padding: 14px 16px; gap: 0; }
    .ep-room-ambient .ep-ambient__section { margin: 0; }
    .ep-room-ambient .ep-ambient__section + .ep-ambient__section { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(215,176,107,.12); }
    .ep-room-ambient .ep-ambient__label { margin-bottom: 6px; }
    .ep-room-ambient .ep-ambient__pills { gap: 6px; }
    .ep-room-ambient .ep-ambient__pill { padding: 7px 10px; font-size: 12.5px; white-space: nowrap; }
    .ep-room-ambient__grid4 { display: grid !important; grid-template-columns: repeat(4, 1fr); }
    .ep-room-ambient__grid4 .ep-ambient__pill { padding: 7px 4px; text-align: center; }
    .ep-room-ambient__devices { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; font-size: 12px; color: rgba(243,234,216,.7); }
    .ep-room-ambient__devices .ep-room-ambient__select { margin: 0; padding: 6px 8px; }
    .ep-room-ambient .ep-ambient__hint { margin: 10px 0 0; }
    .ep-room-ambient__select { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 8px 10px; border-radius: 10px;
      background: rgba(255,255,255,.06); color: #f3ead8; border: 1px solid rgba(215,176,107,.28); font: inherit; font-size: 13px; }
    .ep-room-ambient__select option { color: #1a130a; }
    .ep-room-ambient__sub { font-size: 11.5px; color: rgba(243,234,216,.6); margin: 4px 0 0; line-height: 1.4; }
    .ep-room-ambient__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 13.5px; color: #f3ead8; }
    .ep-room-ambient__switch { appearance: none; -webkit-appearance: none; width: 38px; height: 22px; border-radius: 999px; background: rgba(255,255,255,.16);
      position: relative; cursor: pointer; flex: 0 0 auto; transition: background-color .15s ease; }
    .ep-room-ambient__switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #f3ead8; transition: transform .15s ease; }
    .ep-room-ambient__switch:checked { background: #b98a3e; }
    .ep-room-ambient__switch:checked::after { transform: translateX(16px); }
    .ep-room-ambient__warn { margin-top: 8px; padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.4;
      background: rgba(239,68,68,.12); color: #fca5a5; border: 1px solid rgba(239,68,68,.35); }
    .ep-room-ambient__status { font-size: 11.5px; color: rgba(215,176,107,.9); margin-top: 6px; min-height: 1em; }
    #ep-screen-light { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; transition: box-shadow .2s ease; }
    .ep-room-ambient--hide-self { display: none !important; }
  `;
  document.head.appendChild(s);
}

export async function initRoomAmbient({
  room, livekitMod, buttonId, panelId, localTileEl, lkVersion, showMood = true
}) {
  const btn = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  if (!room || !panel || !btn) return;
  injectStyle();
  panel.classList.add("ep-room-ambient");

  // O antigo "som ambiente" (ruído marrom) saiu: atrapalhava a escuta.
  try { localStorage.setItem("ep_consult_sound", "off"); } catch {}
  stopBrownNoise().catch(() => {});

  const { Room, Track } = livekitMod;
  const prefs = readPrefs();
  const supportsSink = "setSinkId" in HTMLMediaElement.prototype;
  const supportsIsolation = !!navigator.mediaDevices?.getSupportedConstraints?.().voiceIsolation;

  let tp = null;            // módulo track-processors (carregado sob demanda)
  let processor = null;
  let slowFrames = [];
  let warmupLeft = SLOW_WARMUP_FRAMES;
  let slowWindows = 0;
  let autoDisabledOnce = false; // se a pessoa religar depois, respeita a escolha
  let bgWarning = "";
  const resetSlowDetection = () => { slowFrames = []; warmupLeft = SLOW_WARMUP_FRAMES; slowWindows = 0; };

  const camTrack = () => room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack || null;
  const micTrack = () => room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack || null;

  async function loadProcessors() {
    if (tp) return tp;
    tp = await import(`https://esm.sh/@livekit/track-processors@${TRACK_PROCESSORS_VERSION}?deps=livekit-client@${lkVersion}`);
    return tp;
  }

  function onFrameStats(stats) {
    if (prefs.background === "none" || document.hidden) return; // aba em 2º plano é limitada pelo navegador
    if (warmupLeft > 0) { warmupLeft--; return; }
    slowFrames.push(stats.filterTimeMs);
    if (slowFrames.length < SLOW_FRAME_WINDOW) return;
    const sorted = slowFrames.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    slowFrames = [];
    slowWindows = median > SLOW_FRAME_MS ? slowWindows + 1 : 0;
    if (slowWindows < SLOW_WINDOWS_TO_DISABLE) return;
    console.info("[room-ambient] fundo lento", { medianMs: Math.round(median) });
    slowWindows = 0;
    if (autoDisabledOnce) return;
    autoDisabledOnce = true;
    bgWarning = tr("roomAmbient:bg.tooSlow", "O efeito de fundo estava deixando seu vídeo lento e foi desligado. Pode ligar de novo se preferir.");
    setBackground("none", { keepWarning: true });
  }

  async function setBackground(mode, { keepWarning = false } = {}) {
    if (!keepWarning) bgWarning = "";
    prefs.background = mode; savePrefs(prefs);
    const track = camTrack();
    render();
    if (!track) return; // aplica quando a câmera voltar (ver LocalTrackPublished)
    try {
      if (mode === "none") {
        if (processor) await processor.switchTo({ mode: "disabled" });
        return;
      }
      const lib = await loadProcessors();
      if (!lib.supportsBackgroundProcessors()) {
        bgWarning = tr("roomAmbient:bg.unsupported", "Seu navegador não suporta efeitos de fundo. Use Chrome, Edge ou Safari atualizados.");
        prefs.background = "none"; savePrefs(prefs); render();
        return;
      }
      const opts = mode === "blur"
        ? { mode: "background-blur", blurRadius: 14 }
        : { mode: "virtual-background", imagePath: neutralBackground(mode === "dark" ? "dark" : "light") };
      resetSlowDetection();
      if (processor && track.getProcessor?.() === processor) {
        await processor.switchTo(opts);
      } else {
        processor = lib.BackgroundProcessor({ ...opts, onFrameProcessed: onFrameStats });
        await track.setProcessor(processor);
      }
    } catch (err) {
      console.warn("room_ambient_bg_error", err);
      bgWarning = tr("roomAmbient:bg.error", "Não foi possível aplicar o efeito de fundo neste aparelho.");
      prefs.background = "none"; savePrefs(prefs); render();
    }
  }

  // Luz de tela: moldura clara em volta da tela que ilumina o rosto.
  function applyScreenLight(level) {
    let el = document.getElementById("ep-screen-light");
    if (!el) { el = document.createElement("div"); el.id = "ep-screen-light"; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); }
    const n = Math.max(0, Math.min(100, Number(level) || 0));
    el.style.boxShadow = n ? `inset 0 0 0 ${Math.round(8 + n * 0.9)}px rgba(255, 248, 235, ${(0.55 + n * 0.0045).toFixed(3)})` : "none";
  }

  function applyHideSelf(hide) {
    localTileEl?.classList.toggle("ep-room-ambient--hide-self", !!hide);
  }

  async function setNoise(level) {
    prefs.noise = level; savePrefs(prefs); render();
    const track = micTrack();
    if (!track) return;
    try {
      await track.restartTrack({
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        ...(supportsIsolation ? { voiceIsolation: level === "strong" } : {})
      });
    } catch (err) { console.warn("room_ambient_noise_error", err); }
  }

  async function listDevices(kind) {
    try { return await Room.getLocalDevices(kind, false); } catch { return []; }
  }

  async function switchDevice(kind, deviceId) {
    try { await room.switchActiveDevice(kind, deviceId); }
    catch (err) { console.warn("room_ambient_switch_error", kind, err); }
    render();
  }

  function pill(attr, value, label, active) {
    return `<button class="ep-ambient__pill${active ? " is-active" : ""}" type="button" ${attr}="${esc(value)}">${esc(label)}</button>`;
  }

  async function render() {
    const [cams, mics, outs] = await Promise.all([
      listDevices("videoinput"), listDevices("audioinput"), supportsSink ? listDevices("audiooutput") : []
    ]);
    const active = kind => room.getActiveDevice?.(kind) || "";
    const select = (kind, list, label) => list.length > 1 ? `
      <span>${esc(label)}</span>
      <select class="ep-room-ambient__select" data-device-kind="${kind}" aria-label="${esc(label)}">
        ${list.map(d => `<option value="${esc(d.deviceId)}"${d.deviceId === active(kind) ? " selected" : ""}>${esc(d.label || label)}</option>`).join("")}
      </select>` : "";
    const deviceRows = select("videoinput", cams, tr("roomAmbient:devices.camera", "Câmera"))
      + select("audioinput", mics, tr("roomAmbient:devices.mic", "Microfone"))
      + select("audiooutput", outs, tr("roomAmbient:devices.output", "Saída"));

    panel.innerHTML = `
      <div class="ep-ambient__section">
        <div class="ep-ambient__label">${esc(tr("roomAmbient:bg.label", "Seu fundo"))}</div>
        <div class="ep-ambient__pills ep-room-ambient__grid4" role="group">
          ${pill("data-bg", "none", tr("roomAmbient:bg.none", "Normal"), prefs.background === "none")}
          ${pill("data-bg", "blur", tr("roomAmbient:bg.blur", "Desfocar"), prefs.background === "blur")}
          ${pill("data-bg", "light", tr("roomAmbient:bg.light", "Claro"), prefs.background === "light")}
          ${pill("data-bg", "dark", tr("roomAmbient:bg.dark", "Escuro"), prefs.background === "dark")}
        </div>
        <p class="ep-room-ambient__sub">${esc(tr("roomAmbient:bg.hint", "Desfoque ou parede neutra atrás de você."))}</p>
        ${bgWarning ? `<div class="ep-room-ambient__warn">${esc(bgWarning)}</div>` : ""}
      </div>

      <div class="ep-ambient__section">
        <div class="ep-ambient__label">${esc(tr("roomAmbient:light.label", "Luz de tela"))}</div>
        <input type="range" class="ep-ambient__slider" data-screen-light min="0" max="100" value="${prefs.screenLight}" aria-label="${esc(tr("roomAmbient:light.label", "Luz de tela"))}">
        <p class="ep-room-ambient__sub">${esc(tr("roomAmbient:light.hint", "Moldura clara que ilumina seu rosto no escuro."))}</p>
      </div>

      <div class="ep-ambient__section">
        <div class="ep-ambient__label">${esc(tr("roomAmbient:devices.label", "Câmera e som"))}</div>
        ${deviceRows ? `<div class="ep-room-ambient__devices">${deviceRows}</div>` : `<p class="ep-room-ambient__sub" style="margin:0;">${esc(tr("roomAmbient:devices.single", "Um dispositivo de cada. Conecte fone ou webcam e eles aparecem aqui."))}</p>`}
        ${supportsIsolation ? `
          <div class="ep-room-ambient__row" style="margin-top:10px;font-size:12px;color:rgba(243,234,216,.7);">${esc(tr("roomAmbient:noise.label", "Ruído"))}
          <div class="ep-ambient__pills" role="group">
            ${pill("data-noise", "standard", tr("roomAmbient:noise.standard", "Padrão"), prefs.noise !== "strong")}
            ${pill("data-noise", "strong", tr("roomAmbient:noise.strong", "Isolar voz"), prefs.noise === "strong")}
          </div></div>` : ""}
      </div>

      <div class="ep-ambient__section">
        <label class="ep-room-ambient__row" style="margin-top:0;">
          <span>${esc(tr("roomAmbient:view.hideSelf", "Esconder minha imagem"))} <span style="opacity:.55;font-size:11.5px;">${esc(tr("roomAmbient:view.hideSelfHint", "(só na sua tela)"))}</span></span>
          <input type="checkbox" class="ep-room-ambient__switch" data-hide-self${prefs.hideSelf ? " checked" : ""}>
        </label>

      </div>

      ${showMood ? `
      <div class="ep-ambient__section">
        <div class="ep-ambient__label">${esc(tr("roomAmbient:mood.label", "Clima da tela"))}</div>
        <div class="ep-ambient__pills" role="group">
          ${pill("data-mode", "foco", tr("consultorio:ambient.moodFocus", "Foco"), readMode() === "foco")}
          ${pill("data-mode", "entardecer", tr("consultorio:ambient.moodSunset", "Entardecer"), readMode() === "entardecer")}
          ${pill("data-mode", "calmo", tr("consultorio:ambient.moodCalm", "Calmo"), readMode() === "calmo")}
        </div>
      </div>` : ""}

      <p class="ep-ambient__hint">${esc(tr("roomAmbient:hint", "Preferências salvas só neste dispositivo."))}</p>
    `;
  }

  // Delegação de eventos (o painel é re-renderizado).
  panel.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b || !panel.contains(b)) return;
    if (b.dataset.bg) setBackground(b.dataset.bg);
    else if (b.dataset.noise) setNoise(b.dataset.noise);
    else if (b.dataset.mode) { applyMode(b.dataset.mode); render(); }
  });
  panel.addEventListener("input", e => {
    if (e.target.matches("[data-screen-light]")) {
      prefs.screenLight = Number(e.target.value) || 0; savePrefs(prefs);
      applyScreenLight(prefs.screenLight);
    }
  });
  panel.addEventListener("change", e => {
    const t = e.target;
    if (t.matches("[data-device-kind]")) switchDevice(t.dataset.deviceKind, t.value);
    else if (t.matches("[data-hide-self]")) { prefs.hideSelf = t.checked; savePrefs(prefs); applyHideSelf(prefs.hideSelf); }
  });

  // Toggle do painel + fechar por clique fora / Esc.
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const open = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) render(); // lista de dispositivos atualizada (fone conectado agora)
  });
  document.addEventListener("click", e => {
    if (!panel.classList.contains("is-open") || panel.contains(e.target) || btn.contains(e.target)) return;
    panel.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && panel.classList.contains("is-open")) { panel.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); }
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => { if (panel.classList.contains("is-open")) render(); });

  // Câmera religada / trocada: reaplica o fundo escolhido.
  room.on(livekitMod.RoomEvent.LocalTrackPublished, pub => {
    if (pub?.source === Track.Source.Camera && prefs.background !== "none") { processor = null; setBackground(prefs.background); }
  });

  // Estado inicial
  if (showMood) applyMode(readMode());
  applyScreenLight(prefs.screenLight);
  applyHideSelf(prefs.hideSelf);
  if (prefs.noise === "strong" && supportsIsolation) setNoise("strong");
  if (prefs.background !== "none") setBackground(prefs.background);
  await render();
}

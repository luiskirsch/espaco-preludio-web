// Espaço Prelúdio — player de módulos interativos da jornada.
//
// Um módulo com `story` vira uma experiência em etapas: cenas com diálogo,
// escolhas com consequência (e um "clima da conversa" que reage), controle
// deslizante de autopercepção, pausa de respiração guiada, montar uma fala
// tocando nas partes, notas de proteção e, no fim, o desafio validado pelo
// servidor (o mesmo quiz do formato clássico).
//
// Não há "errou": toda escolha mostra o que aconteceu e permite tentar outra.

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion() ? 0 : ms));

// Pessoa ilustrada (cabeça + tronco) — data-who liga ao destaque de quem fala.
const person = (who, x, y, color, scale = 1) => `
  <g class="sv-person" data-who="${who}" transform="translate(${x} ${y}) scale(${scale})">
    <g class="sv-body">
      <ellipse class="sv-glow" cx="0" cy="-6" rx="34" ry="40"/>
      <path d="M-24 34 C-24 8 -14 0 0 0 C14 0 24 8 24 34 Z" fill="${color}"/>
      <circle cx="0" cy="-14" r="13" fill="#f2d7c2"/>
      <path d="M-13 -17 C-12 -30 12 -31 13 -17 C8 -24 -6 -24 -13 -17 Z" fill="#3b2a22"/>
    </g>
  </g>`;

// Cenários ilustrados (SVG leve, animado via CSS). Sem imagens externas.
const VISUALS = {
  meeting: `<svg viewBox="0 0 640 230" role="img" aria-label="Sala de reunião">
    <defs><linearGradient id="svWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f0ee"/><stop offset="1" stop-color="#dfe8e5"/></linearGradient></defs>
    <rect width="640" height="230" fill="url(#svWall)"/>
    <rect x="0" y="176" width="640" height="54" fill="#d4c7b0"/>
    <rect x="0" y="174" width="640" height="4" fill="#c4b59b"/>
    <g class="sv-window"><rect x="300" y="22" width="150" height="78" rx="6" fill="#bfe0ea" stroke="#d9e4e1" stroke-width="5"/>
      <circle class="sv-sun" cx="420" cy="44" r="10" fill="#f6d27a"/>
      <path class="sv-cloud" d="M318 70 q8 -12 20 -4 q8 -10 18 0 q10 -2 10 8 h-48 z" fill="#ffffff" opacity=".9"/>
      <line x1="375" y1="22" x2="375" y2="100" stroke="#d9e4e1" stroke-width="4"/></g>
    <g transform="translate(590 120)"><rect x="-14" y="38" width="28" height="22" rx="4" fill="#b98a5e"/>
      <path class="sv-leaf" d="M0 40 C-24 22 -20 4 -4 0 C-2 14 2 28 0 40 Z" fill="#4f8f6a"/>
      <path class="sv-leaf sv-leaf2" d="M0 40 C24 20 22 2 6 -2 C4 14 0 28 0 40 Z" fill="#3f7d5b"/>
      <path d="M0 40 C-6 26 -2 14 2 8" stroke="#2f6a4b" stroke-width="2" fill="none"/></g>
    <ellipse cx="452" cy="196" rx="170" ry="10" fill="rgba(0,0,0,.08)"/>
    <ellipse cx="268" cy="182" rx="30" ry="6" fill="rgba(0,0,0,.08)"/>
    <g class="sv-screen"><rect x="44" y="26" width="190" height="112" rx="8" fill="#123c40"/>
      <rect x="62" y="44" width="80" height="9" rx="4" fill="#e0b553"/>
      <rect class="sv-bar sv-bar1" x="62" y="66" width="120" height="7" rx="3" fill="#7fb6ae"/>
      <rect class="sv-bar sv-bar2" x="62" y="82" width="96" height="7" rx="3" fill="#7fb6ae"/>
      <rect class="sv-bar sv-bar3" x="62" y="98" width="140" height="7" rx="3" fill="#7fb6ae"/>
      <path d="M190 124 L206 104 L218 114 L226 96" stroke="#e0b553" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <rect x="132" y="138" width="14" height="40" fill="#8a7a62"/>
    ${person("voce", 268, 132, "#1d6b67", 1.05)}
    <rect x="356" y="120" width="48" height="40" rx="10" fill="#6f6255"/>
    <rect x="500" y="120" width="48" height="40" rx="10" fill="#6f6255"/>
    <rect x="428" y="108" width="48" height="44" rx="10" fill="#6f6255"/>
    ${person("outro1", 380, 140, "#8aa0a3", .9)}
    ${person("outro2", 524, 140, "#a7958a", .9)}
    ${person("carla", 452, 128, "#c46a52", 1)}
    <ellipse cx="452" cy="170" rx="164" ry="22" fill="#c9ad84"/>
    <rect x="404" y="156" width="34" height="9" rx="2" fill="#f7f3ea" opacity=".9"/>
    <rect x="478" y="158" width="26" height="7" rx="2" fill="#f7f3ea" opacity=".8"/>
    <g transform="translate(506 148)"><rect width="34" height="20" rx="2" fill="#2b3a3c"/><rect x="-4" y="20" width="42" height="4" rx="2" fill="#5b6a6c"/><rect x="4" y="4" width="26" height="12" rx="1" fill="#7fb6ae" opacity=".7"/></g>
    <g transform="translate(370 156)"><rect width="18" height="14" rx="3" fill="#f7f3ea"/><path d="M18 3 q6 1 0 8" stroke="#f7f3ea" stroke-width="2" fill="none"/></g>
  </svg>`,
  call: `<svg viewBox="0 0 640 230" role="img" aria-label="Chamada de vídeo">
    <rect width="640" height="230" fill="#1b2b2e"/>
    <g class="sv-tile" data-who="rafael"><rect x="40" y="22" width="390" height="186" rx="14" fill="#2c4245"/>
      ${person("rafael", 235, 128, "#3f6fb0", 1.6)}
      <rect class="sv-tile-ring" x="40" y="22" width="390" height="186" rx="14"/>
      <rect x="54" y="180" width="84" height="18" rx="9" fill="rgba(0,0,0,.45)"/><text x="66" y="193" fill="#fff" font-size="11" font-family="Inter,sans-serif">Rafael</text></g>
    <g class="sv-tile" data-who="voce"><rect x="452" y="22" width="148" height="104" rx="12" fill="#2c4245"/>
      ${person("voce", 526, 82, "#1d6b67", .9)}
      <rect class="sv-tile-ring" x="452" y="22" width="148" height="104" rx="12"/>
      <rect x="462" y="100" width="44" height="16" rx="8" fill="rgba(0,0,0,.45)"/><text x="470" y="112" fill="#fff" font-size="10" font-family="Inter,sans-serif">Você</text></g>
    <g transform="translate(452 144)"><rect width="148" height="64" rx="12" fill="#243538"/>
      <circle cx="40" cy="32" r="14" fill="#c0563f"/><rect x="34" y="28" width="12" height="8" rx="2" fill="#fff"/>
      <circle cx="80" cy="32" r="14" fill="#3a5154"/><circle cx="118" cy="32" r="14" fill="#3a5154"/></g>
  </svg>`,
  office: `<svg viewBox="0 0 640 230" role="img" aria-label="Escritório">
    <rect width="640" height="230" fill="#efe9dc"/>
    <rect x="0" y="170" width="640" height="60" fill="#d8ccb6"/>
    <rect x="70" y="28" width="120" height="84" rx="6" fill="#dfe8e5" stroke="#c7d3cf"/>
    <path d="M70 84 L110 56 L140 76 L190 46" stroke="#9fc0b9" stroke-width="3" fill="none"/>
    ${person("voce", 220, 126, "#1d6b67", 1)}
    <rect x="160" y="150" width="140" height="10" rx="3" fill="#b89c74"/>
    ${person("bruno", 430, 126, "#b58a2c", 1)}
    <rect x="370" y="150" width="190" height="10" rx="3" fill="#b89c74"/>
    <g transform="translate(470 98)"><rect width="76" height="50" rx="6" fill="#123c40"/>
      <g class="sv-mail"><rect x="20" y="13" width="36" height="24" rx="3" fill="#fffdf8"/><path d="M20 15 L38 28 L56 15" stroke="#c0563f" stroke-width="2.5" fill="none"/></g></g>
  </svg>`
};

/**
 * @param {HTMLElement} root
 * @param {object} module   módulo do catálogo (story, cast, quiz, takeaway…)
 * @param {object} opts
 *   - completed: boolean   módulo já concluído (modo revisão, sem desafio)
 *   - onSubmit(answer): Promise<{ok, explanation, error}>  registra a conclusão
 *   - onClose(): void
 */
export function mountStory(root, module, { completed = false, onSubmit, onClose } = {}) {
  const steps = module.story || [];
  const cast = module.cast || {};
  let index = 0;
  let meter = 0; // -4..+4 → clima da conversa
  let destroyed = false;

  root.innerHTML = `
    <div class="story" data-tone="neutral">
      <div class="story__top">
        <div class="story__dots" aria-hidden="true">${steps.map(() => "<i></i>").join("")}<i class="is-final"></i></div>
        <div class="story__meter" aria-live="polite">
          <span>Clima da conversa</span>
          <div class="story__meter-bar"><b></b></div>
          <em>Neutro</em>
        </div>
      </div>
      <div class="story__stage" aria-live="polite"></div>
    </div>`;
  const stage = root.querySelector(".story__stage");
  const dots = [...root.querySelectorAll(".story__dots i")];

  function setMeter(delta) {
    meter = Math.max(-4, Math.min(4, meter + delta));
    const pct = ((meter + 4) / 8) * 100;
    root.querySelector(".story__meter-bar b").style.width = `${pct}%`;
    const label = meter >= 2 ? "Construtivo" : meter <= -2 ? "Tenso" : "Neutro";
    root.querySelector(".story__meter em").textContent = label;
    root.querySelector(".story").dataset.tone = meter >= 2 ? "good" : meter <= -2 ? "tense" : "neutral";
  }
  setMeter(0);

  function markDots() {
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-done", i < index);
      dot.classList.toggle("is-current", i === index);
    });
  }

  function bubble(line) {
    const who = cast[line.who] || { name: "", tone: "muted" };
    if (line.who === "narrador" || !who.name) {
      return `<p class="story-line story-line--narration">${esc(line.text)}</p>`;
    }
    const mine = line.who === "voce";
    const initial = esc((who.name || "?").slice(0, 1));
    return `<div class="story-line ${mine ? "is-mine" : ""}" data-tone="${esc(who.tone)}">
      <span class="story-avatar" aria-hidden="true">${initial}</span>
      <div class="story-bubble">
        <small>${esc(who.name)}${who.role ? ` · ${esc(who.role)}` : ""}${line.mood ? ` · <i>${esc(line.mood)}</i>` : ""}</small>
        <p>${esc(line.text)}</p>
      </div>
    </div>`;
  }

  // Texto aparecendo letra a letra (instantâneo com "reduzir movimento").
  async function typewrite(el, text, speed = 24) {
    if (reduceMotion()) { el.textContent = text; return; }
    el.textContent = "";
    el.classList.add("is-typing");
    for (let i = 0; i < text.length; i++) {
      if (destroyed) return;
      el.textContent = text.slice(0, i + 1);
      await new Promise((r) => setTimeout(r, speed));
    }
    el.classList.remove("is-typing");
  }

  // Conversa acontecendo: "digitando…", texto letra a letra, destaque de
  // quem fala na ilustração e interrupção visível (a fala é cortada por quem
  // entra por cima — intencional, não erro de texto).
  async function playLines(container, lines, visual = null) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (destroyed) return;
      const narration = line.who === "narrador" || !(cast[line.who] && cast[line.who].name);
      if (visual) visual.dataset.speaker = narration ? "" : line.who;
      const cutIn = i > 0 && lines[i - 1].interrupted;
      if (!narration && !cutIn) {
        container.insertAdjacentHTML("beforeend", `<div class="story-typing ${line.who === "voce" ? "is-mine" : ""}"><i></i><i></i><i></i></div>`);
        const typing = container.lastElementChild;
        await wait(650);
        typing.remove();
      }
      container.insertAdjacentHTML("beforeend", bubble(line));
      const el = container.lastElementChild;
      if (cutIn) el.classList.add("is-cutin");
      requestAnimationFrame(() => el.classList.add("is-in"));
      if (narration) { await wait(900); continue; }
      await typewrite(el.querySelector(".story-bubble p"), line.text, line.interrupted ? 32 : 22);
      if (line.interrupted) {
        el.classList.add("is-interrupted");
        el.querySelector(".story-bubble").insertAdjacentHTML("beforeend", `<span class="story-cut">fala interrompida</span>`);
        await wait(150);
      } else {
        await wait(450);
      }
    }
    if (visual) visual.dataset.speaker = "";
  }

  function nextButton(label = "Continuar") {
    return `<button type="button" class="story-next" data-next>${esc(label)} →</button>`;
  }

  function bindNext(scope) {
    scope.querySelector("[data-next]")?.addEventListener("click", () => go(index + 1));
  }

  async function go(i) {
    if (destroyed) return;
    index = i;
    markDots();
    stage.classList.remove("is-in");
    await wait(120);
    stage.scrollTop = 0;
    root.closest(".learning-modal__body")?.scrollTo?.({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
    if (index >= steps.length) return renderFinal();
    const step = steps[index];
    const renderer = { scene: renderScene, choice: renderChoice, slider: renderSlider, breath: renderBreath, build: renderBuild, reflect: renderReflect }[step.type];
    if (!renderer) return go(index + 1);
    await renderer(step);
    requestAnimationFrame(() => stage.classList.add("is-in"));
  }

  async function renderScene(step) {
    if (step.chat) return renderChatScene(step);
    stage.innerHTML = `<div class="story-card">
      ${step.title ? `<span class="story-chip">${esc(step.title)}</span>` : ""}
      ${VISUALS[step.visual] ? `<div class="story-visual" data-visual="${esc(step.visual)}">${VISUALS[step.visual]}</div>` : ""}
      <div class="story-dialog"></div>
      <div class="story-actions" hidden>${nextButton()}</div>
    </div>`;
    requestAnimationFrame(() => stage.classList.add("is-in"));
    await playLines(stage.querySelector(".story-dialog"), step.lines || [], stage.querySelector(".story-visual"));
    const actions = stage.querySelector(".story-actions");
    if (!actions) return;
    actions.hidden = false;
    bindNext(stage);
  }

  // ─── Cena em chat: simulação realista de mensageiro ───────────────────────
  // Digitação humana no campo (velocidade variável, pausas na pontuação,
  // erro corrigido com backspace), envio com ✓ → ✓✓, "fulano está
  // digitando…" e, numa fala interrompida, a mensagem do outro chegando
  // enquanto você ainda digita — o seu texto fica como rascunho não enviado.
  const now = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const human = (ch) => {
    if (/[.!?]/.test(ch)) return 260 + Math.random() * 180;
    if (/[,:;]/.test(ch)) return 170 + Math.random() * 120;
    if (ch === " ") return 55 + Math.random() * 50;
    return 34 + Math.random() * 46;
  };

  async function renderChatScene(step) {
    const chat = step.chat;
    const others = Object.entries(cast).filter(([id, c]) => id !== "voce" && id !== "narrador" && c.name);
    stage.innerHTML = `<div class="story-card story-card--chat">
      ${step.title ? `<span class="story-chip">${esc(step.title)}</span>` : ""}
      <div class="chat-app">
        <header class="chat-app__head">
          <div class="chat-app__avatars">${others.map(([id, c]) => `<span data-tone="${esc(c.tone)}">${esc(c.name.slice(0, 1))}</span>`).join("")}<span data-tone="muted">+2</span></div>
          <div><strong>${esc(chat.title)}</strong><small class="chat-app__status">${esc(chat.subtitle || "")}</small></div>
          <i class="chat-app__live">● ao vivo</i>
        </header>
        <div class="chat-app__feed"></div>
        <footer class="chat-app__composer">
          <div class="chat-app__input"><span class="chat-app__draft"></span><span class="chat-app__placeholder">Escreva uma mensagem…</span></div>
          <span class="chat-app__send" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 11.5 20 4l-6.5 17-2.6-7.1z" fill="currentColor"/></svg></span>
        </footer>
      </div>
      <div class="story-actions" hidden>${nextButton()}</div>
    </div>`;
    requestAnimationFrame(() => stage.classList.add("is-in"));
    const feed = stage.querySelector(".chat-app__feed");
    const draft = stage.querySelector(".chat-app__draft");
    const input = stage.querySelector(".chat-app__input");
    const send = stage.querySelector(".chat-app__send");
    const status = stage.querySelector(".chat-app__status");
    const scroll = () => { feed.scrollTop = feed.scrollHeight; };
    const setDraft = (text) => { draft.textContent = text; input.classList.toggle("has-text", text.length > 0); };

    const typingRow = (who) => {
      const c = cast[who] || {};
      feed.insertAdjacentHTML("beforeend", `<div class="chat-typing" data-tone="${esc(c.tone)}"><span class="chat-avatar">${esc((c.name || "?").slice(0, 1))}</span><div class="chat-typing__dots"><i></i><i></i><i></i></div></div>`);
      status.textContent = `${c.name} está digitando…`;
      status.classList.add("is-typing");
      scroll();
      return () => {
        feed.querySelectorAll(".chat-typing").forEach((el) => el.remove());
        status.textContent = chat.subtitle || "";
        status.classList.remove("is-typing");
      };
    };

    const addMessage = (line, { mine = false, cutIn = false } = {}) => {
      const c = cast[line.who] || {};
      feed.insertAdjacentHTML("beforeend", mine
        ? `<div class="chat-msg is-mine"><div class="chat-msg__bubble"><p>${esc(line.text)}</p><small>${now()} <b class="chat-ticks">✓</b></small></div></div>`
        : `<div class="chat-msg ${cutIn ? "is-cutin" : ""}" data-tone="${esc(c.tone)}"><span class="chat-avatar">${esc((c.name || "?").slice(0, 1))}</span><div class="chat-msg__bubble"><strong>${esc(c.name)}</strong><p>${esc(line.text)}</p><small>${now()}</small></div></div>`);
      const el = feed.lastElementChild;
      requestAnimationFrame(() => el.classList.add("is-in"));
      scroll();
      return el;
    };

    async function typeIntoComposer(line, stopAt = null, prefix = "") {
      const text = line.text;
      const typo = line.typo && text.includes(line.typo.right) ? line.typo : null;
      const typoAt = typo ? text.indexOf(typo.right) : -1;
      let typed = prefix;
      for (let i = 0; i < text.length; i++) {
        if (destroyed) return typed;
        if (stopAt !== null && i >= stopAt) return typed;
        if (i === typoAt && !reduceMotion()) {
          for (const ch of typo.wrong) { typed += ch; setDraft(typed); await wait(human(ch)); }
          await wait(420);
          for (let k = 0; k < typo.wrong.length; k++) { typed = typed.slice(0, -1); setDraft(typed); await wait(55); }
          await wait(160);
        }
        typed += text[i];
        setDraft(typed);
        await wait(human(text[i]));
      }
      return typed;
    }

    for (let i = 0; i < (step.lines || []).length; i++) {
      const line = step.lines[i];
      if (destroyed) return;
      const narration = line.who === "narrador" || !(cast[line.who] && cast[line.who].name);
      if (narration) {
        feed.insertAdjacentHTML("beforeend", `<p class="chat-system">${esc(line.text)}</p>`);
        const el = feed.lastElementChild;
        requestAnimationFrame(() => el.classList.add("is-in"));
        scroll();
        await wait(1500);
        continue;
      }
      if (line.who === "voce" && !line.interrupted) {
        input.classList.add("is-focused");
        await wait(500);
        await typeIntoComposer(line);
        await wait(380);
        send.classList.add("is-pressed");
        await wait(160);
        send.classList.remove("is-pressed");
        setDraft("");
        const msg = addMessage(line, { mine: true });
        await wait(700);
        const ticks = msg.querySelector(".chat-ticks");
        if (ticks) { ticks.textContent = "✓✓"; }
        await wait(500);
        if (ticks) ticks.classList.add("is-read");
        await wait(500);
        continue;
      }
      if (line.who === "voce" && line.interrupted) {
        // Você digita… e no meio a outra pessoa começa a digitar e envia antes.
        input.classList.add("is-focused");
        const cutAt = Math.floor(line.text.length * 0.62);
        const firstPart = await typeIntoComposer(line, cutAt);
        const clearTyping = typingRow(step.lines[i + 1]?.who || "carla");
        // continua digitando mais um pouco enquanto ela digita
        await typeIntoComposer({ text: line.text.slice(cutAt) }, null, firstPart);
        await wait(250);
        clearTyping();
        const cut = step.lines[i + 1];
        if (cut) {
          addMessage(cut, { cutIn: true });
          stage.querySelector(".chat-app").classList.add("is-jolt");
          setTimeout(() => stage.querySelector(".chat-app")?.classList.remove("is-jolt"), 500);
          i += 1;
        }
        input.classList.add("is-stalled");
        await wait(900);
        // rascunho fica parado, marcado como não enviado
        input.insertAdjacentHTML("beforeend", `<span class="chat-app__unsent">não enviado</span>`);
        await wait(700);
        continue;
      }
      // mensagem de outra pessoa: digitando… e chega
      const clearTyping = typingRow(line.who);
      await wait(Math.min(2600, 700 + line.text.length * 22));
      clearTyping();
      addMessage(line);
      await wait(900);
    }
    stage.querySelector(".chat-app__composer")?.classList.add("is-idle");
    const actions = stage.querySelector(".story-actions");
    if (!actions) return;
    actions.hidden = false;
    bindNext(stage);
  }

  function renderChoice(step) {
    let chosen = null;
    stage.innerHTML = `<div class="story-card">
      <span class="story-chip story-chip--decision">Sua decisão</span>
      <h3 class="story-prompt">${esc(step.prompt)}</h3>
      <div class="story-options">${step.options.map((o, i) => `<button type="button" class="story-option" data-option="${i}">${esc(o.text)}</button>`).join("")}</div>
      <div class="story-outcome" hidden></div>
    </div>`;
    const outcome = stage.querySelector(".story-outcome");
    stage.querySelectorAll("[data-option]").forEach((btn) => btn.addEventListener("click", async () => {
      const option = step.options[Number(btn.dataset.option)];
      // Trocar de escolha desfaz o efeito da anterior no clima.
      if (chosen) setMeter(-(chosen.meter || 0));
      chosen = option;
      setMeter(option.meter || 0);
      stage.querySelectorAll("[data-option]").forEach((b) => { b.classList.toggle("is-picked", b === btn); b.disabled = true; });
      const tone = (option.meter || 0) > 0 ? "good" : (option.meter || 0) < 0 ? "tense" : "neutral";
      outcome.hidden = false;
      outcome.dataset.tone = tone;
      outcome.innerHTML = `<div class="story-dialog"></div>`;
      await playLines(outcome.querySelector(".story-dialog"), option.outcome?.lines || []);
      if (destroyed || !stage.contains(outcome)) return;
      outcome.insertAdjacentHTML("beforeend", `
        ${option.outcome?.note ? `<div class="story-note" data-tone="${tone}"><b>${tone === "good" ? "Funcionou" : tone === "tense" ? "O que aconteceu" : "Repare"}</b><p>${esc(option.outcome.note)}</p></div>` : ""}
        <div class="story-actions">
          <button type="button" class="story-retry" data-retry>Tentar outra resposta</button>
          ${nextButton()}
        </div>`);
      outcome.querySelector("[data-retry]").addEventListener("click", () => {
        stage.querySelectorAll("[data-option]").forEach((b) => { b.disabled = false; b.classList.remove("is-picked"); });
        outcome.hidden = true;
        outcome.innerHTML = "";
      });
      bindNext(outcome);
    }));
  }

  function renderSlider(step) {
    const faces = ["🙂", "😐", "😣"];
    stage.innerHTML = `<div class="story-card">
      <span class="story-chip">Termômetro pessoal</span>
      <h3 class="story-prompt">${esc(step.prompt)}</h3>
      <div class="story-slider">
        <span class="story-face" aria-hidden="true">😐</span>
        <input type="range" min="0" max="100" value="50" aria-label="${esc(step.prompt)}">
        <div class="story-slider__labels"><span>${esc(step.min)}</span><span>${esc(step.max)}</span></div>
      </div>
      <div class="story-note" data-tone="neutral"><p class="story-tip"></p></div>
      <div class="story-actions">${nextButton()}</div>
    </div>`;
    const input = stage.querySelector("input");
    const update = () => {
      const third = Math.min(2, Math.floor(Number(input.value) / 34));
      stage.querySelector(".story-face").textContent = faces[third];
      stage.querySelector(".story-tip").textContent = step.tips[third];
    };
    input.addEventListener("input", update);
    update();
    bindNext(stage);
  }

  function renderBreath(step) {
    const total = Math.max(8, Number(step.seconds) || 24);
    stage.innerHTML = `<div class="story-card story-card--breath">
      <span class="story-chip">Pausa guiada</span>
      <p class="story-prompt story-prompt--soft">${esc(step.text)}</p>
      <div class="story-breath"><div class="story-breath__circle"><span>Inspire</span></div></div>
      <p class="story-breath__count" aria-live="polite">${total}s</p>
      <div class="story-actions">
        <button type="button" class="story-retry" data-skip>Pular pausa</button>
        <button type="button" class="story-next" data-next disabled>Continuar →</button>
      </div>
    </div>`;
    const circle = stage.querySelector(".story-breath__circle");
    const label = circle.querySelector("span");
    const count = stage.querySelector(".story-breath__count");
    const next = stage.querySelector("[data-next]");
    let left = total;
    let phase = 0; // 4 s inspira, 6 s solta
    const cycle = () => {
      if (destroyed || !stage.contains(circle)) return;
      const inhale = phase % 2 === 0;
      label.textContent = inhale ? "Inspire" : "Solte devagar";
      circle.classList.toggle("is-in", inhale);
      phase += 1;
      breathTimer = setTimeout(cycle, inhale ? 4000 : 6000);
    };
    let breathTimer = null;
    cycle();
    const tick = setInterval(() => {
      if (destroyed || !stage.contains(count)) { clearInterval(tick); clearTimeout(breathTimer); return; }
      left -= 1;
      count.textContent = left > 0 ? `${left}s` : "Pronto. Você está mais preparado(a) para a conversa.";
      if (left <= 0) { clearInterval(tick); clearTimeout(breathTimer); circle.classList.remove("is-in"); label.textContent = "✓"; next.disabled = false; }
    }, 1000);
    stage.querySelector("[data-skip]").addEventListener("click", () => { clearInterval(tick); clearTimeout(breathTimer); go(index + 1); });
    bindNext(stage);
  }

  function renderBuild(step) {
    const shuffled = [...step.pieces].sort(() => Math.random() - 0.5);
    // Garante que a ordem embaralhada não comece já resolvida.
    if (shuffled.every((p, i) => p.id === step.order[i])) shuffled.reverse();
    let picked = [];
    stage.innerHTML = `<div class="story-card">
      <span class="story-chip">Monte a fala</span>
      <h3 class="story-prompt">${esc(step.prompt)}</h3>
      <ol class="story-build__answer" aria-label="Sua fala"></ol>
      <div class="story-build__pool">${shuffled.map((p) => `<button type="button" class="story-piece" data-piece="${esc(p.id)}">${esc(p.text)}</button>`).join("")}</div>
      <div class="story-build__result"></div>
      <div class="story-actions"><button type="button" class="story-retry" data-reset hidden>Recomeçar</button></div>
    </div>`;
    const answer = stage.querySelector(".story-build__answer");
    const result = stage.querySelector(".story-build__result");
    const reset = stage.querySelector("[data-reset]");
    const draw = () => {
      answer.innerHTML = picked.map((id) => {
        const piece = step.pieces.find((p) => p.id === id);
        return `<li class="is-in"><p>${esc(piece.text)}</p></li>`;
      }).join("") || `<li class="story-build__empty">Toque nas partes abaixo para montar a fala.</li>`;
      stage.querySelectorAll("[data-piece]").forEach((btn) => { btn.hidden = picked.includes(btn.dataset.piece); });
      reset.hidden = picked.length === 0;
    };
    const check = () => {
      if (picked.length < step.pieces.length) return;
      const ok = picked.every((id, i) => id === step.order[i]);
      if (ok) {
        answer.querySelectorAll("li").forEach((li, i) => {
          const piece = step.pieces.find((p) => p.id === picked[i]);
          li.insertAdjacentHTML("afterbegin", `<span class="story-tag">${esc(piece.label)}</span>`);
          li.classList.add("is-right");
        });
        setMeter(1);
        result.innerHTML = `<div class="story-note" data-tone="good"><b>Isso!</b><p>${esc(step.success)}</p></div>`;
        reset.hidden = true;
        stage.querySelector(".story-actions").insertAdjacentHTML("beforeend", nextButton());
        bindNext(stage);
      } else {
        answer.classList.add("is-shake");
        setTimeout(() => answer.classList.remove("is-shake"), 500);
        result.innerHTML = `<div class="story-note" data-tone="neutral"><b>Quase</b><p>${esc(step.hint)}</p></div>`;
      }
    };
    stage.querySelectorAll("[data-piece]").forEach((btn) => btn.addEventListener("click", () => {
      picked.push(btn.dataset.piece);
      result.innerHTML = "";
      draw();
      check();
    }));
    reset.addEventListener("click", () => { picked = []; result.innerHTML = ""; draw(); });
    draw();
  }

  function renderReflect(step) {
    stage.innerHTML = `<div class="story-card story-card--shield">
      <span class="story-chip story-chip--shield">Proteção</span>
      <h3 class="story-prompt">${esc(step.title)}</h3>
      <p class="story-prompt--soft">${esc(step.text)}</p>
      <div class="story-actions">${nextButton()}</div>
    </div>`;
    bindNext(stage);
  }

  function renderFinal() {
    markDots();
    const tone = meter >= 2 ? "good" : meter <= -2 ? "tense" : "neutral";
    const summary = tone === "good"
      ? "Você conduziu a conversa com clareza e respeito — a relação saiu fortalecida."
      : tone === "tense"
        ? "A conversa ficou tensa em alguns momentos. Tudo bem: você pode refazer o capítulo e testar outros caminhos."
        : "Você passou pela conversa com equilíbrio. Com as falas certas, ela pode ficar ainda mais leve.";
    const quiz = module.quiz;
    stage.innerHTML = `<div class="story-card story-card--final">
      <span class="story-chip story-chip--decision">Fim do capítulo</span>
      <div class="story-note" data-tone="${tone}"><b>Como foi</b><p>${esc(summary)}</p></div>
      ${module.takeaway ? `<div class="story-takeaway"><small>Leve para o trabalho</small><p>${esc(module.takeaway)}</p></div>` : ""}
      ${completed ? `<p class="story-done">✓ Capítulo já concluído. Pode refazer quando quiser.</p>
        <div class="story-actions"><button type="button" class="story-retry" data-replay>Refazer</button><button type="button" class="story-next" data-close>Fechar</button></div>`
      : `<fieldset class="story-quiz">
          <legend>${esc(quiz.question)}</legend>
          ${quiz.options.map((o, i) => `<label><input type="radio" name="storyAnswer" value="${i}"><span>${esc(o)}</span></label>`).join("")}
        </fieldset>
        <div class="story-quiz__feedback" role="status" aria-live="polite"></div>
        <div class="story-actions"><button type="button" class="story-retry" data-replay>Refazer capítulo</button><button type="button" class="story-next" data-submit>Concluir capítulo</button></div>`}
    </div>`;
    requestAnimationFrame(() => stage.classList.add("is-in"));
    stage.querySelector("[data-replay]")?.addEventListener("click", () => { meter = 0; setMeter(0); go(0); });
    stage.querySelector("[data-close]")?.addEventListener("click", () => onClose?.());
    const submit = stage.querySelector("[data-submit]");
    submit?.addEventListener("click", async () => {
      const feedback = stage.querySelector(".story-quiz__feedback");
      const selected = stage.querySelector('input[name="storyAnswer"]:checked');
      if (!selected) { feedback.textContent = "Escolha uma resposta para concluir."; feedback.className = "story-quiz__feedback is-error"; return; }
      submit.disabled = true; submit.textContent = "Registrando…";
      const res = await onSubmit?.(Number(selected.value));
      if (res?.ok) {
        stage.querySelector(".story-card").classList.add("is-celebrate");
        feedback.textContent = res.explanation || "Capítulo concluído!";
        feedback.className = "story-quiz__feedback is-success";
        submit.textContent = "Continuar jornada";
        submit.disabled = false;
        submit.replaceWith(submit.cloneNode(true));
        stage.querySelector("[data-submit]").addEventListener("click", () => onClose?.(true));
      } else {
        feedback.textContent = res?.explanation || res?.error || "Revise e tente novamente.";
        feedback.className = "story-quiz__feedback is-error";
        submit.disabled = false; submit.textContent = "Tentar novamente";
      }
    });
  }

  go(0);
  return { destroy() { destroyed = true; root.innerHTML = ""; } };
}

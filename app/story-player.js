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

  // Mostra falas uma a uma (efeito de conversa acontecendo).
  async function playLines(container, lines) {
    for (const line of lines) {
      if (destroyed) return;
      container.insertAdjacentHTML("beforeend", bubble(line));
      const el = container.lastElementChild;
      requestAnimationFrame(() => el.classList.add("is-in"));
      await wait(line.who === "narrador" ? 650 : 900);
    }
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
    stage.innerHTML = `<div class="story-card">
      ${step.title ? `<span class="story-chip">${esc(step.title)}</span>` : ""}
      <div class="story-dialog"></div>
      <div class="story-actions" hidden>${nextButton()}</div>
    </div>`;
    requestAnimationFrame(() => stage.classList.add("is-in"));
    await playLines(stage.querySelector(".story-dialog"), step.lines || []);
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

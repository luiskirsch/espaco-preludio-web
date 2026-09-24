// Tour de boas-vindas pra profissionais novos. Roda 1x na 1ª entrada no painel,
// marca como visto em localStorage. Pode ser disparado de novo via
// window.epRunOnboarding() (botão "Refazer tour" na página Suporte).

// v3: apresentação premium com navegação acessível e conteúdo atualizado.
// Bump da chave apresenta a nova experiência também a quem concluiu a v2.
const STORAGE_KEY = "ep:onboarded:v3";

const STEPS = [
  {
    eyebrow: "Bem-vindo",
    title: "Sua plataforma clínica completa",
    body: "Conheça, em seis passos, os recursos que transformam sua rotina — do primeiro agendamento à gestão completa do consultório.\n\nLeva menos de dois minutos e você pode rever esta apresentação quando quiser pelo Suporte.",
    meta: "6 recursos essenciais · menos de 2 minutos",
    icon: "sparkles",
    cta: "Começar tour"
  },
  {
    eyebrow: "Passo 1 de 6",
    title: "Apareça no diretório público",
    body: "Pacientes encontram você pelo diretório (/profissionais) e marcam consulta direto — você só aprova as solicitações no painel.\n\nProfissionais com inscrição no conselho verificada ganham o <strong>selo azul</strong>, igual nas redes sociais. Mais credibilidade, mais agendamentos.",
    meta: "Presença digital e novos pacientes",
    icon: "profile",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 2 de 6",
    title: "Crie consultas e atenda em E2EE",
    body: "\"+ Nova consulta\" no painel: defina horário e paciente, a plataforma gera um link único. Paciente entra com 1 clique — sem login, sem app.\n\nVídeo com criptografia ponta-a-ponta (E2EE). Nem o servidor vê o conteúdo da sessão.",
    meta: "Agenda simples e privacidade E2EE",
    icon: "video",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 3 de 6",
    title: "Pacientes cifrados, com tags",
    body: "Dados de paciente cifrados no SEU navegador antes de subir — só você lê.\n\nAdicione <strong>tags</strong> (ansiedade, casal, convênio…) pra categorizar e achar rápido. Envie <strong>anamnese</strong> e <strong>escalas validadas</strong> (PHQ-9, GAD-7) direto pro paciente responder em casa.",
    meta: "Prontuário organizado e protegido",
    icon: "shield",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 4 de 6",
    title: "Receita, documentos e recibos",
    body: "Emita receita digital, atestado, encaminhamento, laudo — conforme seu conselho (CRM, CRP, CREFITO, CRN, CRO…). PDF com sua logo.\n\nFechou consulta? Botão <strong>Recibo</strong> gera transação no financeiro + envia por e-mail e WhatsApp. Tudo num clique.",
    meta: "Documentação clínica em poucos cliques",
    icon: "document",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 5 de 6",
    title: "Cmd+K, tema escuro e notas",
    body: "Aperte <kbd>Cmd+K</kbd> (ou <kbd>Ctrl+K</kbd>) em qualquer página pra navegação instantânea.\n\nLua/sol no canto superior alterna <strong>tema escuro</strong>. E cada consulta tem nota pré-sessão (📝) — lembrete rápido pra você consultar antes da chamada.",
    meta: "Atalhos para uma rotina mais fluida",
    icon: "command",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 6 de 6",
    title: "Automatize e relaxe",
    body: "WhatsApp confirma a consulta na hora e lembra 24h antes. Aniversariantes recebem mensagem automática. Relatórios mostram analytics e NPS.\n\nNo plano Profissional, são 30 dias grátis após cadastrar o meio de pagamento. Quando precisar, o Suporte reúne FAQ e contato direto.",
    meta: "Automação que trabalha com você",
    icon: "automation",
    cta: "Começar a usar"
  }
];

function isOnboarded() {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
function markOnboarded() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
}

function stepIcon(name) {
  const paths = {
    sparkles: '<path d="M12 3l1.25 3.75L17 8l-3.75 1.25L12 13l-1.25-3.75L7 8l3.75-1.25L12 3Z"/><path d="M18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="M5 14l.9 2.6L8.5 17.5l-2.6.9L5 21l-.9-2.6-2.6-.9 2.6-.9L5 14Z"/>',
    profile: '<circle cx="12" cy="8" r="3.25"/><path d="M5.5 20c.45-4.05 2.6-6 6.5-6s6.05 1.95 6.5 6"/><path d="M17 5.5h4m-2-2v4"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 5-2.5v9L15 14"/><path d="M7 10.5h4M7 13.5h3"/>',
    shield: '<path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6l-7-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    document: '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
    command: '<path d="M9 8V6.5A2.5 2.5 0 1 0 6.5 9H8m7 0h1.5A2.5 2.5 0 1 0 14 6.5V8m0 7v1.5A2.5 2.5 0 1 0 16.5 14H15M8 14H6.5A2.5 2.5 0 1 0 9 16.5V15"/><rect x="8" y="8" width="7" height="7" rx="1.5"/>',
    automation: '<path d="M4 13a8 8 0 0 0 13.6 5.7L20 16M20 11A8 8 0 0 0 6.4 5.3L4 8"/><path d="M20 20v-4h-4M4 4v4h4"/><path d="m9 12 2 2 4-4"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
}

function ensureStyles() {
  if (document.getElementById("epOnboardingPremiumStyles")) return;
  const style = document.createElement("style");
  style.id = "epOnboardingPremiumStyles";
  style.textContent = `
    body.ep-onb-open { overflow: hidden; }
    #epOnboardingModal { padding: 24px; background: rgba(10, 14, 12, .68); backdrop-filter: blur(12px) saturate(.85); -webkit-backdrop-filter: blur(12px) saturate(.85); }
    #epOnboardingModal .ep-onb-panel { width: min(900px, calc(100vw - 48px)); max-width: 900px !important; min-height: min(560px, calc(100dvh - 64px)); max-height: calc(100dvh - 64px); margin: 0; padding: 0 !important; overflow: hidden; display: grid; grid-template-columns: 320px minmax(0, 1fr); border: 1px solid rgba(255,255,255,.66); border-radius: 26px; background: #fffaf0; box-shadow: 0 40px 100px rgba(0,0,0,.35), 0 12px 36px rgba(7,63,66,.2); }
    #epOnboardingModal .ep-onb-panel > .ep-onb-visual { position: relative; isolation: isolate; display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 38px 38px 40px; overflow: hidden; color: #f8f1df; background: radial-gradient(circle at 22% 18%, rgba(225,174,65,.23), transparent 30%), linear-gradient(150deg, #123f3e 0%, #082d2f 54%, #071e21 100%); }
    .ep-onb-visual::before, .ep-onb-visual::after { content: ""; position: absolute; z-index: -1; border: 1px solid rgba(226,183,106,.16); border-radius: 50%; }
    .ep-onb-visual::before { width: 360px; height: 360px; right: -210px; top: 70px; }
    .ep-onb-visual::after { width: 230px; height: 230px; right: -118px; top: 135px; box-shadow: 0 0 90px rgba(212,165,83,.09); }
    .ep-onb-brand { display: flex; align-items: center; gap: 12px; color: #f8f1df; }
    .ep-onb-brand__mark { width: 38px; height: 38px; flex: 0 0 auto; background: url("./logo_oficial_fundo_transparente.png?v=3") center/contain no-repeat; filter: drop-shadow(0 2px 8px rgba(0,0,0,.25)); }
    .ep-onb-brand__text { display: grid; line-height: 1.05; font-family: var(--ep-font-serif); font-size: 16px; font-weight: 600; }
    .ep-onb-brand__text small { margin-bottom: 4px; color: #d9b867; font: 700 9px/1 var(--ep-font-sans); letter-spacing: .2em; text-transform: uppercase; }
    .ep-onb-visual__stage { display: grid; place-items: center; flex: 1; min-height: 0; padding: 24px 0; }
    .ep-onb-orbit { position: relative; display: grid; place-items: center; width: 184px; height: 184px; border: 1px solid rgba(226,183,106,.2); border-radius: 50%; }
    .ep-onb-orbit::before, .ep-onb-orbit::after { content: ""; position: absolute; border-radius: 50%; }
    .ep-onb-orbit::before { inset: 18px; border: 1px dashed rgba(255,255,255,.13); animation: ep-onb-spin 24s linear infinite; }
    .ep-onb-orbit::after { width: 8px; height: 8px; top: 16px; left: 50%; background: #e2b76a; box-shadow: 0 0 18px rgba(226,183,106,.8); }
    .ep-onb-icon { position: relative; z-index: 1; display: grid; place-items: center; width: 92px; height: 92px; border: 1px solid rgba(226,183,106,.42); border-radius: 28px; color: #f2cc7b; background: linear-gradient(145deg, rgba(255,255,255,.1), rgba(255,255,255,.035)); box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 22px 46px rgba(0,0,0,.24); }
    .ep-onb-icon svg { width: 42px; height: 42px; }
    .ep-onb-visual__footer { display: flex; align-items: flex-end; justify-content: space-between; flex-shrink: 0; gap: 20px; padding-top: 22px; border-top: 1px solid rgba(255,255,255,.1); }
    .ep-onb-tour-label { color: rgba(248,241,223,.62); font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
    .ep-onb-visual-step { margin-top: 6px; color: #f8f1df; font-family: var(--ep-font-serif); font-size: 28px; line-height: 1; }
    .ep-onb-dots { display: flex; gap: 5px; padding-bottom: 3px; }
    .ep-onb-dot { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.22); transition: width .25s ease, background .25s ease; }
    .ep-onb-dot.is-active { width: 18px; border-radius: 99px; background: #e2b76a; }
    #epOnboardingModal .ep-onb-panel > .ep-onb-content { min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 38px 44px 40px; overflow: hidden; background: linear-gradient(145deg, #fffaf0 0%, #f8f0de 100%); color: #102f31; }
    .ep-onb-content__top { display: flex; align-items: center; gap: 16px; }
    .ep-onb-progress-label { flex: 0 0 auto; color: #77633f; font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    .ep-onb-progress { flex: 1; height: 4px; overflow: hidden; border-radius: 99px; background: rgba(13,67,67,.1); }
    .ep-onb-progress__bar { width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #b98016, #e0b04a); box-shadow: 0 0 12px rgba(185,128,22,.28); transition: width .35s cubic-bezier(.22,.61,.36,1); }
    .ep-onb-body { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: safe center; overflow-y: auto; padding: 32px 0 28px; }
    .ep-onb-eyebrow { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; margin: 0 0 18px; padding: 7px 11px; border: 1px solid rgba(164,113,18,.22); border-radius: 999px; color: #825b13; background: rgba(217,167,47,.1); font-size: 10px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
    .ep-onb-eyebrow::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #c58a1b; box-shadow: 0 0 0 4px rgba(197,138,27,.1); }
    .ep-onb-title { max-width: 520px; margin: 0; color: #0b383a; font-family: var(--ep-font-serif); font-size: clamp(32px, 4vw, 43px); font-weight: 600; line-height: 1.06; letter-spacing: -.025em; text-wrap: balance; }
    .ep-onb-meta { margin: 18px 0 0; color: #9b6f1c; font-size: 11px; font-weight: 700; letter-spacing: .055em; text-transform: uppercase; }
    .ep-onb-text { max-width: 58ch; margin: 24px 0 0; color: #40595a; font-size: 15px; line-height: 1.72; }
    .ep-onb-text strong { color: #123f41; font-weight: 700; }
    .ep-onb-text kbd { padding: 2px 6px; border: 1px solid rgba(14,64,65,.18); border-bottom-width: 2px; border-radius: 5px; background: rgba(255,255,255,.62); color: #123f41; font: 600 11px/1.4 var(--ep-font-sans); }
    .ep-onb-actions { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; gap: 16px; padding: 24px 0 0; border-top: 1px solid rgba(13,67,67,.1) !important; background: transparent !important; }
    .ep-onb-actions__right { display: flex; align-items: center; gap: 10px; }
    .ep-onb-actions button { min-height: 44px; border-radius: 12px; font-weight: 700; }
    #epOnbSkip { padding-inline: 4px; border-color: transparent; background: transparent; color: #657778; }
    #epOnbSkip:hover { color: #0b4547; background: transparent; }
    #epOnbPrev { min-width: 88px; border-color: rgba(13,67,67,.18); color: #17494b; background: rgba(255,255,255,.34); }
    #epOnbNext { min-width: 156px; padding-inline: 22px; border-color: #092f31; color: #fffaf0; background: linear-gradient(135deg, #124b4c, #092f31); box-shadow: 0 12px 24px -14px rgba(8,47,49,.8); }
    #epOnbNext:hover { border-color: #061f20; color: #fff; background: linear-gradient(135deg, #0e4143, #061f20); transform: translateY(-1px); }
    #epOnbNext svg { width: 16px; height: 16px; margin-left: 8px; }
    .ep-onb-panel.is-changing .ep-onb-title, .ep-onb-panel.is-changing .ep-onb-meta, .ep-onb-panel.is-changing .ep-onb-text, .ep-onb-panel.is-changing .ep-onb-icon { animation: ep-onb-enter .34s both; }
    @keyframes ep-onb-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes ep-onb-spin { to { transform: rotate(360deg); } }
    @media (max-width: 760px) {
      #epOnboardingModal { padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)) !important; align-items: flex-start; overflow-y: auto; }
      #epOnboardingModal .ep-onb-panel { width: min(100%, 560px); min-height: 0; max-height: none; margin: auto; overflow: visible; grid-template-columns: 1fr; border-radius: 22px; }
      #epOnboardingModal .ep-onb-panel > .ep-onb-visual { min-height: 156px; padding: 22px 24px; }
      .ep-onb-visual__stage { position: absolute; right: 20px; top: 28px; padding: 0; }
      .ep-onb-orbit { width: 94px; height: 94px; }
      .ep-onb-orbit::before { inset: 9px; }
      .ep-onb-orbit::after { width: 5px; height: 5px; top: 7px; }
      .ep-onb-icon { width: 54px; height: 54px; border-radius: 17px; }
      .ep-onb-icon svg { width: 27px; height: 27px; }
      .ep-onb-visual__footer { margin-top: 36px; padding-top: 15px; }
      #epOnboardingModal .ep-onb-panel > .ep-onb-content { padding: 28px 28px 30px; overflow: visible; }
      .ep-onb-body { padding: 28px 0 24px; overflow: visible; }
      .ep-onb-title { font-size: clamp(29px, 9vw, 37px); }
      .ep-onb-text { font-size: 14.5px; line-height: 1.62; }
      .ep-onb-actions { align-items: stretch; }
      .ep-onb-actions__right { flex: 1; justify-content: flex-end; }
      #epOnbNext { min-width: 142px; }
    }
    @media (max-width: 430px) {
      .ep-onb-brand__text { font-size: 14px; }
      .ep-onb-actions { flex-wrap: wrap-reverse; }
      #epOnbSkip { width: 100%; justify-content: center; }
      .ep-onb-actions__right { width: 100%; }
      .ep-onb-actions__right button { flex: 1; }
    }
    @media (prefers-reduced-motion: reduce) { .ep-onb-orbit::before, .ep-onb-panel.is-changing * { animation: none !important; } }
  `;
  document.head.appendChild(style);
}

function buildModal() {
  const wrap = document.createElement("div");
  wrap.className = "ep-modal is-open";
  wrap.id = "epOnboardingModal";
  wrap.innerHTML = `
    <div class="ep-modal__panel ep-onb-panel" role="dialog" aria-modal="true" aria-labelledby="epOnbTitle" aria-describedby="epOnbText" tabindex="-1">
      <aside class="ep-onb-visual" aria-hidden="true">
        <div class="ep-onb-brand"><span class="ep-onb-brand__mark"></span><span class="ep-onb-brand__text"><small>Espaço</small>Prelúdio</span></div>
        <div class="ep-onb-visual__stage"><div class="ep-onb-orbit"><div class="ep-onb-icon" id="epOnbVisualIcon"></div></div></div>
        <div class="ep-onb-visual__footer"><div><div class="ep-onb-tour-label">Tour guiado</div><div class="ep-onb-visual-step" id="epOnbVisualStep">Visão geral</div></div><div class="ep-onb-dots" id="epOnbDots"></div></div>
      </aside>
      <section class="ep-onb-content">
        <div class="ep-onb-content__top"><span class="ep-onb-progress-label" id="epOnbProgressLabel">Visão geral</span><div class="ep-onb-progress"><div class="ep-onb-progress__bar"></div></div></div>
        <div class="ep-onb-body" aria-live="polite">
          <div class="ep-onb-eyebrow">—</div>
          <h2 class="ep-onb-title" id="epOnbTitle">—</h2>
          <div class="ep-onb-meta">—</div>
          <p class="ep-onb-text" id="epOnbText">—</p>
        </div>
        <div class="ep-onb-actions">
          <button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" id="epOnbSkip">Pular apresentação</button>
          <div class="ep-onb-actions__right">
            <button type="button" class="ep-btn ep-btn--ghost" id="epOnbPrev" style="display:none;">Voltar</button>
            <button type="button" class="ep-btn ep-btn--primary" id="epOnbNext">Começar tour</button>
          </div>
        </div>
      </section>
    </div>
  `;
  return wrap;
}

export function runOnboarding({ force = false } = {}) {
  if (!force && isOnboarded()) return;

  document.getElementById("epOnboardingModal")?.remove();

  ensureStyles();
  const previousFocus = document.activeElement;
  const modal = buildModal();
  document.body.appendChild(modal);
  document.body.classList.add("ep-onb-open");
  const panel = modal.querySelector(".ep-onb-panel");
  const eyebrowEl = modal.querySelector(".ep-onb-eyebrow");
  const titleEl   = modal.querySelector(".ep-onb-title");
  const textEl    = modal.querySelector(".ep-onb-text");
  const metaEl    = modal.querySelector(".ep-onb-meta");
  const nextBtn   = modal.querySelector("#epOnbNext");
  const prevBtn   = modal.querySelector("#epOnbPrev");
  const skipBtn   = modal.querySelector("#epOnbSkip");
  const bar       = modal.querySelector(".ep-onb-progress__bar");
  const progressLabel = modal.querySelector("#epOnbProgressLabel");
  const visualStep = modal.querySelector("#epOnbVisualStep");
  const visualIcon = modal.querySelector("#epOnbVisualIcon");
  const dots = modal.querySelector("#epOnbDots");

  dots.innerHTML = Array.from({ length: STEPS.length - 1 }, (_, i) => `<span class="ep-onb-dot" data-step="${i + 1}"></span>`).join("");

  let index = 0;
  function render() {
    const step = STEPS[index];
    eyebrowEl.textContent = step.eyebrow;
    titleEl.textContent   = step.title;
    metaEl.textContent    = step.meta || "";
    // Os corpos incluem HTML inline (<strong>, <kbd>) — não escapa.
    // Conteúdo é trusted (constante hardcoded), sem user input.
    textEl.innerHTML = step.body.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
    nextBtn.innerHTML     = `${step.cta}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
    prevBtn.style.display = index === 0 ? "none" : "inline-flex";
    skipBtn.style.display = index === STEPS.length - 1 ? "none" : "inline-flex";
    const currentStep = Math.max(0, index);
    const totalSteps = STEPS.length - 1;
    bar.style.width = `${(currentStep / totalSteps) * 100}%`;
    progressLabel.textContent = index === 0 ? "Visão geral" : `Passo ${index} de ${totalSteps}`;
    visualStep.textContent = index === 0 ? "00 / 06" : `${String(index).padStart(2, "0")} / 06`;
    visualIcon.innerHTML = stepIcon(step.icon);
    dots.querySelectorAll(".ep-onb-dot").forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex + 1 === index));
    panel.classList.remove("is-changing");
    void panel.offsetWidth;
    panel.classList.add("is-changing");
  }
  function close() {
    markOnboarded();
    document.body.classList.remove("ep-onb-open");
    modal.remove();
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  }

  nextBtn.addEventListener("click", () => {
    if (index === STEPS.length - 1) close();
    else { index++; render(); }
  });
  prevBtn.addEventListener("click", () => { if (index > 0) { index--; render(); } });
  skipBtn.addEventListener("click", close);

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" && index < STEPS.length - 1) { index++; render(); }
    else if (e.key === "ArrowLeft" && index > 0) { index--; render(); }
    else if (e.key === "Tab") {
      const focusable = [...modal.querySelectorAll("button:not([style*='display:none'])")].filter(el => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  render();
  panel.focus();
}

// Expõe global pra rerun manual via página de suporte ("Refazer tour").
if (typeof window !== "undefined") {
  window.epRunOnboarding = (force = true) => runOnboarding({ force });
}

// Tour de boas-vindas pra profissionais novos. Roda 1x na 1ª entrada no painel,
// marca como visto em localStorage. Pode ser disparado de novo via
// window.epRunOnboarding() (botão "Refazer tour" na página Suporte).

// v2: tour atualizado com diretório público, escalas/anamnese, Cmd+K, tema escuro,
// tags, recibos. Bump da chave força rerun mesmo pra quem já viu a v1.
const STORAGE_KEY = "ep:onboarded:v2";

const STEPS = [
  {
    eyebrow: "Bem-vindo",
    title: "Sua plataforma clínica completa",
    body: "Em 6 passos rápidos vamos te mostrar tudo que você ganha aqui — do diretório público à emissão de receita.\n\nNão precisa decorar nada: vai aparecer no canto sempre que voltar pelo Suporte.",
    cta: "Começar tour"
  },
  {
    eyebrow: "Passo 1 de 6",
    title: "Apareça no diretório público",
    body: "Pacientes encontram você pelo diretório (/profissionais) e marcam consulta direto — você só aprova as solicitações no painel.\n\nProfissionais com inscrição no conselho verificada ganham o <strong>selo azul</strong>, igual nas redes sociais. Mais credibilidade, mais agendamentos.",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 2 de 6",
    title: "Crie consultas e atenda em E2EE",
    body: "\"+ Nova consulta\" no painel: defina horário e paciente, a plataforma gera um link único. Paciente entra com 1 clique — sem login, sem app.\n\nVídeo com criptografia ponta-a-ponta (E2EE). Nem o servidor vê o conteúdo da sessão.",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 3 de 6",
    title: "Pacientes cifrados, com tags",
    body: "Dados de paciente cifrados no SEU navegador antes de subir — só você lê.\n\nAdicione <strong>tags</strong> (ansiedade, casal, convênio…) pra categorizar e achar rápido. Envie <strong>anamnese</strong> e <strong>escalas validadas</strong> (PHQ-9, GAD-7) direto pro paciente responder em casa.",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 4 de 6",
    title: "Receita, documentos e recibos",
    body: "Emita receita digital, atestado, encaminhamento, laudo — conforme seu conselho (CRM, CRP, CREFITO, CRN, CRO…). PDF com sua logo.\n\nFechou consulta? Botão <strong>Recibo</strong> gera transação no financeiro + envia por e-mail e WhatsApp. Tudo num clique.",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 5 de 6",
    title: "Cmd+K, tema escuro e notas",
    body: "Aperte <kbd>Cmd+K</kbd> (ou <kbd>Ctrl+K</kbd>) em qualquer página pra navegação instantânea.\n\nLua/sol no canto superior alterna <strong>tema escuro</strong>. E cada consulta tem nota pré-sessão (📝) — lembrete rápido pra você consultar antes da chamada.",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 6 de 6",
    title: "Automatize e relaxe",
    body: "WhatsApp confirma a consulta na hora e lembra 24h antes. Aniversariantes recebem mensagem automática. Relatórios mostram analytics e NPS.\n\n30 dias de trial grátis. Dúvidas? Página \"Suporte\" tem FAQ e contato direto.",
    cta: "Começar a usar"
  }
];

function isOnboarded() {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
function markOnboarded() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
}

function buildModal() {
  const wrap = document.createElement("div");
  wrap.className = "ep-modal is-open";
  wrap.id = "epOnboardingModal";
  wrap.innerHTML = `
    <div class="ep-modal__panel ep-onb-panel">
      <div class="ep-onb-progress"><div class="ep-onb-progress__bar"></div></div>
      <div class="ep-onb-body">
        <div class="ep-eyebrow ep-onb-eyebrow">—</div>
        <h2 class="ep-onb-title">—</h2>
        <p class="ep-onb-text">—</p>
      </div>
      <div class="ep-onb-actions">
        <button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" id="epOnbSkip">Pular</button>
        <div class="ep-onb-actions__right">
          <button type="button" class="ep-btn ep-btn--ghost" id="epOnbPrev" style="display:none;">Voltar</button>
          <button type="button" class="ep-btn ep-btn--primary" id="epOnbNext">Começar tour</button>
        </div>
      </div>
    </div>
  `;
  return wrap;
}

export function runOnboarding({ force = false } = {}) {
  if (!force && isOnboarded()) return;

  document.getElementById("epOnboardingModal")?.remove();

  const modal = buildModal();
  document.body.appendChild(modal);
  const eyebrowEl = modal.querySelector(".ep-onb-eyebrow");
  const titleEl   = modal.querySelector(".ep-onb-title");
  const textEl    = modal.querySelector(".ep-onb-text");
  const nextBtn   = modal.querySelector("#epOnbNext");
  const prevBtn   = modal.querySelector("#epOnbPrev");
  const skipBtn   = modal.querySelector("#epOnbSkip");
  const bar       = modal.querySelector(".ep-onb-progress__bar");

  let index = 0;
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }
  function render() {
    const step = STEPS[index];
    eyebrowEl.textContent = step.eyebrow;
    titleEl.textContent   = step.title;
    // Os corpos da v2 incluem HTML inline (<strong>, <kbd>) — não escapa.
    // Conteúdo é trusted (constante hardcoded), sem user input.
    textEl.innerHTML = step.body.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
    nextBtn.textContent   = step.cta;
    prevBtn.style.display = index === 0 ? "none" : "inline-flex";
    skipBtn.style.display = index === STEPS.length - 1 ? "none" : "inline-flex";
    bar.style.width = `${((index + 1) / STEPS.length) * 100}%`;
  }
  function close() {
    markOnboarded();
    modal.remove();
  }

  nextBtn.addEventListener("click", () => {
    if (index === STEPS.length - 1) close();
    else { index++; render(); }
  });
  prevBtn.addEventListener("click", () => { if (index > 0) { index--; render(); } });
  skipBtn.addEventListener("click", close);

  // Fecha com Esc (mesmo comportamento dos outros modais).
  modal.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  render();
}

// Expõe global pra rerun manual via página de suporte ("Refazer tour").
if (typeof window !== "undefined") {
  window.epRunOnboarding = (force = true) => runOnboarding({ force });
}

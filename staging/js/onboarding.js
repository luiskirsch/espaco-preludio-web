// Tour de boas-vindas pra profissionais novos. Roda 1x na 1ª entrada no painel,
// marca como visto em localStorage. Pode ser disparado de novo via
// window.epRunOnboarding() (botão "Refazer tour" na página Suporte).

const STORAGE_KEY = "ep:onboarded:v1";

const STEPS = [
  {
    eyebrow: "Bem-vindo",
    title: "Sua plataforma clínica completa",
    body: "Em 4 passos vamos te mostrar o essencial pra começar a atender hoje.\n\nNada de cadastro complicado: o que você precisa pra ver paciente, emitir receita e fechar o mês.",
    cta: "Começar tour"
  },
  {
    eyebrow: "Passo 1 de 4",
    title: "Crie consultas em segundos",
    body: "No painel principal, clique em \"+ Nova consulta\". Defina horário, paciente, e a plataforma gera um link único.\n\nO paciente entra com 1 clique no link — sem login, sem instalar app. Videochamada com criptografia ponta-a-ponta (E2EE).",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 2 de 4",
    title: "Pacientes cifrados no seu navegador",
    body: "Cadastre seus pacientes uma vez (nome, telefone, dados clínicos) e use em toda consulta futura.\n\nDados sensíveis são cifrados no SEU navegador antes de subir. Mesmo o servidor não consegue ler — só você.",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 3 de 4",
    title: "Receita e documentos com 1 clique",
    body: "Emita receita digital, atestado, encaminhamento, relatório — tudo conforme seu conselho (CRM, CRP, CREFITO, CRN, CRO, etc).\n\nPDF com sua identificação e logo. Paciente recebe por e-mail ou baixa direto.",
    cta: "Próximo"
  },
  {
    eyebrow: "Passo 4 de 4",
    title: "Tudo no piloto automático",
    body: "WhatsApp manda confirmação ao criar consulta e lembrete 24h antes (ative em \"WhatsApp\").\n\nFinanceiro, agenda, estoque, calculadora clínica — você tem 30 dias de trial grátis pra explorar.\n\nDúvidas? A página \"Suporte\" tem FAQ e contato direto.",
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
    // Escapa o corpo e converte \n\n em parágrafos / \n em <br>.
    textEl.innerHTML = escapeHtml(step.body).replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
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

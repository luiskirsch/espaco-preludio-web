// i18n leve client-side. Cobertura inicial: páginas voltadas ao paciente
// (agendar.html, paciente-login.html, paciente-painel.html) — o profissional
// permanece em PT, pra evitar refator pesado em 100+ HTMLs.
//
// Uso: elementos com `data-i18n="chave"` recebem o texto traduzido.
// Persiste lang em localStorage `ep:lang`. Detect auto via navigator.language
// só na primeira visita (depois respeita escolha do user).
//
// Adicione novas chaves só conforme necessidade — não traduza tudo de uma vez.

const STORAGE_KEY = "ep:lang";
const SUPPORTED = ["pt", "en"];

const DICTIONARIES = {
  pt: {
    // Botões e navegação comuns ao paciente
    "common.back":         "Voltar",
    "common.cancel":       "Cancelar",
    "common.confirm":      "Confirmar",
    "common.save":         "Salvar",
    "common.loading":      "Carregando…",
    "common.error":        "Erro",
    "common.success":      "Pronto!",
    "common.next":         "Próximo",
    "common.previous":     "Anterior",

    // agendar.html
    "schedule.title":          "Agendar consulta",
    "schedule.findTime":       "Encontre um horário",
    "schedule.selectDate":     "Escolha a data",
    "schedule.selectTime":     "Escolha o horário",
    "schedule.patientInfo":    "Seus dados",
    "schedule.patientName":    "Seu nome completo",
    "schedule.patientEmail":   "E-mail",
    "schedule.patientPhone":   "WhatsApp",
    "schedule.bookBtn":        "Solicitar agendamento",
    "schedule.confirmTitle":   "Solicitação enviada",
    "schedule.confirmSub":     "O profissional vai confirmar em breve. Você recebe um e-mail.",
    "schedule.empty":          "Sem horários disponíveis nesta data.",
    "schedule.verifiedBadge":  "Profissional verificado",

    // paciente-login.html
    "patientLogin.title":      "Entrar no portal do paciente",
    "patientLogin.sub":        "Acesse seu histórico de sessões, recibos e documentos.",
    "patientLogin.email":      "E-mail cadastrado",
    "patientLogin.btn":        "Receber link de acesso",
    "patientLogin.help":       "Não tem conta? Peça ao seu terapeuta para criar o seu cadastro.",
    "patientLogin.sent":       "Link enviado! Confira seu e-mail.",

    // paciente-painel.html
    "patientPanel.title":      "Seu histórico",
    "patientPanel.sessions":   "Sessões",
    "patientPanel.receipts":   "Recibos",
    "patientPanel.documents":  "Documentos",
    "patientPanel.empty":      "Nada por aqui ainda.",
    "patientPanel.viewBtn":    "Ver",
    "patientPanel.downloadBtn":"Baixar PDF",
    "patientPanel.logout":     "Sair"
  },
  en: {
    "common.back":         "Back",
    "common.cancel":       "Cancel",
    "common.confirm":      "Confirm",
    "common.save":         "Save",
    "common.loading":      "Loading…",
    "common.error":        "Error",
    "common.success":      "Done!",
    "common.next":         "Next",
    "common.previous":     "Previous",

    "schedule.title":          "Book a session",
    "schedule.findTime":       "Find a time",
    "schedule.selectDate":     "Pick a date",
    "schedule.selectTime":     "Pick a time",
    "schedule.patientInfo":    "Your details",
    "schedule.patientName":    "Full name",
    "schedule.patientEmail":   "Email",
    "schedule.patientPhone":   "WhatsApp / phone",
    "schedule.bookBtn":        "Request appointment",
    "schedule.confirmTitle":   "Request sent",
    "schedule.confirmSub":     "The professional will confirm shortly. You'll get an email.",
    "schedule.empty":          "No slots available on this date.",
    "schedule.verifiedBadge":  "Verified professional",

    "patientLogin.title":      "Patient portal sign-in",
    "patientLogin.sub":        "Access your session history, receipts and documents.",
    "patientLogin.email":      "Registered email",
    "patientLogin.btn":        "Send me a sign-in link",
    "patientLogin.help":       "No account? Ask your therapist to register you.",
    "patientLogin.sent":       "Link sent — check your inbox.",

    "patientPanel.title":      "Your history",
    "patientPanel.sessions":   "Sessions",
    "patientPanel.receipts":   "Receipts",
    "patientPanel.documents":  "Documents",
    "patientPanel.empty":      "Nothing here yet.",
    "patientPanel.viewBtn":    "View",
    "patientPanel.downloadBtn":"Download PDF",
    "patientPanel.logout":     "Sign out"
  }
};

export function getLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {}
  // Auto-detect: en* → en, default pt.
  const nav = (navigator.language || "pt").toLowerCase();
  return nav.startsWith("en") ? "en" : "pt";
}

export function setLang(lang) {
  const l = SUPPORTED.includes(lang) ? lang : "pt";
  try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  applyTranslations();
  document.documentElement.setAttribute("lang", l === "en" ? "en" : "pt-BR");
  document.dispatchEvent(new CustomEvent("ep:lang-change", { detail: { lang: l } }));
  return l;
}

export function t(key) {
  const lang = getLang();
  return DICTIONARIES[lang]?.[key] ?? DICTIONARIES.pt[key] ?? key;
}

export function applyTranslations(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });
  scope.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.getAttribute("data-i18n-title");
    el.setAttribute("title", t(key));
  });
}

// Monta toggle PT/EN num container existente (ou cria flutuante).
export function mountLangToggle(container) {
  const host = container || document.body;
  if (host.querySelector(".ep-lang-toggle")) return;
  const wrap = document.createElement("div");
  wrap.className = "ep-lang-toggle";
  wrap.innerHTML = `
    <button type="button" data-lang="pt" class="${getLang() === "pt" ? "is-active" : ""}">PT</button>
    <button type="button" data-lang="en" class="${getLang() === "en" ? "is-active" : ""}">EN</button>
  `;
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-lang]");
    if (!btn) return;
    setLang(btn.getAttribute("data-lang"));
    wrap.querySelectorAll("button[data-lang]").forEach(b => {
      b.classList.toggle("is-active", b.getAttribute("data-lang") === getLang());
    });
  });
  if (container) host.appendChild(wrap);
  else { wrap.style.position = "fixed"; wrap.style.top = "16px"; wrap.style.right = "16px"; wrap.style.zIndex = "100"; host.appendChild(wrap); }
}

// Aplica auto no load (módulos ES são deferred, DOM já existe).
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyTranslations());
  } else {
    applyTranslations();
  }
}

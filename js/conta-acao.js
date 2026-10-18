// Página de ações de conta: redefinir senha, confirmar e-mail e desfazer troca
// de e-mail. Substitui a página padrão do Firebase (domínio *.firebaseapp.com).
import {
  verifyPasswordResetCode, confirmPasswordReset, applyActionCode, checkActionCode, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js?v=20261018-mfa4";
import { parseActionParams, safeContinueUrl, actionErrorKey } from "./auth-action-core.js?v=1";
import { requestPasswordReset } from "./account-email.js?v=1";

function tr(key, fallback) {
  if (window.EP_I18N && window.EP_I18N.t) {
    const value = window.EP_I18N.t(key);
    if (value && value !== key) return value;
  }
  return fallback;
}
const $ = id => document.getElementById(id);
function show(stepId) {
  for (const step of document.querySelectorAll("[data-step]")) step.hidden = step.id !== stepId;
}
function setStatus(el, text, type = "") {
  el.textContent = text;
  el.className = "ep-status" + (type ? " is-" + type : "");
}

const { mode, oobCode, continueUrl } = parseActionParams(location.search);
const next = safeContinueUrl(continueUrl, location.href);
// O código do link é de uso único e dá acesso à conta: tira da barra de
// endereço e do histórico assim que lido.
history.replaceState(null, "", location.pathname);

const ERRORS = {
  expired: "Este link expirou. Peça um novo e-mail e use o link mais recente.",
  invalid: "Este link é inválido ou já foi usado. Se precisar, peça um novo e-mail.",
  disabled: "Esta conta está desativada. Fale com o suporte.",
  notFound: "Não encontramos a conta deste link.",
  weak: "Essa senha é fraca. Use pelo menos 10 caracteres, misturando letras e números.",
  tooMany: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  network: "Sem conexão. Verifique a internet e tente de novo.",
  generic: "Não foi possível concluir. Tente de novo ou peça um novo e-mail."
};
function fail(error) {
  const key = actionErrorKey(error?.code);
  $("errorMsg").textContent = tr("conta-acao:errors." + key, ERRORS[key]);
  show("stepError");
}
function finish(titleKey, titleText, messageKey, messageText) {
  $("doneTitle").textContent = tr(titleKey, titleText);
  $("doneMsg").textContent = tr(messageKey, messageText);
  $("continueBtn").hidden = !next;
  if (next) $("continueBtn").href = next;
  $("loginLinks").hidden = !!next;
  show("stepDone");
}

$("resetForm").addEventListener("submit", async event => {
  event.preventDefault();
  const password = $("newPassword").value;
  const status = $("resetStatus");
  if (password.length < 10) return setStatus(status, tr("conta-acao:reset.short", "A senha precisa ter pelo menos 10 caracteres."), "err");
  if (password !== $("confirmPassword").value) return setStatus(status, tr("conta-acao:reset.mismatch", "As duas senhas não são iguais."), "err");
  $("resetBtn").disabled = true;
  setStatus(status, tr("conta-acao:reset.saving", "Salvando a nova senha…"));
  try {
    await confirmPasswordReset(auth, oobCode, password);
    finish("conta-acao:done.resetTitle", "Senha redefinida",
      next ? "conta-acao:done.resetNext" : "conta-acao:done.resetMsg",
      next ? "Sua senha foi alterada. Toque em Continuar para concluir o acesso."
        : "Sua senha foi alterada. Se a sua conta guarda anotações cifradas, conclua em “Recuperar acesso” com a sua chave-semente.");
  } catch (error) {
    $("resetBtn").disabled = false;
    if (error?.code === "auth/weak-password") return setStatus(status, tr("conta-acao:errors.weak", ERRORS.weak), "err");
    fail(error);
  }
});

$("resendBtn").addEventListener("click", async () => {
  const email = $("resendBtn").dataset.email;
  const status = $("doneStatus");
  $("resendBtn").disabled = true;
  try {
    await requestPasswordReset({ backend: BACKEND_BASE_URL, email, retorno: "" });
    setStatus(status, tr("conta-acao:recover.sent", "Enviamos um link para redefinir a senha. Confira também o spam."), "ok");
  } catch (error) {
    $("resendBtn").disabled = false;
    setStatus(status, tr("conta-acao:errors." + actionErrorKey(error?.code), ERRORS[actionErrorKey(error?.code)]), "err");
  }
});

async function run() {
  if (!mode || !oobCode) return fail({ code: "auth/invalid-action-code" });
  try {
    if (mode === "resetPassword") {
      const email = await verifyPasswordResetCode(auth, oobCode);
      $("resetEmail").textContent = email;
      $("resetUsername").value = email; // gerenciadores de senha salvam na conta certa
      show("stepReset");
      $("newPassword").focus();
      return;
    }
    if (mode === "recoverEmail") {
      const info = await checkActionCode(auth, oobCode);
      await applyActionCode(auth, oobCode);
      const restored = info?.data?.email || "";
      finish("conta-acao:done.recoverTitle", "Alteração desfeita", "conta-acao:done.recoverMsg",
        "O e-mail de acesso da sua conta voltou a ser o anterior. Por segurança, recomendamos trocar a senha agora.");
      if (restored) { $("resendBtn").dataset.email = restored; $("resendBtn").hidden = false; }
      return;
    }
    await applyActionCode(auth, oobCode);
    finish("conta-acao:done.verifiedTitle", "E-mail confirmado", "conta-acao:done.verifiedMsg",
      "Pronto! Seu e-mail foi confirmado. Você já pode entrar na sua conta.");
  } catch (error) {
    console.error("account_action_error", error?.code || "unknown");
    fail(error);
  }
}

run();

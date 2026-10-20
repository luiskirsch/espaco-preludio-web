import { signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js?h=69b74fc63a";
import { clearDek } from "./crypto.js?h=e302c46b08";

const t = (key, fallback) => window.i18next?.t(`suporte:account.${key}`, { defaultValue: fallback }) || fallback;

export function setupAccountControls({ therapist }) {
  const $ = id => document.getElementById(id);
  const cancel = $("cancelSubscriptionBtn");
  const show = $("showCloseAccountBtn");
  const form = $("closeAccountForm");
  const close = $("closeAccountBtn");
  const keep = $("keepAccountBtn");
  const input = $("closeAccountConfirmation");
  const status = $("accountStatus");
  let busy = false;
  let hasSubscription = !!therapist.mpPreapprovalId && therapist.mpPreapprovalStatus !== "cancelled";

  function renderSubscription() {
    cancel.disabled = busy || !hasSubscription;
    if (!hasSubscription) {
      $("subscriptionDescription").removeAttribute("data-i18n");
      $("subscriptionDescription").textContent = t("noSubscription", "Sua conta não tem assinatura recorrente a cancelar. Você pode encerrar o cadastro abaixo, inclusive se for isento.");
    }
  }
  renderSubscription();
  document.addEventListener("ep:i18n-changed", renderSubscription);
  document.addEventListener("ep:i18n-ready", renderSubscription);

  show.addEventListener("click", () => {
    if (busy) return;
    form.classList.remove("ep-hide");
    show.setAttribute("aria-expanded", "true");
    input.focus();
  });
  keep.addEventListener("click", () => {
    if (busy) return;
    form.classList.add("ep-hide");
    form.reset();
    show.setAttribute("aria-expanded", "false");
    status.textContent = "";
    show.focus();
  });

  async function submit(closeAccount) {
    if (busy) return;
    if (closeAccount && input.value.trim() !== "ENCERRAR") {
      status.textContent = t("confirmationRequired", "Digite ENCERRAR para confirmar.");
      input.focus();
      return;
    }
    if (!closeAccount && !window.confirm(t("cancelPrompt", "Cancelar a assinatura e interromper as próximas cobranças?"))) return;
    busy = true;
    cancel.disabled = show.disabled = close.disabled = keep.disabled = true;
    status.textContent = t("processing", "Processando…");
    let closed = false;
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${BACKEND_BASE_URL}/therapy/profissional/${closeAccount ? "conta/encerrar" : "plano/cancelar"}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(closeAccount ? { confirmation: "ENCERRAR" } : {})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error("ACCOUNT_ACTION_FAILED");
      if (closeAccount) {
        closed = true;
        status.textContent = t("closed", "Conta profissional encerrada.");
        clearDek();
        await signOut(auth).catch(() => {});
        window.location.replace("./login.html");
      } else {
        hasSubscription = false;
        renderSubscription();
        status.textContent = t("cancelled", "Assinatura cancelada. Não haverá novas cobranças desta assinatura.");
      }
    } catch {
      status.textContent = t("error", "Não foi possível concluir. Tente novamente. Se o erro persistir, fale com o suporte pelos canais abaixo.");
    } finally {
      if (!closed) {
        busy = false;
        show.disabled = close.disabled = keep.disabled = false;
        renderSubscription();
      }
    }
  }
  cancel.addEventListener("click", () => submit(false));
  form.addEventListener("submit", event => {
    event.preventDefault();
    submit(true);
  });
}

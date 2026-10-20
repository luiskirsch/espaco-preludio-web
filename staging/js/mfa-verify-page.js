import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, AUTH_CONTEXT } from "./firebase-config.js?h=69b74fc63a";
import { ensureMfa } from "./mfa-flow.js?h=d60b79b944";
import { clear2faSession, mfaNavigation } from "./twofa-session.js?h=295a6b1bd5";
import { clearDek } from "./crypto.js?h=e302c46b08";
import { clearPatientDek } from "./patient-session.js?h=b2d1db5669";

const isRt = AUTH_CONTEXT === "rt";
const { loginPage, destination } = mfaNavigation(AUTH_CONTEXT, new URLSearchParams(location.search).get("redirect"));
const user = await new Promise(resolve => {
  const unsubscribe = onAuthStateChanged(auth, current => { unsubscribe(); resolve(current); });
});
// Sem login: vai para a tela de entrada e para aqui sem erro no console.
if (!user) { location.replace(loginPage); await new Promise(() => {}); }
const status = document.getElementById("status");
const retry = document.getElementById("retryBtn");
let entering = false;
async function enter() {
  if (entering) return;
  entering = true; retry.disabled = true; status.textContent = "";
  try {
    const result = await ensureMfa(user);
    if (!result.verified) throw new Error("PROFILE_REQUIRED");
    location.replace(destination);
  } catch (error) {
    // O modal é a interface principal; o cartão só aparece como plano B
    // (tentar de novo ou sair) depois de cancelar ou falhar.
    document.getElementById("twofaFallback").classList.remove("ep-hide");
    document.getElementById("twofaLogout").classList.remove("ep-hide");
    status.textContent = error.code === "MFA_CANCELLED"
      ? "Conclua a verificação em duas etapas para continuar."
      : "Não foi possível concluir a verificação. Tente novamente ou entre novamente na sua conta.";
    entering = false; retry.disabled = false;
  }
}
retry.addEventListener("click", enter);
document.getElementById("logoutBtn").addEventListener("click", async () => {
  clear2faSession(); if (AUTH_CONTEXT === 'collaborator') clearPatientDek(); else if (!isRt) clearDek(); await signOut(auth); location.replace(loginPage);
});
enter();

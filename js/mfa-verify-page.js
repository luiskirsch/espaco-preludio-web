import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, authRt } from "./firebase-config.js?v=20261017-mfa3";
import { ensureMfa } from "./mfa-flow.js?v=20261017-mfa3";
import { clear2faSession, safeMfaReturn } from "./twofa-session.js?v=20261017-mfa3";
import { clearDek } from "./crypto.js";

const loginPage = auth === authRt ? "./rt-login.html" : "./login.html";
const user = await new Promise(resolve => {
  const unsubscribe = onAuthStateChanged(auth, current => { unsubscribe(); resolve(current); });
});
if (!user) { location.replace(loginPage); throw new Error("NOT_AUTH"); }
const status = document.getElementById("status");
const retry = document.getElementById("retryBtn");
const destination = safeMfaReturn(new URLSearchParams(location.search).get("redirect"), auth === authRt ? "./rt-painel.html" : "./painel.html");
let entering = false;
async function enter() {
  if (entering) return;
  entering = true; retry.disabled = true; status.textContent = "";
  try {
    const result = await ensureMfa(user);
    if (!result.verified) throw new Error("PROFILE_REQUIRED");
    location.replace(destination);
  } catch (error) {
    status.textContent = error.code === "MFA_CANCELLED"
      ? "Conclua a verificação em duas etapas para continuar."
      : "Não foi possível concluir a verificação. Tente novamente ou entre novamente na sua conta.";
    entering = false; retry.disabled = false;
  }
}
retry.addEventListener("click", enter);
document.getElementById("logoutBtn").addEventListener("click", async () => {
  clear2faSession(); if (auth !== authRt) clearDek(); await signOut(auth); location.replace(loginPage);
});
enter();

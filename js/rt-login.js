import {
  browserSessionPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";

const form = document.getElementById("rtLoginForm");
const emailEl = document.getElementById("rtEmail");
const passwordEl = document.getElementById("rtPassword");
const submit = document.getElementById("rtLoginSubmit");
const message = document.getElementById("rtLoginMessage");
let checking = false;

function setMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("is-error", error);
}

async function validateAccess(user) {
  const token = await user.getIdToken();
  const response = await fetch(`${BACKEND_BASE_URL}/rt/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "ACESSO_RT_NAO_LIBERADO");
  }
  return response.json();
}

onAuthStateChanged(auth, async user => {
  if (!user || checking) return;
  checking = true;
  try {
    setMessage("Validando seu vínculo técnico…");
    await validateAccess(user);
    window.location.replace("./rt-painel.html");
  } catch (error) {
    await signOut(auth);
    setMessage(error.message === "EMAIL_DO_RT_NAO_VERIFICADO"
      ? "Confirme seu e-mail antes de acessar."
      : "Este e-mail ainda não está autorizado como Responsável Técnico.", true);
    submit.disabled = false;
    checking = false;
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!emailEl.value.trim() || !passwordEl.value) {
    setMessage("Informe e-mail e senha.", true);
    return;
  }
  submit.disabled = true;
  setMessage("Autenticando…");
  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, emailEl.value.trim().toLowerCase(), passwordEl.value);
  } catch (error) {
    const code = error?.code || "";
    setMessage(code === "auth/too-many-requests"
      ? "Muitas tentativas. Aguarde alguns minutos."
      : "E-mail ou senha incorretos.", true);
    submit.disabled = false;
  }
});

document.getElementById("togglePassword").addEventListener("click", event => {
  const reveal = passwordEl.type === "password";
  passwordEl.type = reveal ? "text" : "password";
  event.currentTarget.textContent = reveal ? "Ocultar" : "Ver";
});

document.getElementById("forgotPassword").addEventListener("click", async () => {
  const email = emailEl.value.trim().toLowerCase();
  if (!email) return setMessage("Digite seu e-mail para recuperar a senha.", true);
  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("Enviamos as instruções de recuperação para seu e-mail.");
  } catch (_) {
    setMessage("Não foi possível enviar a recuperação. Confira o e-mail.", true);
  }
});


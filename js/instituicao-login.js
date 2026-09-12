import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";

const form = document.getElementById("institutionLoginForm");
const emailInput = document.getElementById("institutionEmail");
const passwordInput = document.getElementById("institutionPassword");
const submitButton = document.getElementById("loginSubmit");
const message = document.getElementById("loginMessage");
const passwordToggle = document.getElementById("passwordToggle");
const firstAccess = document.getElementById("firstAccess");
const forgotPassword = document.getElementById("forgotPassword");

function setMessage(text = "", type = "") {
  message.textContent = text;
  message.className = `form-message${type ? ` is-${type}` : ""}`;
}

function setBusy(busy, label = "Acessar painel") {
  submitButton.disabled = busy;
  submitButton.setAttribute("aria-busy", String(busy));
  submitButton.querySelector("span:first-child").textContent = label;
}

function authReady() {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

async function validateInstitutionAccess(user) {
  const token = await user.getIdToken();
  const response = await fetch(`${BACKEND_BASE_URL}/institution/overview`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data?.error || `HTTP_${response.status}`);
    error.code = data?.error || `HTTP_${response.status}`;
    throw error;
  }
  return data;
}

async function ensureVerifiedEmail(user) {
  if (user.emailVerified) return;
  await sendEmailVerification(user).catch(() => {});
  const error = new Error("EMAIL_INSTITUCIONAL_NAO_VERIFICADO");
  error.code = "EMAIL_INSTITUCIONAL_NAO_VERIFICADO";
  throw error;
}

function humanize(error) {
  const code = String(error?.code || error?.message || "");
  if (code.includes("ACESSO_INSTITUCIONAL_NAO_LIBERADO")) {
    return "Esta conta ainda não está vinculada a um programa ou unidade. Confirme o e-mail autorizado com nossa equipe.";
  }
  if (code.includes("auth/invalid-credential") || code.includes("auth/user-not-found") || code.includes("auth/wrong-password")) {
    return "E-mail ou senha incorretos.";
  }
  if (code.includes("auth/too-many-requests")) {
    return "Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar novamente.";
  }
  if (code.includes("auth/email-already-in-use")) {
    return "Este e-mail já possui uma conta. Entre com a senha existente ou use “Esqueci minha senha”.";
  }
  if (code.includes("auth/weak-password")) {
    return "Crie uma senha com pelo menos oito caracteres.";
  }
  if (code.includes("auth/network-request-failed") || code.includes("Failed to fetch")) {
    return "Não foi possível conectar. Verifique sua internet e tente novamente.";
  }
  if (code.includes("EMAIL_INSTITUCIONAL_OBRIGATORIO")) {
    return "Esta conta não possui um e-mail institucional válido.";
  }
  if (code.includes("EMAIL_INSTITUCIONAL_NAO_VERIFICADO")) {
    return "Enviamos uma confirmação para o seu e-mail. Abra a mensagem e confirme o endereço antes de entrar.";
  }
  return "Não foi possível acessar o painel agora. Tente novamente em instantes.";
}

passwordToggle.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  passwordToggle.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  passwordInput.focus();
});

firstAccess.addEventListener("click", async () => {
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!email || !emailInput.validity.valid) {
    setMessage("Informe o e-mail institucional autorizado no cadastro do programa.", "error");
    emailInput.focus();
    return;
  }
  if (password.length < 8) {
    setMessage("Para o primeiro acesso, crie uma senha com pelo menos oito caracteres.", "error");
    passwordInput.focus();
    return;
  }

  firstAccess.disabled = true;
  forgotPassword.disabled = true;
  setBusy(true, "Criando acesso…");
  setMessage("");
  try {
    await setPersistence(auth, browserSessionPersistence);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(credential.user);
    await signOut(auth);
    setMessage("Conta criada. Enviamos uma confirmação para o seu e-mail; confirme o endereço e depois entre no painel.", "success");
  } catch (error) {
    await signOut(auth).catch(() => {});
    setMessage(humanize(error), "error");
  } finally {
    firstAccess.disabled = false;
    forgotPassword.disabled = false;
    setBusy(false);
  }
});

forgotPassword.addEventListener("click", async () => {
  const email = emailInput.value.trim().toLowerCase();
  if (!email || !emailInput.validity.valid) {
    setMessage("Informe seu e-mail institucional para receber as instruções de acesso.", "error");
    emailInput.focus();
    return;
  }

  firstAccess.disabled = true;
  forgotPassword.disabled = true;
  setMessage("Enviando instruções…");
  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("Se esse e-mail estiver habilitado, você receberá as instruções para definir uma nova senha.", "success");
  } catch (error) {
    const code = String(error?.code || "");
    if (code.includes("auth/too-many-requests") || code.includes("auth/network-request-failed")) {
      setMessage(humanize(error), "error");
    } else {
      // Resposta neutra evita revelar quais e-mails possuem acesso.
      setMessage("Se esse e-mail estiver habilitado, você receberá as instruções para definir uma nova senha.", "success");
    }
  } finally {
    firstAccess.disabled = false;
    forgotPassword.disabled = false;
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email || !emailInput.validity.valid || !password) {
    setMessage("Preencha um e-mail institucional válido e a sua senha.", "error");
    (!email || !emailInput.validity.valid ? emailInput : passwordInput).focus();
    return;
  }

  setBusy(true, "Validando acesso…");
  setMessage("");
  try {
    await setPersistence(auth, browserSessionPersistence);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await ensureVerifiedEmail(credential.user);
    await validateInstitutionAccess(credential.user);
    setBusy(true, "Abrindo painel…");
    window.location.replace("./instituicao-painel.html");
  } catch (error) {
    if (/ACESSO_INSTITUCIONAL_NAO_LIBERADO|EMAIL_INSTITUCIONAL_NAO_VERIFICADO/.test(String(error?.code || error?.message || ""))) {
      await signOut(auth).catch(() => {});
    }
    setMessage(humanize(error), "error");
    setBusy(false);
  }
});

(async () => {
  const queryError = new URLSearchParams(location.search).get("erro");
  if (queryError === "acesso") {
    setMessage("Sua conta não possui acesso a programas ou unidades autorizadas.", "error");
  } else if (queryError === "sessao") {
    setMessage("Sua sessão terminou. Entre novamente para continuar.", "error");
  }

  try {
    await setPersistence(auth, browserSessionPersistence);
    const user = await authReady();
    if (!user) return;
    // Uma sessão antiga ou incompleta não deve disparar e-mail nem mostrar
    // aviso assim que a página abre. Confirmação só ocorre após ação explícita.
    if (!user.emailVerified) {
      await signOut(auth).catch(() => {});
      return;
    }
    setBusy(true, "Abrindo painel…");
    await validateInstitutionAccess(user);
    window.location.replace("./instituicao-painel.html");
  } catch (error) {
    await signOut(auth).catch(() => {});
    if (!queryError) setMessage(humanize(error), "error");
    setBusy(false);
  }
})();

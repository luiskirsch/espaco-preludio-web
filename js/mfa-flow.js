import { auth, BACKEND_BASE_URL } from "./firebase-config.js?h=a1e6b0a1a1";
import { get2faSessionToken, save2faSession, clear2faSession } from "./twofa-session.js?h=fbd5e4b98b";

const messages = {
  pt: { disableTitle:"Desativar verificação em duas etapas", disableInfo:"Digite o código atual do seu aplicativo autenticador para desativar.", enrollOptInfo:"Cadastre esta chave no seu aplicativo autenticador e confirme o código de seis dígitos.", setup:"Proteja seu acesso", setupInfo:"A verificação em duas etapas é obrigatória. Cadastre esta chave no seu aplicativo autenticador e confirme o código de seis dígitos.", verify:"Confirme seu acesso", verifyInfo:"Digite o código atual do seu aplicativo autenticador.", code:"Código de seis dígitos", confirm:"Confirmar", cancel:"Cancelar", loading:"Verificando…", recovery:"Usar código de recuperação", recoveryTitle:"Recuperar o autenticador", recoveryInfo:"Use um dos códigos guardados na ativação. Depois será necessário cadastrar um novo autenticador.", recoveryLabel:"Código de recuperação", back:"Voltar", savedTitle:"Guarde seus códigos de recuperação", savedInfo:"Eles aparecem somente agora. Guarde-os em local seguro, fora deste navegador. Cada recuperação exige cadastrar um novo autenticador.", download:"Baixar códigos", saved:"Guardei os códigos de recuperação.", proceed:"Continuar", unavailable:"Não foi possível concluir. Tente novamente.", wrong:"Código incorreto. Confira o aplicativo e tente novamente.", reused:"Este código já foi usado. Aguarde o próximo código do aplicativo.", expired:"O cadastro expirou. Feche esta janela e inicie novamente.", limited:"Muitas tentativas. Aguarde dez minutos e tente novamente.", invalidRecovery:"Código de recuperação inválido ou já utilizado.", changed:"A sessão mudou. Entre novamente.", renewed:"Gerar novos códigos de recuperação" },
  en: { disableTitle:"Turn off two-step verification", disableInfo:"Enter the current code from your authenticator app to turn it off.", enrollOptInfo:"Add this key to your authenticator app and confirm its six-digit code.", setup:"Protect your account", setupInfo:"Two-step verification is required. Add this key to your authenticator app and confirm its six-digit code.", verify:"Verify your access", verifyInfo:"Enter the current code from your authenticator app.", code:"Six-digit code", confirm:"Confirm", cancel:"Cancel", loading:"Verifying…", recovery:"Use a recovery code", recoveryTitle:"Recover your authenticator", recoveryInfo:"Use a code saved during enrollment. You will then need to enroll a new authenticator.", recoveryLabel:"Recovery code", back:"Back", savedTitle:"Save your recovery codes", savedInfo:"They are shown only now. Keep them somewhere safe outside this browser. Recovery requires enrolling a new authenticator.", download:"Download codes", saved:"I have saved the recovery codes.", proceed:"Continue", unavailable:"Could not complete this request. Please try again.", wrong:"Incorrect code. Check your authenticator and try again.", reused:"This code has already been used. Wait for the next authenticator code.", expired:"Enrollment expired. Close this window and start again.", limited:"Too many attempts. Wait ten minutes and try again.", invalidRecovery:"Invalid or already used recovery code.", changed:"Your session changed. Please sign in again.", renewed:"Generate new recovery codes" },
  es: { disableTitle:"Desactivar la verificación en dos pasos", disableInfo:"Introduce el código actual de tu aplicación de autenticación para desactivarla.", enrollOptInfo:"Añade esta clave a tu aplicación de autenticación y confirma su código de seis dígitos.", setup:"Protege tu acceso", setupInfo:"La verificación en dos pasos es obligatoria. Añade esta clave a tu aplicación de autenticación y confirma su código de seis dígitos.", verify:"Confirma tu acceso", verifyInfo:"Introduce el código actual de tu aplicación de autenticación.", code:"Código de seis dígitos", confirm:"Confirmar", cancel:"Cancelar", loading:"Verificando…", recovery:"Usar código de recuperación", recoveryTitle:"Recuperar el autenticador", recoveryInfo:"Usa un código guardado al activar la protección. Después deberás registrar un autenticador nuevo.", recoveryLabel:"Código de recuperación", back:"Volver", savedTitle:"Guarda tus códigos de recuperación", savedInfo:"Solo se muestran ahora. Guárdalos en un lugar seguro, fuera de este navegador. La recuperación requiere registrar un autenticador nuevo.", download:"Descargar códigos", saved:"He guardado los códigos de recuperación.", proceed:"Continuar", unavailable:"No se pudo completar. Inténtalo de nuevo.", wrong:"Código incorrecto. Revisa la aplicación e inténtalo de nuevo.", reused:"Este código ya fue usado. Espera el siguiente código de la aplicación.", expired:"El registro ha caducado. Cierra esta ventana y vuelve a empezar.", limited:"Demasiados intentos. Espera diez minutos e inténtalo de nuevo.", invalidRecovery:"Código de recuperación inválido o ya utilizado.", changed:"La sesión cambió. Inicia sesión de nuevo.", renewed:"Generar nuevos códigos de recuperación" }
};
function language() {
  let lang = document.documentElement.lang;
  try { lang = localStorage.getItem("ep_lang") || lang; } catch {}
  return String(lang).startsWith("en") ? "en" : String(lang).startsWith("es") ? "es" : "pt";
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
async function request(user, action, body) {
  if (auth.currentUser?.uid !== user.uid) throw Object.assign(new Error("AUTH_SESSION_CHANGED"), { code: "AUTH_SESSION_CHANGED" });
  const token = await user.getIdToken();
  const headers = { Authorization: "Bearer " + token };
  const proof = get2faSessionToken();
  if (proof) headers["X-Therapy-2FA"] = proof;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(BACKEND_BASE_URL + "/therapy/2fa/" + action, {
    method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", credentials: "omit"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw Object.assign(new Error(data.error || "MFA_UNAVAILABLE"), { code: data.error, status: response.status });
  return data;
}

let pendingFlow;
export function ensureMfa(user, options = {}) {
  if (pendingFlow) return pendingFlow;
  pendingFlow = startFlow(user, options).finally(() => { pendingFlow = undefined; });
  return pendingFlow;
}
export async function mfaStatus(user) { return request(user, "status"); }

async function startFlow(user, { renewRecovery = false, enroll = false, disable = false } = {}) {
  let state;
  try { state = await request(user, "status"); }
  catch (error) {
    if (error.code === "PROFISSIONAL_NAO_REGISTRADO") return { registered: false };
    throw error;
  }
  const optional = state.required === false;
  // Opt-in accounts that have not enrolled sign in without a dialog.
  if (optional && !state.enabled && !enroll) return { verified: true, optional: true };
  if (enroll && state.enabled) return { verified: true };
  if (disable && !state.enabled) return { disabled: true };
  if (state.sessionValid && !renewRecovery && !disable) return { verified: true };
  if (!document.getElementById("mfaFlowStyles")) {
    const css = node("link"); css.id = "mfaFlowStyles"; css.rel = "stylesheet";
    css.href = new URL("../css/mfa-flow.css?h=0a8af4950f", import.meta.url).href;
    document.head.append(css);
  }
  const text = messages[language()];
  const dialog = node("dialog", undefined, "mfa-dialog");
  dialog.id = "mfaDialog"; dialog.setAttribute("aria-labelledby", "mfaTitle");
  document.body.append(dialog);
  let completed = false, mustSave = false;
  return new Promise((resolve, reject) => {
    function finish(result, error) {
      if (completed) return;
      completed = true; dialog.close(); dialog.remove();
      if (error) reject(error); else resolve(result);
    }
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      if (!mustSave) finish(null, Object.assign(new Error("MFA_CANCELLED"), { code: "MFA_CANCELLED" }));
    });
    function frame(title, info) {
      dialog.replaceChildren();
      const heading = node("h2", title); heading.id = "mfaTitle";
      dialog.append(heading, node("p", info));
      const status = node("p", "", "mfa-status"); status.id = "mfaStatus"; status.setAttribute("role", "status");
      return status;
    }
    function button(label, callback, primary = false) {
      const element = node("button", label, primary ? "ep-btn ep-btn--primary" : "ep-btn ep-btn--ghost");
      element.type = "button"; element.addEventListener("click", callback); return element;
    }
    function showError(status, error) {
      const errors = { CODIGO_INCORRETO:"wrong", CODIGO_REUTILIZADO:"reused", SETUP_EXPIRADO:"expired",
        MUITAS_TENTATIVAS_2FA:"limited", CODIGO_RECUPERACAO_INVALIDO:"invalidRecovery", AUTH_SESSION_CHANGED:"changed" };
      status.textContent = text[errors[error.code] || "unavailable"];
    }
    function showRecoveryCodes(data) {
      if (!Array.isArray(data.recoveryCodes) || data.recoveryCodes.length !== 8 || !data.recoveryCodes.every(code => /^[a-f0-9]{8}(?:-[a-f0-9]{8}){3}$/.test(code))) throw new Error("INVALID_RECOVERY_RESPONSE");
      save2faSession(data.sessionToken); mustSave = true;
      frame(text.savedTitle, text.savedInfo);
      const codes = node("pre", data.recoveryCodes.join("\n"), "mfa-recovery-list"); codes.id = "mfaRecoveryCodes";
      const download = button(text.download, () => {
        const url = URL.createObjectURL(new Blob(["Espaço Prelúdio\n\n" + data.recoveryCodes.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }));
        const link = node("a"); link.href = url; link.download = "espaco-preludio-recuperacao.txt"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      const label = node("label", undefined, "mfa-confirm"), check = node("input"); check.type = "checkbox"; check.id = "mfaSaved";
      label.append(check, node("span", text.saved));
      const next = button(text.proceed, () => { if (check.checked) finish({ verified: true }); }, true);
      next.id = "mfaContinue"; next.disabled = true; check.addEventListener("change", () => { next.disabled = !check.checked; });
      dialog.append(codes, download, label, next);
    }
    async function renderCode(setup) {
      let details;
      const status = frame(setup ? text.setup : disable ? text.disableTitle : renewRecovery ? text.renewed : text.verify,
        setup ? (optional ? text.enrollOptInfo : text.setupInfo) : disable ? text.disableInfo : text.verifyInfo);
      if (setup) {
        try {
          details = await request(user, "setup", {});
          const secret = node("code", details.secret, "mfa-secret"); secret.id = "mfaSecret";
          dialog.append(secret);
          try {
            const { default: qrcode } = await import("./vendor/qrcode-generator-1.4.4.mjs?h=e49a3b9366");
            const qr = qrcode(0, "M"); qr.addData(details.otpauthUrl); qr.make();
            const image = node("img", undefined, "mfa-qr"); image.alt = "QR"; image.src = qr.createDataURL(4, 4); dialog.append(image);
          } catch { /* The manually entered key remains fully functional. */ }
        } catch (error) { dialog.append(status); showError(status, error); dialog.append(button(text.cancel, () => finish(null, error))); return; }
      }
      const label = node("label", text.code); label.htmlFor = "codeInput";
      const input = node("input", undefined, "ep-input mfa-code"); input.id = "codeInput"; input.type = "text";
      input.inputMode = "numeric"; input.autocomplete = "one-time-code"; input.maxLength = 6;
      const confirm = button(text.confirm, submit, true); confirm.id = "verifyBtn"; confirm.disabled = true;
      input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 6); confirm.disabled = input.value.length !== 6; });
      input.addEventListener("keydown", event => { if (event.key === "Enter" && !confirm.disabled) { event.preventDefault(); submit(); } });
      async function submit() {
        if (!/^\d{6}$/.test(input.value)) return;
        confirm.disabled = true; status.textContent = text.loading;
        try {
          const action = setup ? "enable" : disable ? "disable" : renewRecovery ? "recovery-codes" : "verify";
          const data = await request(user, action, { code: input.value });
          if (disable) { clear2faSession(); finish({ disabled: true }); }
          else if (setup || renewRecovery) showRecoveryCodes(data);
          else { save2faSession(data.sessionToken); finish({ verified: true }); }
        } catch (error) { showError(status, error); confirm.disabled = false; input.select(); }
      }
      const actions = node("div", undefined, "mfa-actions");
      actions.append(button(text.cancel, () => finish(null, Object.assign(new Error("MFA_CANCELLED"), { code:"MFA_CANCELLED" }))), confirm);
      dialog.append(label, input, status, actions);
      if (!setup && !disable) { const recover = button(text.recovery, renderRecovery); recover.className = "mfa-link"; dialog.append(recover); }
      input.focus();
    }
    function renderRecovery() {
      const status = frame(text.recoveryTitle, text.recoveryInfo);
      const label = node("label", text.recoveryLabel); label.htmlFor = "recoveryCode";
      const input = node("input", undefined, "ep-input"); input.id = "recoveryCode"; input.autocomplete = "off"; input.maxLength = 64;
      const confirm = button(text.confirm, async () => {
        confirm.disabled = true; status.textContent = text.loading;
        try {
          await request(user, "recover", { recoveryCode: input.value }); clear2faSession(); renewRecovery = false;
          // Opt-in accounts end up without the factor; they may enroll again from the profile.
          if (optional) finish({ verified: true, recovered: true }); else await renderCode(true);
        } catch (error) { showError(status, error); confirm.disabled = false; }
      }, true);
      const actions = node("div", undefined, "mfa-actions"); actions.append(button(text.back, () => renderCode(false)), confirm);
      dialog.append(label, input, status, actions); input.focus();
    }
    dialog.showModal();
    renderCode(!state.enabled).catch(error => finish(null, error));
  });
}

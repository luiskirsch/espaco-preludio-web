// Botão de 2FA opcional (paciente, aluno). Fica oculto quando a conta não é
// opt-in — profissional gerencia o 2FA obrigatório pelo perfil profissional.
import { ensureMfa, mfaStatus } from "./mfa-flow.js?h=c09d85cbdd";

export function mountOptionalMfaButton(anchor, user, { className = "" } = {}) {
  const button = document.createElement("button");
  button.type = "button"; button.className = className; button.hidden = true;
  anchor.before(button);
  let enabled = false;
  async function render() {
    try {
      const state = await mfaStatus(user);
      if (state.required !== false) { button.hidden = true; return; }
      enabled = !!state.enabled;
      button.textContent = enabled ? "Desativar 2FA" : "Ativar 2FA";
      button.title = enabled ? "Verificação em duas etapas ativada" : "Proteja sua conta com verificação em duas etapas";
      button.hidden = false;
    } catch { button.hidden = true; }
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await ensureMfa(user, enabled ? { disable: true } : { enroll: true }); }
    catch { /* o modal explica erros; cancelar não muda nada */ }
    finally { button.disabled = false; await render(); }
  });
  render();
  return button;
}

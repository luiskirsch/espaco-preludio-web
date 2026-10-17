// E-mails de conta enviados pelo backend do Espaço Prelúdio (texto próprio,
// remetente @espacopreludio.com.br, link para conta-acao.html). Sem reserva
// pelo Firebase: o envio dele sai de *.firebaseapp.com, com link para esse
// domínio. Uma segunda tentativa automática cobre falhas momentâneas; se
// persistir, a tela mostra erro de conexão e a pessoa tenta de novo.

function authError(code) { return Object.assign(new Error(code), { code }); }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function callBackend(url, init) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response = null;
    try { response = await fetch(url, { ...init, cache: "no-store", credentials: "omit" }); }
    catch { /* rede: tenta de novo */ }
    if (response?.ok) return;
    if (response?.status === 429) throw authError("auth/too-many-requests");
    if (response?.status === 400) {
      const data = await response.json().catch(() => ({}));
      throw authError(data.error === "EMAIL_INVALIDO" ? "auth/invalid-email" : "auth/internal-error");
    }
    if (response?.status === 401) throw authError("auth/user-token-expired");
    if (attempt === 1) await pause(800);
  }
  throw authError("auth/network-request-failed");
}

export async function requestPasswordReset({ backend, email, retorno }) {
  await callBackend(`${backend}/conta/redefinir-senha`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, retorno })
  });
}

export async function requestEmailVerification({ backend, user, retorno }) {
  const token = await user.getIdToken();
  await callBackend(`${backend}/conta/verificar-email`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ retorno })
  });
}

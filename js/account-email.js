// E-mails de conta enviados pelo backend do Espaço Prelúdio (texto próprio,
// remetente @espacopreludio.com.br, link para conta-acao.html). Se o backend
// não responder, usa o envio do Firebase como reserva — ninguém fica sem o
// e-mail. Sem imports: quem chama passa o endereço do backend e a reserva.

function authError(code) { return Object.assign(new Error(code), { code }); }

async function callBackend(url, init) {
  let response;
  try { response = await fetch(url, { ...init, cache: "no-store", credentials: "omit" }); }
  catch { return { useFallback: true }; }
  if (response.ok) return { done: true };
  if (response.status === 429) throw authError("auth/too-many-requests");
  if (response.status === 400) {
    const data = await response.json().catch(() => ({}));
    if (data.error === "EMAIL_INVALIDO") throw authError("auth/invalid-email");
  }
  return { useFallback: true }; // 404 (versão antiga do backend), 5xx, etc.
}

export async function requestPasswordReset({ backend, email, retorno, fallback }) {
  const result = await callBackend(`${backend}/conta/redefinir-senha`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, retorno })
  });
  if (result.useFallback) await fallback();
}

export async function requestEmailVerification({ backend, user, retorno, fallback }) {
  const token = await user.getIdToken();
  const result = await callBackend(`${backend}/conta/verificar-email`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ retorno })
  });
  if (result.useFallback) await fallback();
}

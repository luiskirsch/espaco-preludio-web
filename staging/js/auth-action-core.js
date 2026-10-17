// Regras puras da página de ações de conta (conta-acao.html): leitura dos
// parâmetros do link enviado pelo Firebase Auth e validação do retorno.
// Sem DOM e sem Firebase, para poder ser testado no Node.

export const ACTION_MODES = new Set(["resetPassword", "verifyEmail", "recoverEmail", "verifyAndChangeEmail"]);
const EP_HOSTS = new Set(["espacopreludio.com.br", "www.espacopreludio.com.br", "espacopreludio.com", "www.espacopreludio.com"]);

export function parseActionParams(search) {
  const params = new URLSearchParams(search || "");
  const mode = params.get("mode") || "";
  const oobCode = params.get("oobCode") || "";
  return {
    mode: ACTION_MODES.has(mode) ? mode : "",
    oobCode: /^[A-Za-z0-9_-]{10,2048}$/.test(oobCode) ? oobCode : "",
    continueUrl: params.get("continueUrl") || ""
  };
}

// Só devolve páginas .html do próprio site e do mesmo ambiente (produção ou
// /staging/). Qualquer outro destino vira null: o link não serve de open redirect.
export function safeContinueUrl(raw, currentHref) {
  if (typeof raw !== "string" || !raw) return null;
  let here, target;
  try { here = new URL(currentHref); target = new URL(raw, here); } catch { return null; }
  if (target.username || target.password) return null;
  const sameSite = target.origin === here.origin ||
    (target.protocol === "https:" && EP_HOSTS.has(target.hostname) && EP_HOSTS.has(here.hostname));
  if (!sameSite) return null;
  const isStaging = path => path.startsWith("/staging/");
  if (isStaging(target.pathname) !== isStaging(here.pathname)) return null;
  if (!/^\/(?:staging\/)?(?:app\/)?[a-z0-9-]+\.html$/.test(target.pathname)) return null;
  return target.href;
}

export function actionErrorKey(code) {
  switch (code) {
    case "auth/expired-action-code": return "expired";
    case "auth/invalid-action-code": return "invalid";
    case "auth/user-disabled": return "disabled";
    case "auth/user-not-found": return "notFound";
    case "auth/weak-password": return "weak";
    case "auth/too-many-requests": return "tooMany";
    case "auth/network-request-failed": return "network";
    default: return "generic";
  }
}

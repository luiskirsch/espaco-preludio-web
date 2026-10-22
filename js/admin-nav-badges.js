import { auth, BACKEND_BASE_URL } from "./firebase-config.js?h=69b74fc63a";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
const badges = { crpCrm:"CrpCrm", estudante:"Estudante", recemFormado:"RecemFormado", semConselho:"SemConselho", leadsEstudante:"LeadsEstudante", empresa:"Empresa", empresas:"Empresas", denuncias:"Denuncias", colaboradores:"Colaboradores", repasses:"Repasses", reembolsos:"Repasses", nr1:"Nr1", estudantes:"Estudantes", apoio:"Apoio" };
let timer, running = null, epoch = 0;
function render(counts) {
  const grouped = {};
  for (const [key,suffix] of Object.entries(badges)) {
    const value = counts[key], entry = grouped[suffix] ||= { count:0, error:false };
    if (!value || value.error) entry.error = true; else entry.count += Number(value.count) || 0;
  }
  for (const [suffix,value] of Object.entries(grouped)) for (const el of document.querySelectorAll(`#navBadge${suffix}, #badge${suffix}`)) {
    el.textContent = value.error ? "!" : value.count > 99 ? "99+" : String(value.count);
    el.classList.toggle("ep-hide", !value.error && value.count === 0); el.classList.toggle("is-error", value.error);
    el.setAttribute("aria-label", value.error ? "Falha ao verificar pendências" : `${value.count} pendências`);
    el.title = value.error ? "Não foi possível verificar. Tente atualizar." : `${value.count} itens aguardando atenção`;
    el.dataset.noI18n = "";
  }
}
export async function refreshNavBadges(idToken) {
  if (!idToken) return; if (running) return running;
  const current = epoch;
  running = (async () => {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/therapy/admin/notifications/counts`, {cache:"no-store", headers:{Authorization:`Bearer ${idToken}`}});
      if (!response.ok) throw new Error("unavailable"); const data = await response.json();
      if (!data.ok) throw new Error("unavailable"); if (current === epoch) render(data.counts || {});
    } catch { if (current === epoch) render({}); }
  })().finally(() => { running = null; }); return running;
}
export function startNavBadgePolling(getIdToken, intervalMs = 30000) {
  if (timer) return timer;
  const tick = async () => { if (document.hidden) return; try { const token = await getIdToken(); if(token) await refreshNavBadges(token); } catch { render({}); } };
  tick(); timer = setInterval(tick, intervalMs); window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", tick); window.addEventListener("ep:admin-updated", tick); return timer;
}
onAuthStateChanged(auth, user => {
  epoch++; if (!user) { render(Object.fromEntries(Object.keys(badges).map(key=>[key,{count:0}]))); return; }
  startNavBadgePolling(() => auth.currentUser?.getIdToken()); user.getIdToken().then(refreshNavBadges).catch(()=>{});
});

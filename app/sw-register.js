// Transições entre páginas (app.css: @view-transition) só valem dentro do app.
// Saindo para outra área do site (ex.: ../2fa-verify.html), o destino não aceita
// a transição e o Chrome registrava "InvalidStateError: ViewTransition opt-in
// disabled". Pula a animação antes da troca de página.
window.addEventListener("pageswap", event => {
  if (!event.viewTransition) return;
  const next = event.activation?.entry?.url;
  if (!next || !new URL(next).pathname.includes("/app/")) event.viewTransition.skipTransition();
});

// Registra o service worker do app só para /app/. Com o escopo padrão ("/") ele
// disputava a raiz com o /sw.js das áreas profissional e de paciente: a cada troca
// de área um substituía o outro, reinstalava e recarregava a página.
if ("serviceWorker" in navigator) {
  const base = location.pathname.startsWith("/staging/") ? "/staging" : "";
  navigator.serviceWorker.register(`${base}/sw-app.js`, { scope: `${base}/app/` })
    .then(reg => {
      console.log("[EP App] SW registrado:", reg.scope);
    })
    .catch(err => {
      console.warn("[EP App] SW falhou:", err);
    });
}

// Registra o service worker em todas as páginas do app
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw-app.js")
    .then(reg => {
      console.log("[EP App] SW registrado:", reg.scope);
    })
    .catch(err => {
      console.warn("[EP App] SW falhou:", err);
    });
}

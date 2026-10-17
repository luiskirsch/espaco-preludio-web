// Finite UI actions replace executable HTML attributes. Never interpret code
// or select arbitrary global functions from a DOM attribute.
export function runCspAction(action, { window: win, document: doc }) {
  const close = id => { const element = doc.getElementById(id); if (element) element.style.display = "none"; };
  switch (action) {
    case "admin-sessions": win.location.href = "./admin-sessoes.html"; break;
    case "admin-verifications": win.location.href = "./admin-verificacoes.html"; break;
    case "chat-back": win.backToList(); break;
    case "tab-upcoming": win.showTab("prox"); break;
    case "tab-history": win.showTab("hist"); break;
    case "tab-pending": win.showTab("pend"); break;
    case "close-cancel": close("cancelModal"); break;
    case "history-back": win.history.back(); break;
    case "close-add": close("addModal"); break;
    case "close-viewer": close("viewerModal"); break;
    case "photo-upload": doc.getElementById("photoInput")?.click(); break;
    case "edit-name": win.openEditName(); break;
    case "edit-password": win.openEditSenha(); break;
    case "install-pwa": win.installPWA(); break;
    case "logout": win.doLogout(); break;
    case "close-edit-name": close("editNameModal"); break;
    case "save-name": win.saveName(); break;
    case "close-edit-password": close("editSenhaModal"); break;
    case "save-password": win.saveSenha(); break;
    case "toggle-notifications": win.toggleNotif(); break;
    case "reload": win.location.reload(); break;
    case "print": win.print(); break;
    default: return false;
  }
  return true;
}

if (typeof document !== "undefined") {
  document.addEventListener("click", event => {
    const target = event.target?.closest?.("[data-csp-action]");
    if (target) runCspAction(target.dataset.cspAction, { window, document });
  });
  document.addEventListener("submit", event => {
    if (event.target?.matches?.("form[data-csp-prevent-submit]")) event.preventDefault();
  });
}

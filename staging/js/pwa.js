// Registro do Service Worker + UX de install prompt + update toast.
// Loaded by todas as páginas de área logada via <script type="module" src="./js/pwa.js?v=1"></script>
//
// Decisões:
//   - SW só registra se servidor é HTTPS ou localhost (SW exige secure context)
//   - Path: detecta /staging/ automaticamente pra usar /staging/sw.js
//   - Install prompt: deferido, mostra um banner discreto pro user adicionar
//   - Update detection: SW novo disponível → toast oferece refresh

(function () {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const isStaging = location.pathname.startsWith("/staging/");
  const swPath = isStaging ? "/staging/sw.js" : "/sw.js";
  const swScope = isStaging ? "/staging/" : "/";

  // ─── Registro ────────────────────────────────────────────────────────
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(swPath, { scope: swScope });

      // Detect update
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Já existe SW ativo + novo está pronto → atualização disponível
            showUpdateToast(() => {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            });
          }
        });
      });

      // Quando o novo SW assumir o controle, recarrega
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn("[PWA] SW register failed:", err);
    }
  });

  // ─── Install prompt (Add to Home Screen) ─────────────────────────────
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Mostra banner customizado se ainda não foi dispensado nesta sessão.
    if (sessionStorage.getItem("ep:pwa-install-dismissed") === "1") return;
    showInstallBanner();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideInstallBanner();
  });

  // ─── UI helpers ──────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("ep-pwa-styles")) return;
    const s = document.createElement("style");
    s.id = "ep-pwa-styles";
    s.textContent = `
      .ep-pwa-banner, .ep-pwa-toast {
        position: fixed; left: 50%; transform: translateX(-50%);
        background: var(--ep-surface, #fff);
        border: 1px solid var(--ep-line, rgba(28,31,29,0.12));
        border-radius: 12px;
        box-shadow: 0 8px 28px rgba(28,31,29,0.18);
        padding: 12px 16px;
        display: flex; gap: 12px; align-items: center;
        font-size: 14px; color: var(--ep-ink, #1c1f1d);
        z-index: 9999;
        max-width: calc(100% - 32px);
      }
      .ep-pwa-banner { bottom: 24px; }
      .ep-pwa-toast  { top: 24px; }
      .ep-pwa-banner__text, .ep-pwa-toast__text { flex: 1; line-height: 1.4; }
      .ep-pwa-banner__btn, .ep-pwa-toast__btn {
        background: var(--ep-accent, #2d4a3e); color: #fff;
        border: 0; padding: 8px 14px; border-radius: 8px;
        font-size: 13px; font-weight: 500; cursor: pointer;
      }
      .ep-pwa-banner__close, .ep-pwa-toast__close {
        background: transparent; border: 0; cursor: pointer;
        font-size: 18px; color: rgba(28,31,29,0.55);
        padding: 4px 8px;
      }
    `;
    document.head.appendChild(s);
  }

  function showInstallBanner() {
    if (document.getElementById("ep-pwa-banner")) return;
    injectStyles();
    const banner = document.createElement("div");
    banner.id = "ep-pwa-banner";
    banner.className = "ep-pwa-banner";
    banner.innerHTML = `
      <div class="ep-pwa-banner__text">
        <strong>Instale o Espaço Prelúdio</strong> como app no seu dispositivo. Carregamento mais rápido + acesso offline às páginas principais.
      </div>
      <button class="ep-pwa-banner__btn" id="ep-pwa-install">Instalar</button>
      <button class="ep-pwa-banner__close" id="ep-pwa-dismiss" aria-label="Fechar">×</button>
    `;
    document.body.appendChild(banner);
    document.getElementById("ep-pwa-install").addEventListener("click", async () => {
      if (!deferredPrompt) { hideInstallBanner(); return; }
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      hideInstallBanner();
    });
    document.getElementById("ep-pwa-dismiss").addEventListener("click", () => {
      sessionStorage.setItem("ep:pwa-install-dismissed", "1");
      hideInstallBanner();
    });
  }
  function hideInstallBanner() {
    const b = document.getElementById("ep-pwa-banner");
    if (b) b.remove();
  }

  function showUpdateToast(onAccept) {
    if (document.getElementById("ep-pwa-toast")) return;
    injectStyles();
    const toast = document.createElement("div");
    toast.id = "ep-pwa-toast";
    toast.className = "ep-pwa-toast";
    toast.innerHTML = `
      <div class="ep-pwa-toast__text">
        <strong>Nova versão disponível.</strong> Recarregue pra atualizar.
      </div>
      <button class="ep-pwa-toast__btn" id="ep-pwa-update">Atualizar</button>
      <button class="ep-pwa-toast__close" id="ep-pwa-update-skip" aria-label="Fechar">×</button>
    `;
    document.body.appendChild(toast);
    document.getElementById("ep-pwa-update").addEventListener("click", () => {
      onAccept && onAccept();
    });
    document.getElementById("ep-pwa-update-skip").addEventListener("click", () => {
      toast.remove();
    });
  }
})();

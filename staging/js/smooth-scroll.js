(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Topbar sticky tem 64px. Cada seção desktop tem min-height: calc(100vh - 64)
  // = altura da área visível. Pra o anchor scroll alinhar o topo da seção com
  // a borda inferior do topbar (Y=64), o offset deve ser 64. O conteúdo dentro
  // da seção é flex-centered, então fica visualmente no centro da área visível.
  // Mantém em sync com scroll-margin-top de .ep-section em espaco-preludio.css.
  const HEADER_OFFSET = 64;
  const DURATION = 1100;

  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

  let rafId = null;

  function smoothScrollTo(targetY) {
    if (rafId !== null) cancelAnimationFrame(rafId);

    const startY = window.scrollY;
    const distance = targetY - startY;
    if (Math.abs(distance) < 2) return;

    const startTime = performance.now();
    let cancelled = false;

    const cancel = () => { cancelled = true; };
    window.addEventListener("wheel", cancel, { passive: true, once: true });
    window.addEventListener("touchstart", cancel, { passive: true, once: true });
    window.addEventListener("keydown", cancel, { once: true });

    function step(now) {
      if (cancelled) { rafId = null; return; }
      const elapsed = now - startTime;
      const t = Math.min(elapsed / DURATION, 1);
      window.scrollTo(0, startY + distance * easeOutExpo(t));
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
        window.removeEventListener("wheel", cancel);
        window.removeEventListener("touchstart", cancel);
        window.removeEventListener("keydown", cancel);
      }
    }
    rafId = requestAnimationFrame(step);
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const targetY = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
    smoothScrollTo(targetY);
    history.pushState(null, "", href);
  });
})();

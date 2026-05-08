(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const HEADER_OFFSET = 80;
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

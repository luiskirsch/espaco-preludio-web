(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const HEADER_OFFSET = 80;
  const DURATION = 1000;

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function smoothScrollTo(targetY) {
    const startY = window.scrollY;
    const distance = targetY - startY;
    if (Math.abs(distance) < 2) return;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / DURATION, 1);
      window.scrollTo(0, startY + distance * easeOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    const id = href.slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const targetY = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
    smoothScrollTo(targetY);
    history.pushState(null, "", href);
  });
})();

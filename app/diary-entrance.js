/* A short passage between the portal and the diary, with no account data. */
(() => {
  const root = document.documentElement;
  if (root.dataset.diaryEntranceBound) return;
  root.dataset.diaryEntranceBound = 'true';
  const key = 'ep.diary.entrance';
  const scriptUrl = document.currentScript.src;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const diaryPath = /\/(?:app\/diario|aluno-diario)\.html$/;
  let overlay, departureTimer, cleanupTimer, destination, previousFocus, navigating = false;
  const inertElements = new Map();
  const words = {
    'pt': ['Espaço Prelúdio', 'Diário dos', 'Pensamentos Vividos', 'Um tempo só seu.', 'Pular animação'],
    'en': ['Espaço Prelúdio', 'Diary of', 'Lived Thoughts', 'A moment of your own.', 'Skip animation'],
    'es': ['Espaço Prelúdio', 'Diario de', 'Pensamientos Vividos', 'Un momento solo para ti.', 'Saltar animación'],
  };

  let stylesheet = document.getElementById('diaryEntranceStyles');
  if (!stylesheet) {
    stylesheet = document.createElement('link');
    stylesheet.id = 'diaryEntranceStyles';
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('./diary-entrance.css?h=5630c065dd', scriptUrl).href;
    document.head.append(stylesheet);
  }

  function clearIntent() { try { sessionStorage.removeItem(key); } catch { /* Storage is optional. */ } }
  function cleanup() {
    clearTimeout(departureTimer); clearTimeout(cleanupTimer);
    overlay?.remove(); overlay = null; destination = null; navigating = false;
    root.classList.remove('diary-entrance-pending', 'diary-entrance-revealing', 'diary-entrance-leaving');
    for (const [element, inert] of inertElements) element.inert = inert;
    inertElements.clear();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function navigate({ skip = false } = {}) {
    if (!destination || navigating) return;
    navigating = true;
    clearTimeout(departureTimer);
    try { sessionStorage.setItem(key, JSON.stringify({ path: destination.pathname, at: Date.now(), animate: !skip })); } catch { /* Navigation still works. */ }
    try { location.assign(destination.href); } catch { clearIntent(); cleanup(); }
    // A cancelled navigation must never leave the portal covered or inert.
    cleanupTimer = setTimeout(() => { clearIntent(); cleanup(); }, 5000);
  }
  function mount(phase, point) {
    const locale = (window.EP_I18N?.locale?.() || root.lang || 'pt').slice(0, 2);
    const copy = words[locale] || words.pt;
    overlay = document.createElement('div');
    overlay.className = `diary-entrance diary-entrance--${phase}`;
    overlay.setAttribute('role', phase === 'departure' ? 'dialog' : 'status');
    if (phase === 'departure') overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'diaryEntranceTitle');
    if (point) { overlay.style.setProperty('--entry-x', `${point.x}px`); overlay.style.setProperty('--entry-y', `${point.y}px`); }
    overlay.innerHTML = `<div class="diary-entrance__halo" aria-hidden="true"></div>
      <div class="diary-entrance__dust" aria-hidden="true">${Array.from({ length: 26 }, (_, i) => `<i style="--x:${(i * 37 + 11) % 100}%;--y:${(i * 23 + 7) % 100}%;--delay:${(i % 7) * -0.27}s;--drift:${(i % 2 ? 1 : -1) * (18 + i % 5 * 9)}px;--size:${i % 5 ? 2 : 4}px"></i>`).join('')}</div>
      <div class="diary-entrance__scene">
        <div class="diary-entrance__book" aria-hidden="true"><div class="diary-entrance__cover"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M32 13v38M10 15c9-3 15-1 22 4 7-5 13-7 22-4v32c-9-3-15-1-22 4-7-5-13-7-22-4Z"/><path d="M16 23c4-1 7 0 11 2m-11 5c4-1 7 0 11 2m-11 5c4-1 7 0 11 2m10-14c4-2 7-3 11-2m-11 9c4-2 7-3 11-2m-11 9c4-2 7-3 11-2M32 3v5M22 5l2 4m18-4-2 4"/></svg><span>✦</span></div></div>
        <p class="diary-entrance__eyebrow"></p>
        <h1 id="diaryEntranceTitle"><span></span><strong></strong></h1>
        <p class="diary-entrance__whisper"></p>
        <span class="diary-entrance__line" aria-hidden="true"></span>
      </div>`;
    overlay.querySelector('.diary-entrance__eyebrow').textContent = copy[0];
    overlay.querySelector('h1 span').textContent = copy[1];
    overlay.querySelector('h1 strong').textContent = copy[2];
    overlay.querySelector('.diary-entrance__whisper').textContent = copy[3];
    if (phase === 'departure') {
      const skip = document.createElement('button');
      skip.type = 'button'; skip.className = 'diary-entrance__skip'; skip.textContent = copy[4];
      skip.addEventListener('click', () => navigate({ skip: true })); overlay.append(skip);
      previousFocus = document.activeElement;
      for (const element of document.body.children) { inertElements.set(element, element.inert); element.inert = true; }
      document.body.append(overlay); skip.focus({ preventScroll: true });
    } else document.body.append(overlay);
    return overlay;
  }

  if (diaryPath.test(location.pathname)) {
    let intent;
    try { intent = JSON.parse(sessionStorage.getItem(key)); } catch { /* Direct access uses the ordinary book. */ }
    clearIntent();
    if (intent?.path === location.pathname && intent.animate !== false && Date.now() - intent.at >= 0 && Date.now() - intent.at < 15000 && !reduced.matches) {
      root.classList.add('diary-entrance-pending');
      // This script runs in the head, so the old page cannot flash at arrival.
      cleanupTimer = setTimeout(cleanup, 4000);
      document.addEventListener('DOMContentLoaded', () => {
        mount('arrival');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          root.classList.add('diary-entrance-revealing');
          clearTimeout(cleanupTimer); cleanupTimer = setTimeout(cleanup, 1250);
        }));
      }, { once: true });
    }
  } else {
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.hasAttribute('download') || anchor.target && anchor.target !== '_self') return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || !diaryPath.test(url.pathname) || reduced.matches) return;
      // A missing stylesheet falls back to the original, immediately usable link.
      if (!stylesheet.sheet) return;
      event.preventDefault();
      if (destination) return;
      destination = url;
      const box = anchor.getBoundingClientRect();
      const point = event.detail ? { x: event.clientX, y: event.clientY } : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      mount('departure', point); root.classList.add('diary-entrance-leaving');
      departureTimer = setTimeout(navigate, 1250);
    });
    document.addEventListener('keydown', event => {
      if (!destination) return;
      if (event.key === 'Escape') { event.preventDefault(); navigate({ skip: true }); }
      if (event.key === 'Tab') { event.preventDefault(); overlay?.querySelector('button').focus(); }
    });
  }
  reduced.addEventListener('change', () => { if (reduced.matches) { if (destination) navigate({ skip: true }); else cleanup(); } });
  // The portal's native cross-document fade must not compete with this passage.
  window.addEventListener('pageswap', event => {
    if (!event.viewTransition) return;
    const next = event.activation?.entry?.url;
    if (diaryPath.test(location.pathname) || next && diaryPath.test(new URL(next).pathname)) {
      event.viewTransition.ready.catch(() => {});
      event.viewTransition.finished.catch(() => {});
      event.viewTransition.skipTransition();
    }
  });
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('pageshow', event => { if (event.persisted) { clearIntent(); cleanup(); } });
})();

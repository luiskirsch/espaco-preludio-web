/* A short passage between the portal and the diary, with no account data. */
(() => {
  const root = document.documentElement;
  if (root.dataset.diaryEntranceBound) return;
  root.dataset.diaryEntranceBound = 'true';
  const key = 'ep.diary.entrance';
  const scriptUrl = document.currentScript.src;
  const diaryPath = /\/(?:app\/diario|aluno-diario)\.html$/;
  let overlay, departureTimer, cleanupTimer, styleWaitTimer, cancelStyleWait, destination, previousFocus, navigating = false, departurePlayed = false;
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
    stylesheet.href = new URL('./diary-entrance.css?h=593be6be63', scriptUrl).href;
    document.head.append(stylesheet);
  }

  function clearIntent() { try { sessionStorage.removeItem(key); } catch { /* Storage is optional. */ } }
  function cleanup() {
    clearTimeout(departureTimer); clearTimeout(cleanupTimer); clearTimeout(styleWaitTimer);
    cancelStyleWait?.(); cancelStyleWait = null;
    overlay?.remove(); overlay = null; destination = null; navigating = false; departurePlayed = false;
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
    try { sessionStorage.setItem(key, JSON.stringify({ path: destination.pathname, at: Date.now(), animate: !skip, departurePlayed })); } catch { /* Navigation still works. */ }
    try { location.assign(destination.href); } catch { clearIntent(); cleanup(); }
    // A cancelled navigation must never leave the portal covered or inert.
    cleanupTimer = setTimeout(() => { clearIntent(); cleanup(); }, 5000);
  }
  function mount(phase, point, standalone = false) {
    const locale = (window.EP_I18N?.locale?.() || root.lang || 'pt').slice(0, 2);
    const copy = words[locale] || words.pt;
    overlay = document.createElement('div');
    overlay.className = `diary-entrance diary-entrance--${phase}`;
    const interactive = phase === 'departure' || standalone;
    overlay.setAttribute('role', interactive ? 'dialog' : 'status');
    if (interactive) overlay.setAttribute('aria-modal', 'true');
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
    if (interactive) {
      const skip = document.createElement('button');
      skip.type = 'button'; skip.className = 'diary-entrance__skip'; skip.textContent = copy[4];
      const skipPassage = () => phase === 'departure' ? navigate({ skip: true }) : cleanup();
      skip.addEventListener('click', skipPassage);
      skip.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); skipPassage(); } });
      overlay.append(skip);
      previousFocus = document.activeElement;
      for (const element of document.body.children) { inertElements.set(element, element.inert); element.inert = true; }
      document.body.append(overlay); skip.focus({ preventScroll: true });
    } else document.body.append(overlay);
    return overlay;
  }

  function depart(point) {
    if (!destination || navigating) return;
    departurePlayed = true;
    mount('departure', point); root.classList.add('diary-entrance-leaving');
    departureTimer = setTimeout(navigate, 2250);
  }
  function waitForStyles(point) {
    if (stylesheet.sheet) { depart(point); return; }
    let settled = false;
    const clear = () => {
      clearTimeout(styleWaitTimer);
      stylesheet.removeEventListener('load', loaded);
      stylesheet.removeEventListener('error', failed);
    };
    const finish = styled => {
      if (settled) return;
      settled = true; clear(); cancelStyleWait = null;
      if (!destination || navigating) return;
      if (styled) depart(point);
      else navigate(); // The destination can run the complete passage itself.
    };
    const loaded = () => finish(true), failed = () => finish(false);
    cancelStyleWait = () => { settled = true; clear(); };
    stylesheet.addEventListener('load', loaded);
    stylesheet.addEventListener('error', failed);
    styleWaitTimer = setTimeout(failed, 1500);
  }

  if (diaryPath.test(location.pathname)) {
    let intent;
    try { intent = JSON.parse(sessionStorage.getItem(key)); } catch { /* The arrival also works without storage. */ }
    clearIntent();
    const freshIntent = intent?.path === location.pathname && Date.now() - intent.at >= 0 && Date.now() - intent.at < 15000;
    const freshNavigation = performance.getEntriesByType('navigation')[0]?.type === 'navigate';
    const wantsPassage = freshIntent && intent.animate !== false;
    // The site deliberately sends no referrer. A fresh entry must work even
    // when the portal script was late, storage is blocked, or a link was shared.
    const standalone = (wantsPassage && intent.departurePlayed === false) || (!freshIntent && freshNavigation);
    if (wantsPassage || standalone) {
      root.classList.add('diary-entrance-pending');
      // This script runs in the head, so the old page cannot flash at arrival.
      cleanupTimer = setTimeout(cleanup, 6000);
      document.addEventListener('DOMContentLoaded', () => {
        const scene = mount('arrival', null, standalone);
        if (standalone) scene.classList.add('diary-entrance--standalone');
        else scene.style.setProperty('--entry-elapsed', `${2250 + Math.max(0, Date.now() - intent.at)}ms`);
        const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => {
          root.classList.add('diary-entrance-revealing');
          clearTimeout(cleanupTimer); cleanupTimer = setTimeout(cleanup, 2250);
        }));
        if (standalone) departureTimer = setTimeout(reveal, 2250);
        else reveal();
      }, { once: true });
    }
  } else {
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || anchor.hasAttribute('download') || anchor.target && anchor.target !== '_self') return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || !diaryPath.test(url.pathname)) return;
      event.preventDefault();
      if (destination) return;
      destination = url;
      const box = anchor.getBoundingClientRect();
      const point = event.detail ? { x: event.clientX, y: event.clientY } : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      waitForStyles(point);
    });
    document.addEventListener('keydown', event => {
      if (!destination) return;
      if (event.key === 'Escape') { event.preventDefault(); navigate({ skip: true }); }
      if (event.key === 'Tab') { event.preventDefault(); overlay?.querySelector('button').focus(); }
    });
  }
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

/** Fixed-height, continuous diary pagination with an optional paper sound. */
export function createPagedEditor({ textarea, viewport, measure, paper, indicator, previous, next, soundUrl, getVolume = () => 0.14 } = {}) {
  if (!textarea || !viewport || !measure || !paper || !indicator || !previous || !next) throw new Error('PAGINACAO_INDISPONIVEL');
  let page = 0;
  let total = 1;
  let pageHeight = 1;
  let turnTimer = 0;
  let sound = null;

  function updateControls() {
    indicator.textContent = `Página ${page + 1} de ${total}`;
    previous.disabled = page === 0;
    next.disabled = page >= total - 1;
    previous.setAttribute('aria-label', page === 0 ? 'Você está na primeira página' : `Ir para a página ${page}`);
    next.setAttribute('aria-label', page >= total - 1 ? 'Você está na última página' : `Ir para a página ${page + 2}`);
  }

  function playPaper(direction) {
    if (!soundUrl || typeof Audio !== 'function') return;
    const volume = Math.max(0, Math.min(1, Number(getVolume()) || 0));
    if (!volume) return;
    try {
      sound ||= new Audio(soundUrl);
      sound.preload = 'none';
      sound.volume = volume;
      sound.playbackRate = direction === 'backward' ? 0.92 : 1;
      sound.currentTime = 0;
      void sound.play().catch(() => {});
    } catch { /* A virada visual continua quando o navegador bloqueia áudio. */ }
  }

  function animateTurn(direction, withSound) {
    if (withSound) playPaper(direction);
    paper.dispatchEvent(new CustomEvent('diarypageturn', { detail: { direction, page: page + 1, total } }));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    clearTimeout(turnTimer);
    paper.classList.remove('is-turning-forward', 'is-turning-backward');
    void paper.offsetWidth;
    paper.classList.add(direction === 'backward' ? 'is-turning-backward' : 'is-turning-forward');
    turnTimer = setTimeout(() => paper.classList.remove('is-turning-forward', 'is-turning-backward'), 760);
  }

  function show(target, { animate = false, withSound = false } = {}) {
    const nextPage = Math.max(0, Math.min(total - 1, Number(target) || 0));
    const changed = nextPage !== page;
    const direction = nextPage < page ? 'backward' : 'forward';
    page = nextPage;
    textarea.style.transform = page ? `translate3d(0, -${page * pageHeight}px, 0)` : '';
    updateControls();
    if (changed && animate) animateTurn(direction, withSound);
    return changed;
  }

  function copyTypography() {
    const style = getComputedStyle(textarea);
    for (const property of ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'textIndent', 'textTransform', 'wordSpacing']) {
      measure.style[property] = style[property];
    }
    measure.style.width = `${textarea.clientWidth}px`;
    return { style, lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 };
  }

  function pageAtCaret() {
    const caret = textarea.selectionStart ?? textarea.value.length;
    const { lineHeight } = copyTypography();
    measure.replaceChildren(document.createTextNode(textarea.value.slice(0, caret) || '\u200b'));
    const marker = document.createElement('span');
    marker.className = 'journal-caret-marker';
    marker.textContent = '\u200b';
    measure.append(marker);
    return Math.max(0, Math.min(total - 1, Math.floor((marker.offsetTop + lineHeight * 0.35) / pageHeight)));
  }

  function layout({ reset = false, followCaret = false, animate = false, withSound = false } = {}) {
    const available = Math.max(1, viewport.clientHeight);
    textarea.style.height = `${available}px`;
    textarea.style.transform = '';
    const { lineHeight } = copyTypography();
    pageHeight = Math.max(lineHeight * 4, Math.floor(available / lineHeight) * lineHeight);
    textarea.style.height = `${pageHeight}px`;
    const contentHeight = Math.max(pageHeight, textarea.scrollHeight);
    textarea.style.height = `${Math.ceil(contentHeight)}px`;
    const previousTotal = total;
    total = Math.max(1, Math.ceil((contentHeight - 1) / pageHeight));
    let target = reset ? 0 : Math.min(page, total - 1);
    if (followCaret) target = pageAtCaret();
    const createdPage = total > previousTotal && target > page;
    show(target, { animate: animate && (createdPage || target !== page), withSound });
    updateControls();
    return { page, total, pageHeight };
  }

  const previousPage = () => show(page - 1, { animate: true, withSound: true });
  const nextPage = () => show(page + 1, { animate: true, withSound: true });
  const revealCaret = () => layout({ followCaret: true, animate: true, withSound: true });
  const keyNavigation = event => {
    if (event.key === 'PageUp' && page > 0) { event.preventDefault(); previousPage(); }
    if (event.key === 'PageDown' && page < total - 1) { event.preventDefault(); nextPage(); }
  };
  previous.addEventListener('click', previousPage);
  next.addEventListener('click', nextPage);
  textarea.addEventListener('keyup', revealCaret);
  textarea.addEventListener('click', revealCaret);
  textarea.addEventListener('keydown', keyNavigation);
  updateControls();

  return {
    layout,
    reset() { return layout({ reset: true }); },
    follow({ animate = true, withSound = true } = {}) { return layout({ followCaret: true, animate, withSound }); },
    show,
    destroy() {
      clearTimeout(turnTimer);
      previous.removeEventListener('click', previousPage);
      next.removeEventListener('click', nextPage);
      textarea.removeEventListener('keyup', revealCaret);
      textarea.removeEventListener('click', revealCaret);
      textarea.removeEventListener('keydown', keyNavigation);
      paper.classList.remove('is-turning-forward', 'is-turning-backward');
      try { sound?.pause(); } catch { /* Best effort. */ }
      sound = null;
    },
    get page() { return page; },
    get total() { return total; },
    get pageHeight() { return pageHeight; },
  };
}

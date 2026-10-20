export const DIARY_PAGE_COUNT = 365;

/** Fixed-height, continuous diary pagination with an optional paper sound. */
export function createPagedEditor({ textarea, viewport, measure, paper, indicator, previous, next, soundUrl, getVolume = () => 0.14, getBook = () => null, onEntryNavigate = () => {}, onEmptyPage = () => {} } = {}) {
  if (!textarea || !viewport || !measure || !paper || !indicator || !previous || !next) throw new Error('PAGINACAO_INDISPONIVEL');
  let page = 0;
  let total = 1;
  let pageHeight = 1;
  let turnTimer = 0;
  let finishEntryTurn = null;
  let sound = null;
  let soundRequest = 0, soundStartTimer = 0;
  let invitationPlaying = false;
  const effect = document.getElementById('pageTurnEffect');
  const sheetCounts = new Map();
  const turnDuration = 1100;
  let lastInteraction = -Infinity;
  const noteInteraction = event => {
    if (event.isTrusted && event.target.closest?.('#journalText,#newPageButton,#previousWritingPage,#nextWritingPage')) lastInteraction = performance.now();
  };

  function cancelTurn() {
    clearTimeout(turnTimer);
    paper.classList.remove('is-turning-forward', 'is-turning-backward', 'is-turning-entry');
    effect?.classList.remove('is-turning-forward', 'is-turning-backward', 'is-turning-entry');
    effect?.replaceChildren();
    const finish = finishEntryTurn;
    finishEntryTurn = null;
    finish?.(false);
  }

  function bookPosition() {
    const book = getBook();
    if (!book?.entries?.length) return { offset: 0, total, previousEntry: null, nextEntry: null };
    const index = book.entries.findIndex(entry => entry.id === book.currentId);
    if (index < 0) return { offset: 0, total, previousEntry: null, nextEntry: null };
    const metrics = `${textarea.clientWidth}:${pageHeight}:${textarea.style.fontFamily}:${getComputedStyle(textarea).font}`;
    let offset = 0, bookTotal = 0;
    book.entries.forEach((entry, entryIndex) => {
      let count = total;
      if (entryIndex !== index) {
        const cached = sheetCounts.get(entry.id);
        if (cached?.metrics === metrics && cached.text === entry.text) count = cached.count;
        else {
          copyTypography();
          measure.textContent = `${entry.text || ''}\u200b`;
          count = Math.max(1, Math.ceil((measure.scrollHeight - 1) / pageHeight));
          sheetCounts.set(entry.id, { metrics, text: entry.text, count });
        }
      }
      if (entryIndex < index) offset += count;
      bookTotal += count;
    });
    for (const id of sheetCounts.keys()) if (!book.entries.some(entry => entry.id === id)) sheetCounts.delete(id);
    return { offset, total: bookTotal, previousEntry: book.entries[index - 1]?.id, nextEntry: book.entries[index + 1]?.id };
  }

  function updateControls() {
    const book = bookPosition(), number = book.offset + page + 1;
    // Static translations must not replace the live counter after i18n loads.
    indicator.removeAttribute('data-i18n');
    previous.removeAttribute('data-i18n-aria-label');
    next.removeAttribute('data-i18n-aria-label');
    indicator.textContent = `Página ${number} de ${DIARY_PAGE_COUNT}`;
    indicator.dataset.bookPage = String(number);
    indicator.dataset.usedPages = String(book.total);
    indicator.dataset.sheetPage = String(page + 1);
    indicator.dataset.sheetTotal = String(total);
    previous.disabled = page === 0 && !book.previousEntry;
    next.disabled = page >= total - 1 && !book.nextEntry && book.total >= DIARY_PAGE_COUNT;
    previous.setAttribute('aria-label', previous.disabled ? 'Você está na primeira página' : `Ir para a página ${number - 1}`);
    next.setAttribute('aria-label', next.disabled ? 'Você está na última página' : `Ir para a página ${number + 1}`);
  }

  function playPaper(direction, { invitation = false } = {}) {
    if ((!invitation && (document.hidden || !document.hasFocus() || performance.now() - lastInteraction > 1200)) || !soundUrl || typeof Audio !== 'function') return;
    const volume = Math.max(0, Math.min(1, Number(getVolume()) || 0));
    if (!volume) return;
    try {
      stopPaper();
      sound ||= new Audio(soundUrl);
      invitationPlaying = invitation;
      sound.preload = 'none';
      sound.loop = false;
      sound.volume = invitation ? Math.min(.1, volume * .6) : volume;
      sound.playbackRate = direction === 'backward' ? 0.92 : 1;
      sound.currentTime = 0;
      const request = soundRequest;
      soundStartTimer = setTimeout(() => { if (request === soundRequest) stopPaper(); }, 500);
      void sound.play().then(() => {
        if (request !== soundRequest) return;
        clearTimeout(soundStartTimer);
        if (document.hidden && !invitation) stopPaper();
      }).catch(() => { if (request === soundRequest) clearTimeout(soundStartTimer); });
    } catch { /* A virada visual continua quando o navegador bloqueia áudio. */ }
  }

  function animateTurn(direction, withSound) {
    cancelTurn();
    if (withSound) playPaper(direction);
    const book = bookPosition();
    paper.dispatchEvent(new CustomEvent('diarypageturn', { detail: { direction, page: book.offset + page + 1, total: DIARY_PAGE_COUNT } }));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    clearTimeout(turnTimer);
    paper.classList.remove('is-turning-forward', 'is-turning-backward');
    void paper.offsetWidth;
    paper.classList.add(direction === 'backward' ? 'is-turning-backward' : 'is-turning-forward');
    effect?.classList.add(direction === 'backward' ? 'is-turning-backward' : 'is-turning-forward');
    turnTimer = setTimeout(cancelTurn, turnDuration);
  }

  function turnEntry(update, source, { direction = 'forward', lastSheet = false } = {}) {
    cancelTurn();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let snapshot = null;
    if (effect && source && !reduced) {
      snapshot = source.cloneNode(true);
      const originals = [source, ...source.querySelectorAll('*')];
      const copies = [snapshot, ...snapshot.querySelectorAll('*')];
      originals.forEach((original, index) => {
        const copy = copies[index], style = getComputedStyle(original);
        copy.style.cssText = Array.from(style, property => `${property}:${style.getPropertyValue(property)}`).join(';');
        copy.style.animation = 'none'; copy.style.transition = 'none';
        copy.style.backfaceVisibility = 'hidden';
        for (const attribute of ['id', 'name', 'autofocus', 'aria-live']) copy.removeAttribute(attribute);
        if (original instanceof HTMLTextAreaElement) copy.value = original.value;
      });
      snapshot.classList.add('page-turn-snapshot');
      Object.assign(snapshot.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0', transform: 'translateZ(0.5px)', backfaceVisibility: 'hidden' });
      snapshot.inert = true;
      snapshot.setAttribute('aria-hidden', 'true');
    }
    update();
    layout({ reset: true });
    if (lastSheet) show(total - 1);
    playPaper(direction);
    const book = bookPosition();
    paper.dispatchEvent(new CustomEvent('diarypageturn', { detail: { direction, entry: true, page: book.offset + page + 1, total: DIARY_PAGE_COUNT } }));
    if (!effect || reduced) return Promise.resolve(true);
    if (snapshot) effect.append(snapshot);
    void paper.offsetWidth;
    paper.classList.add('is-turning-entry');
    effect.classList.add('is-turning-entry', direction === 'backward' ? 'is-turning-backward' : 'is-turning-forward');
    return new Promise(resolve => {
      finishEntryTurn = resolve;
      turnTimer = setTimeout(() => {
        finishEntryTurn = null;
        cancelTurn();
        resolve(true);
      }, turnDuration);
    });
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

  const previousPage = () => {
    if (page > 0) show(page - 1, { animate: true, withSound: true });
    else { const id = bookPosition().previousEntry; if (id) onEntryNavigate(id, 'backward'); }
  };
  const nextPage = () => {
    if (page < total - 1) show(page + 1, { animate: true, withSound: true });
    else {
      const book = bookPosition();
      if (book.nextEntry) onEntryNavigate(book.nextEntry, 'forward');
      else if (book.total < DIARY_PAGE_COUNT) onEmptyPage();
    }
  };
  const revealCaret = event => {
    if (event.type === 'keyup' && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    layout({ followCaret: true });
  };
  function stopPaper() {
    soundRequest++; clearTimeout(soundStartTimer);
    try { sound?.pause(); } catch { /* Best effort. */ }
  }
  const leavePage = () => { lastInteraction = -Infinity; if (!invitationPlaying) stopPaper(); };
  const visibilityChanged = () => { if (document.hidden) leavePage(); };
  const keyNavigation = event => {
    if (event.key === 'PageUp' && !previous.disabled) { event.preventDefault(); previousPage(); }
    if (event.key === 'PageDown' && !next.disabled) { event.preventDefault(); nextPage(); }
  };
  previous.addEventListener('click', previousPage);
  next.addEventListener('click', nextPage);
  textarea.addEventListener('keyup', revealCaret);
  textarea.addEventListener('click', revealCaret);
  textarea.addEventListener('keydown', keyNavigation);
  document.addEventListener('visibilitychange', visibilityChanged);
  for (const type of ['pointerdown', 'keydown', 'beforeinput']) document.addEventListener(type, noteInteraction, true);
  window.addEventListener('blur', leavePage);
  window.addEventListener('pagehide', stopPaper);
  updateControls();

  return {
    layout,
    turnEntry,
    invite() { playPaper('forward', { invitation: true }); },
    stopSound: stopPaper,
    cancelTurn,
    clearBook() { sheetCounts.clear(); measure.replaceChildren(); cancelTurn(); },
    reset() { return layout({ reset: true }); },
    follow({ animate = false, withSound = false } = {}) { return layout({ followCaret: true, animate, withSound }); },
    show,
    fits(value) {
      if (pageHeight <= 1) return true;
      copyTypography();
      measure.textContent = `${value || ''}\u200b`;
      const count = Math.max(1, Math.ceil((measure.scrollHeight - 1) / pageHeight));
      // Existing writing is always editable, including older oversized books.
      return count <= total || bookPosition().total - total + count <= DIARY_PAGE_COUNT;
    },
    get full() { return bookPosition().total >= DIARY_PAGE_COUNT; },
    destroy() {
      cancelTurn();
      previous.removeEventListener('click', previousPage);
      next.removeEventListener('click', nextPage);
      textarea.removeEventListener('keyup', revealCaret);
      textarea.removeEventListener('click', revealCaret);
      textarea.removeEventListener('keydown', keyNavigation);
      document.removeEventListener('visibilitychange', visibilityChanged);
      for (const type of ['pointerdown', 'keydown', 'beforeinput']) document.removeEventListener(type, noteInteraction, true);
      window.removeEventListener('blur', leavePage);
      window.removeEventListener('pagehide', stopPaper);
      paper.classList.remove('is-turning-forward', 'is-turning-backward');
      stopPaper();
      sound = null;
    },
    get page() { return page; },
    get total() { return total; },
    get pageHeight() { return pageHeight; },
  };
}

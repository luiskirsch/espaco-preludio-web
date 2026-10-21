/* A local, ephemeral passage: private words become light, never a DOM node. */
const TAU = Math.PI * 2;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
let ritualSerial = 0;

function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function canvasSurface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function erase(canvas) {
  if (!canvas) return;
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0; canvas.height = 0;
}

/* Canvas wrapping follows the textarea's own font, padding and scroll position.
   Nothing containing the writing is ever appended to the document. The temporary
   bitmap is cleared after conversion to numeric geometry and star coordinates. */
function captureWriting(source, width, height, limit) {
  const style = getComputedStyle(source);
  const box = source.getBoundingClientRect();
  const rect = {
    left: Math.max(0, box.left), top: Math.max(0, box.top),
    right: Math.min(width, box.right), bottom: Math.min(height, box.bottom),
  };
  rect.width = Math.max(1, rect.right - rect.left);
  rect.height = Math.max(1, rect.bottom - rect.top);
  const mask = canvasSurface(rect.width, rect.height);
  const ctx = mask.getContext('2d', { willReadFrequently: true });
  if (!ctx) { erase(mask); return { rect, paths: [], points: [], color: style.color }; }
  const number = key => parseFloat(style[key]) || 0;
  const left = number('borderLeftWidth') + number('paddingLeft');
  const top = number('borderTopWidth') + number('paddingTop');
  const contentWidth = Math.max(1, source.clientWidth - number('paddingLeft') - number('paddingRight'));
  const lineHeight = number('lineHeight') || number('fontSize') * 1.2;
  const fontSize = number('fontSize') || 20;
  const originX = box.left - rect.left + left - source.scrollLeft;
  const originY = box.top - rect.top + top - source.scrollTop;
  ctx.font = style.font || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = style.direction;
  ctx.fillStyle = '#fff';
  if ('letterSpacing' in ctx) ctx.letterSpacing = style.letterSpacing;
  const ascent = ctx.measureText('Mg').fontBoundingBoxAscent || fontSize * .83;
  const descent = ctx.measureText('Mg').fontBoundingBoxDescent || fontSize * .2;
  const baseline = (lineHeight - ascent - descent) / 2 + ascent;
  let lineNumber = 0;
  let writing = String(source.value || '').replace(/\r\n?/g, '\n');
  const drawLine = line => {
    const y = originY + baseline + lineNumber++ * lineHeight;
    if (y + descent < 0 || y - ascent > rect.height) return;
    let x = originX;
    const measured = ctx.measureText(line).width;
    if (style.textAlign === 'center') x += (contentWidth - measured) / 2;
    else if (style.textAlign === 'right' || style.textAlign === 'end' && style.direction !== 'rtl' || style.textAlign === 'start' && style.direction === 'rtl') x += contentWidth - measured;
    ctx.fillText(line, x, y);
  };
  // Keep hard line breaks and spaces, and split a long unbroken word as a
  // textarea does. Tab stops are visual only, and never enter a DOM attribute.
  let paragraphs = writing.split('\n');
  for (let paragraph of paragraphs) {
    paragraph = paragraph.replace(/\t/g, '        ');
    if (source.wrap === 'off') { drawLine(paragraph); continue; }
    const tokens = paragraph.match(/\S+\s*|\s+/gu) || [''];
    let line = '';
    for (const token of tokens) {
      if (ctx.measureText(line + token).width <= contentWidth) { line += token; continue; }
      if (line && line.trim()) { drawLine(line); line = ''; }
      if (ctx.measureText(token).width <= contentWidth) { line = token; continue; }
      for (const glyph of token) {
        if (line && ctx.measureText(line + glyph).width > contentWidth) { drawLine(line); line = ''; }
        line += glyph;
      }
    }
    drawLine(line);
  }
  writing = ''; paragraphs.length = 0; paragraphs = null;
  let pixels = ctx.getImageData(0, 0, mask.width, mask.height);
  const paths = Array.from({ length: 4 }, () => new Path2D());
  const candidates = [];
  let inkPixels = 0;
  // Quantized runs retain the actual letter shapes without retaining either
  // their string or a text bitmap. Four paths cost four fills per frame.
  for (let y = 0; y < mask.height; y++) {
    let runStart = 0, bucket = -1;
    for (let x = 0; x <= mask.width; x++) {
      const alpha = x < mask.width ? pixels.data[(y * mask.width + x) * 4 + 3] : 0;
      const next = alpha > 24 ? Math.min(3, Math.floor(alpha / 64)) : -1;
      if (next !== bucket) {
        if (bucket >= 0) paths[bucket].rect(runStart + rect.left, y + rect.top, x - runStart, 1);
        runStart = x; bucket = next;
      }
      if (alpha > 80) inkPixels++;
    }
  }
  const stride = Math.max(1.3, Math.sqrt(inkPixels / limit));
  const random = randomGenerator(7093);
  for (let y = stride / 2; y < mask.height; y += stride) {
    for (let x = stride / 2; x < mask.width; x += stride) {
      const alpha = pixels.data[(Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3];
      if (alpha > 60) candidates.push({ x: rect.left + x, y: rect.top + y, weight: alpha / 255, seed: random() });
    }
  }
  // A deterministic reservoir bounds even very dense glyphs on small screens.
  for (let index = candidates.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
  }
  candidates.length = Math.min(candidates.length, limit);
  pixels.data.fill(0); pixels = null; erase(mask);
  return { rect, paths, points: candidates, color: style.color };
}

function starSprite(cool = false) {
  const canvas = canvasSurface(64, 64), ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, '#fffaf0');
  gradient.addColorStop(.06, '#fff1c5');
  gradient.addColorStop(.15, cool ? '#d2ddffb0' : '#f3cc8fb0');
  gradient.addColorStop(.38, cool ? '#bacaf52d' : '#e7af682d');
  gradient.addColorStop(1, '#e7af6800');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  return canvas;
}

function nebulaSurface(width, height, night, random) {
  const canvas = canvasSurface(Math.min(960, width), Math.min(700, height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const w = canvas.width, h = canvas.height;
  ctx.globalCompositeOperation = 'screen';
  // Several translucent clouds follow one galactic arc. A transparent edge
  // leaves the diary's own warm / midnight universe visible underneath.
  for (let index = 0; index < 38; index++) {
    const t = index / 37;
    const x = mix(-.12, 1.1, t) * w;
    const y = (.47 - Math.sin(t * Math.PI) * .27 + (random() - .5) * .12) * h;
    const radius = Math.min(w, h) * (.12 + random() * .18);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const hue = night ? 220 + random() * 38 : 25 + random() * 18;
    glow.addColorStop(0, `hsla(${hue},${night ? 28 : 34}%,${night ? 45 : 52}%,.085)`);
    glow.addColorStop(.45, `hsla(${night ? 257 : 327},24%,35%,.035)`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return canvas;
}

function makeParticles(points, width, height, rect, random) {
  return points.map((point, index) => {
    const band = random(), scatter = random();
    const angle = random() * TAU;
    const destinationX = width * (.025 + random() * .95);
    // Most stars join the overhead arc; a few travel to the horizon, making
    // the entire viewport feel like a destination rather than a little card.
    const destinationY = scatter < .72
      ? height * (.17 + .2 * Math.pow((destinationX / width - .5) * 2, 2) + (random() - .5) * .14)
      : height * (.05 + random() * .82);
    return {
      ...point, index,
      delay: .64 + (1 - clamp((point.x - rect.left) / rect.width)) * .78 + random() * .38,
      duration: 3 + random() * .95,
      dx: destinationX, dy: destinationY,
      c1x: point.x + Math.cos(angle) * width * .13,
      c1y: point.y - height * (.12 + random() * .25),
      c2x: width * (.22 + band * .56),
      c2y: -height * (.04 + random() * .15),
      size: .58 + Math.pow(random(), 3) * 1.45,
      brightness: .35 + random() * .6,
      flicker: random() * TAU,
      sparkle: index % 43 === 0,
    };
  });
}

function position(particle, amount) {
  const t = clamp(amount), u = 1 - t;
  return {
    x: u * u * u * particle.x + 3 * u * u * t * particle.c1x + 3 * u * t * t * particle.c2x + t * t * t * particle.dx,
    y: u * u * u * particle.y + 3 * u * u * t * particle.c1y + 3 * u * t * t * particle.c2y + t * t * t * particle.dy,
  };
}

/**
 * Capture is synchronous; onRelease can immediately clear and close the source
 * dialog. finished resolves on arrival (or cancellation), while the quiet sky
 * remains until the person chooses to return. External cancel never calls
 * onReturn. No writing, geometry or canvas survives cancellation.
 */
export function startReleaseRitual({ source, onRelease, onReturn, labels = {} }) {
  let width = window.innerWidth, height = window.innerHeight;
  const mountedAt = performance.now();
  const mobile = width < 700;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const snapshot = captureWriting(source, width, height, mobile ? 700 : 1400);
  onRelease?.();
  source = null; onRelease = null;

  const copy = {
    close: 'Voltar ao diário', title: 'Há espaço para respirar.',
    description: 'Suas palavras agora fazem parte deste céu. Fique pelo tempo que quiser.',
    return: 'Voltar ao meu diário', skip: 'Ir para o céu',
    progress: 'Suas palavras estão se transformando em estrelas.', ...labels,
  };
  const night = document.documentElement.dataset.diaryTheme === 'night';
  const random = randomGenerator(4519 + ++ritualSerial * 17);
  let particles = makeParticles(snapshot.points, width, height, snapshot.rect, random);
  snapshot.points.length = 0;
  const dialog = document.createElement('dialog');
  const titleId = `releaseRitualTitle${ritualSerial}`;
  dialog.className = 'release-ritual';
  dialog.dataset.phase = 'gather';
  if (reduced) dialog.classList.add('release-ritual--still');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('aria-describedby', `${titleId}Description`);
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = '<div class="release-ritual__veil" aria-hidden="true"></div><canvas class="release-ritual__canvas" aria-hidden="true"></canvas><div class="release-ritual__horizon" aria-hidden="true"></div><button class="release-ritual__skip" type="button"></button><button class="release-ritual__close" type="button"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m3 3 10 10m0-10-10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button><div class="release-ritual__arrival"><span class="release-ritual__arrival-star" aria-hidden="true">✧</span><h2></h2><p></p><button class="release-ritual__return" id="releaseDone" type="button" hidden></button></div><p class="release-ritual__status sr-only" role="status" aria-live="polite"></p>';
  const canvas = dialog.querySelector('canvas');
  const closeButton = dialog.querySelector('.release-ritual__close');
  const skipButton = dialog.querySelector('.release-ritual__skip');
  const returnButton = dialog.querySelector('.release-ritual__return');
  const title = dialog.querySelector('h2');
  const description = dialog.querySelector('.release-ritual__arrival p');
  const status = dialog.querySelector('[role=status]');
  title.id = titleId; title.textContent = copy.title;
  description.id = `${titleId}Description`; description.textContent = copy.description;
  closeButton.setAttribute('aria-label', copy.close);
  skipButton.textContent = copy.skip; returnButton.textContent = copy.return;
  status.textContent = copy.progress;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d', { alpha: true });
  const sprites = [starSprite(false), starSprite(true)];
  let nebula = nebulaSurface(width, height, night, random);
  let frame = 0, cancelled = false, settled = false, resolved = false, returning = false;
  let start = null, pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
  let settleTimer = 0;
  let resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  const resolve = wasCancelled => {
    if (resolved) return;
    resolved = true; resolveFinished({ cancelled: wasCancelled });
  };
  const ambient = Array.from({ length: mobile ? 80 : 155 }, () => ({
    x: random() * width, y: random() * height,
    size: .3 + Math.pow(random(), 4) * 1.1, alpha: .15 + random() * .48,
    depth: .2 + random() * .8, phase: random() * TAU,
  }));

  const removeListeners = () => {
    window.removeEventListener('resize', viewportChanged);
    window.visualViewport?.removeEventListener('resize', viewportChanged);
    window.removeEventListener('pagehide', cancel);
    document.removeEventListener('visibilitychange', visibilityChanged);
    dialog.removeEventListener('pointermove', pointerMoved);
    dialog.removeEventListener('cancel', userCancel);
    dialog.removeEventListener('close', closed);
    closeButton.removeEventListener('click', returnToDiary);
    returnButton.removeEventListener('click', returnToDiary);
    skipButton.removeEventListener('click', skip);
  };
  function cancel() {
    if (cancelled) return;
    cancelled = true;
    cancelAnimationFrame(frame); clearTimeout(settleTimer); removeListeners();
    snapshot.paths.length = 0; snapshot.points.length = 0; particles.length = 0; particles = [];
    ambient.length = 0; sprites.forEach(erase); erase(nebula); erase(canvas);
    if (dialog.open) dialog.close();
    dialog.remove();
    document.body.classList.remove('is-releasing');
    resolve(true); onReturn = null;
  }
  function returnToDiary() {
    if (cancelled || returning) return;
    returning = true;
    const returnHandler = onReturn;
    cancel(); returnHandler?.();
  }
  function userCancel(event) { event.preventDefault(); returnToDiary(); }
  function closed() { if (!cancelled) returnToDiary(); }
  function visibilityChanged() { if (document.hidden) returnToDiary(); }
  function viewportChanged() {
    const nextWidth = window.innerWidth, nextHeight = window.innerHeight;
    if (Math.abs(nextWidth - width) <= 2 && Math.abs(nextHeight - height) <= 2) return;
    // Closing a mobile keyboard is part of releasing the words. Preserve
    // their captured screen positions while the new sky gains its height.
    if (mobile && Math.abs(nextWidth - width) <= 2 && performance.now() - mountedAt < 1800) {
      const ratioX = nextWidth / width, ratioY = nextHeight / height;
      for (const particle of particles) {
        particle.dx *= ratioX; particle.dy *= ratioY;
        particle.c2x *= ratioX; particle.c2y *= ratioY;
      }
      for (const star of ambient) { star.x *= ratioX; star.y *= ratioY; }
      width = nextWidth; height = nextHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      erase(nebula); nebula = nebulaSurface(width, height, night, random);
      return;
    }
    // A genuine layout / orientation change ends the passage cleanly and
    // returns focus through the integration's own restoration callback.
    returnToDiary();
  }
  function pointerMoved(event) {
    if (reduced) return;
    targetX = (event.clientX / width - .5) * 10;
    targetY = (event.clientY / height - .5) * 7;
  }
  function settle() {
    if (cancelled || settled) return;
    settled = true; snapshot.paths.length = 0;
    dialog.dataset.phase = 'settled'; returnButton.hidden = false;
    skipButton.hidden = true; status.textContent = copy.title;
    resolve(false);
  }
  function skip() {
    if (cancelled || settled) return;
    cancelAnimationFrame(frame); settle(); draw(7, true);
    returnButton.focus({ preventScroll: true });
  }

  function draw(time, staticFrame = false) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    const cosmos = reduced ? smooth(time / 1.3) : smooth((time - .25) / 3.8);
    pointerX = mix(pointerX, targetX, .035); pointerY = mix(pointerY, targetY, .035);
    const drift = reduced || staticFrame ? 0 : Math.sin(time * .11) * 4;
    ctx.globalAlpha = cosmos * (night ? .8 : .76);
    ctx.drawImage(nebula, -width * .055 + pointerX * .25 + drift, -height * .045 + pointerY * .25, width * 1.11, height * 1.09);
    ctx.globalCompositeOperation = 'screen';
    for (const star of ambient) {
      const twinkle = reduced || staticFrame ? .85 : .78 + Math.sin(time * .7 + star.phase) * .22;
      ctx.globalAlpha = star.alpha * cosmos * twinkle;
      const size = star.size * 9;
      ctx.drawImage(sprites[star.depth > .65 ? 1 : 0], star.x - size / 2 + pointerX * star.depth, star.y - size / 2 + pointerY * star.depth, size, size);
    }
    if (!reduced && time < 2.2) {
      // One slow breath of light gathers under the writing before it leaves.
      // Reuse the glow sprite; no flashing, new texture or bitmap of words.
      const rect = snapshot.rect, haloWidth = rect.width * 1.8;
      const haloHeight = Math.max(180, rect.height * 1.8);
      ctx.globalAlpha = Math.sin(clamp(time / 2.2) * Math.PI) * .12;
      ctx.drawImage(sprites[night ? 1 : 0], rect.left + rect.width / 2 - haloWidth / 2, rect.top + rect.height * .45 - haloHeight / 2, haloWidth, haloHeight);
    }

    // Actual writing remains readable through the anticipation, then a soft
    // diagonal front releases its letter shapes. It is geometry, never text.
    if (snapshot.paths.length && time < (reduced ? 1.15 : 2.12)) {
      ctx.save();
      const fade = reduced ? 1 - smooth(time / 1.15) : 1 - smooth((time - .65) / 1.46);
      if (!reduced && time > .65) {
        const rect = snapshot.rect;
        const edge = rect.right + 24 - smooth((time - .65) / 1.46) * (rect.width + 48);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(edge, 0);
        for (let y = 0; y <= height + 18; y += 18) ctx.lineTo(edge + Math.sin(y * .035 + time * 1.2) * 11 + y / height * 22, y);
        ctx.lineTo(0, height); ctx.closePath(); ctx.clip();
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = snapshot.color;
      for (let index = 0; index < snapshot.paths.length; index++) {
        ctx.globalAlpha = fade * (index + 1) / 4;
        ctx.fill(snapshot.paths[index]);
      }
      ctx.restore();
    } else if (snapshot.paths.length) snapshot.paths.length = 0;

    ctx.globalCompositeOperation = 'screen';
    for (const particle of particles) {
      const progress = reduced ? smooth(time / 1.3) : clamp((time - particle.delay) / particle.duration);
      if (!reduced && time < particle.delay) continue;
      const eased = reduced ? 1 : smooth(progress);
      const point = reduced ? { x: particle.dx, y: particle.dy } : position(particle, eased);
      const twinkle = reduced || staticFrame ? .88 : .8 + Math.sin(time * 1.3 + particle.flicker) * .2;
      const born = reduced ? progress : smooth((time - particle.delay) / .35);
      const opacity = born * particle.brightness * twinkle * mix(1, .8, smooth((progress - .65) / .35));
      const size = particle.size * (progress < .8 ? 8.5 : 7.2);
      const x = point.x + pointerX * (.25 + particle.seed * .75);
      const y = point.y + pointerY * (.25 + particle.seed * .75);
      // Only a handful of leading stars carry a silk-fine tail. The rest are
      // small grains of light, preserving the writing's fragile texture.
      if (!reduced && particle.sparkle && progress > .04 && progress < .88) {
        const previous = position(particle, smooth(clamp(progress - .025)));
        ctx.globalAlpha = opacity * .25; ctx.strokeStyle = night ? '#d8ddff' : '#f5dbab';
        ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.globalAlpha = opacity;
      ctx.drawImage(sprites[particle.seed > .87 ? 1 : 0], x - size / 2, y - size / 2, size, size);
      if (particle.sparkle && progress > .64) {
        const ray = particle.size * (2 + Math.sin(time * .6 + particle.flicker) * .45);
        ctx.globalAlpha = opacity * .48; ctx.strokeStyle = '#fff3d5'; ctx.lineWidth = .55;
        ctx.beginPath(); ctx.moveTo(x - ray * 1.5, y); ctx.lineTo(x + ray * 1.5, y);
        ctx.moveTo(x, y - ray * 2.1); ctx.lineTo(x, y + ray * 2.1); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function animate(timestamp) {
    if (cancelled) return;
    if (start === null) start = timestamp;
    const time = (timestamp - start) / 1000;
    if (!settled) {
      if (time >= (reduced ? 1.4 : 6.2)) settle();
      else if (time >= 2.4 && !reduced) {
        if (dialog.dataset.phase !== 'voyage') dialog.dataset.phase = 'voyage';
      } else if (time >= .64 && dialog.dataset.phase !== 'dissolve') dialog.dataset.phase = 'dissolve';
    }
    draw(time, settled);
    // The arrival becomes a still sky; no perpetual animation or battery use
    // remains while the person stays with this moment.
    if (!settled) frame = requestAnimationFrame(animate);
  }

  document.body.append(dialog);
  document.body.classList.add('is-releasing');
  closeButton.addEventListener('click', returnToDiary);
  returnButton.addEventListener('click', returnToDiary);
  skipButton.addEventListener('click', skip);
  dialog.addEventListener('cancel', userCancel);
  dialog.addEventListener('close', closed);
  dialog.addEventListener('pointermove', pointerMoved);
  window.addEventListener('resize', viewportChanged);
  window.visualViewport?.addEventListener('resize', viewportChanged);
  window.addEventListener('pagehide', cancel);
  document.addEventListener('visibilitychange', visibilityChanged);
  try { dialog.showModal(); } catch { cancel(); return { cancel, finished }; }
  closeButton.focus({ preventScroll: true });
  if (ctx) { draw(0); frame = requestAnimationFrame(animate); }
  else settle();
  // A blocked rendering loop must still expose the return action.
  settleTimer = setTimeout(() => {
    if (cancelled || settled) return;
    cancelAnimationFrame(frame); settle(); draw(7, true);
  }, reduced ? 1900 : 7000);
  return { cancel, finished };
}

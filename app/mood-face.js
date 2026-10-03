// Carinha de humor "viva": SVG próprio (emoji é imagem estática).
// - parado: respira e pisca;
// - mouse (PC): pupilas e rosto seguem o ponteiro;
// - clique/toque: reação conforme o humor do dia.
// Respeita "reduzir movimento".

const MOUTHS = {
  5: `<clipPath id="__ID__m"><path d="M28 57 Q50 62 72 57 Q68 82 50 82 Q32 82 28 57Z"/></clipPath><path class="mf-mouth" d="M28 57 Q50 62 72 57 Q68 82 50 82 Q32 82 28 57Z" fill="#5b2330"/><g clip-path="url(#__ID__m)"><path d="M30 58 Q50 63 70 58 L70 62 Q50 66 30 62Z" fill="#fff"/><ellipse cx="50" cy="81" rx="13" ry="8" fill="#ef6a7a"/></g>`,
  4: `<path class="mf-mouth" d="M33 61 Q50 76 67 61" fill="none" stroke="#5b2330" stroke-width="4.6" stroke-linecap="round"/>`,
  3: `<path class="mf-mouth" d="M37 66 L63 66" fill="none" stroke="#5b2330" stroke-width="4.6" stroke-linecap="round"/>`,
  2: `<path class="mf-mouth" d="M38 68 Q50 63.5 62 68" fill="none" stroke="#5b2330" stroke-width="4.4" stroke-linecap="round"/>`,
  1: `<path class="mf-mouth" d="M35 71 Q50 59 65 71" fill="none" stroke="#5b2330" stroke-width="4.6" stroke-linecap="round"/>`
};
const BROWS = {
  1: `<g class="mf-brows" stroke="#7a4a1c" stroke-width="3.4" stroke-linecap="round" fill="none"><path d="M26 31 Q34 29 41 24"/><path d="M59 24 Q66 29 74 31"/></g>`,
  2: `<g class="mf-brows" stroke="#8a5a24" stroke-width="3" stroke-linecap="round" fill="none" opacity=".75"><path d="M27 31 L41 31"/><path d="M59 31 L73 31"/></g>`
};
// abertura padrão da pálpebra (0 = aberta, 1 = fechada)
const REST_LID = { 5: 0, 4: 0, 3: .12, 2: .5, 1: .22 };

let uid = 0;

export function mountMoodFace(host, mood) {
  mood = MOUTHS[mood] ? Number(mood) : 3;
  const id = `mf${++uid}`;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.innerHTML = `
  <span class="mf" data-mood="${mood}" role="img" aria-label="Humor do dia">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="${id}g" cx="42%" cy="34%" r="70%">
          <stop offset="0" stop-color="#ffe98a"/><stop offset=".55" stop-color="#ffc53d"/><stop offset="1" stop-color="#f39a21"/>
        </radialGradient>
        <radialGradient id="${id}b" cx="50%" cy="100%" r="60%"><stop offset="0" stop-color="#ff7aa8" stop-opacity=".55"/><stop offset="1" stop-color="#ff7aa8" stop-opacity="0"/></radialGradient>
        <clipPath id="${id}cl"><ellipse cx="35" cy="43" rx="9" ry="10.5"/></clipPath>
        <clipPath id="${id}cr"><ellipse cx="65" cy="43" rx="9" ry="10.5"/></clipPath>
      </defs>
      <ellipse class="mf-shadow" cx="50" cy="97" rx="26" ry="3" fill="rgba(0,0,0,.25)"/>
      <g class="mf-body">
        <g class="mf-head">
          <circle cx="50" cy="50" r="45" fill="url(#${id}g)"/>
          <circle cx="50" cy="50" r="45" fill="url(#${id}b)"/>
          <ellipse cx="36" cy="22" rx="13" ry="7" fill="#fff" opacity=".35" transform="rotate(-18 36 22)"/>
          <g class="mf-face">
            ${BROWS[mood] || ""}
            <g class="mf-eye" clip-path="url(#${id}cl)">
              <ellipse cx="35" cy="43" rx="9" ry="10.5" fill="#fff"/>
              <circle class="mf-pupil" cx="35" cy="44" r="4.6" fill="#3b2230"/>
              <rect class="mf-lid" x="24" y="31" width="22" height="25" fill="#ffcf4f"/>
            </g>
            <g class="mf-eye mf-eye--r" clip-path="url(#${id}cr)">
              <ellipse cx="65" cy="43" rx="9" ry="10.5" fill="#fff"/>
              <circle class="mf-pupil" cx="65" cy="44" r="4.6" fill="#3b2230"/>
              <rect class="mf-lid" x="54" y="31" width="22" height="25" fill="#ffcf4f"/>
            </g>
            <g class="mf-happyeyes" fill="none" stroke="#3b2230" stroke-width="4" stroke-linecap="round">
              <path d="M27 45 Q35 35 43 45"/><path d="M57 45 Q65 35 73 45"/>
            </g>
            <ellipse class="mf-cheek" cx="22" cy="60" rx="7" ry="4" fill="#ff7a8a" opacity=".35"/>
            <ellipse class="mf-cheek" cx="78" cy="60" rx="7" ry="4" fill="#ff7a8a" opacity=".35"/>
            <g class="mf-mouthwrap">${MOUTHS[mood].replaceAll("__ID__", id)}</g>
            <ellipse class="mf-yawn" cx="50" cy="68" rx="7" ry="9" fill="#5b2330"/>
            <path class="mf-tear" d="M33 54 Q29 61 33 64 Q37 61 33 54Z" fill="#7cc6f2"/>
          </g>
        </g>
      </g>
    </svg>
    <span class="mf-fx" aria-hidden="true"></span>
  </span>`;

  const root = host.querySelector(".mf");
  const head = root.querySelector(".mf-head");
  const face = root.querySelector(".mf-face");
  const pupils = [...root.querySelectorAll(".mf-pupil")];
  const lids = [...root.querySelectorAll(".mf-lid")];
  const fx = root.querySelector(".mf-fx");
  const rest = REST_LID[mood];

  // pálpebra: 0 aberta → 1 fechada (move o retângulo de cima para baixo)
  const setLid = (lid, v) => lid.setAttribute("transform", `translate(0 ${(-25 + v * 24.5).toFixed(2)})`);
  lids.forEach(l => setLid(l, rest));

  if (reduce) return { destroy() {} };

  let target = { x: 0, y: 0 }, cur = { x: 0, y: 0 }, raf = 0, alive = true, busy = false;
  const fine = matchMedia("(pointer: fine)").matches;

  function onMove(e) {
    const r = root.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dist / 260);
    target = { x: dx / dist * k, y: dy / dist * k };
  }
  function onLeave() { target = { x: 0, y: 0 }; }
  function tick() {
    if (!alive) return;
    cur.x += (target.x - cur.x) * .14;
    cur.y += (target.y - cur.y) * .14;
    pupils.forEach(p => p.setAttribute("transform", `translate(${(cur.x * 3.6).toFixed(2)} ${(cur.y * 4).toFixed(2)})`));
    face.setAttribute("transform", `translate(${(cur.x * 3).toFixed(2)} ${(cur.y * 2.4).toFixed(2)})`);
    head.style.transform = `rotate(${(cur.x * 7).toFixed(2)}deg)`;
    raf = requestAnimationFrame(tick);
  }
  if (fine) {
    addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
  }
  raf = requestAnimationFrame(tick);

  // piscar
  let blinkTimer;
  function animateLids(to, ms, which = lids) {
    return new Promise(res => {
      const from = which.map(l => (Number((l.getAttribute("transform") || "").match(/translate\(0 (-?[\d.]+)/)?.[1] ?? -25) + 25) / 24.5);
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.max(0, Math.min(1, (t - t0) / ms));
        which.forEach((l, i) => setLid(l, from[i] + (to - from[i]) * p));
        p < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }
  async function blink() {
    if (!alive) return;
    if (!busy) {
      const slow = mood === 2 ? 2.2 : 1;
      await animateLids(1, 70 * slow);
      await animateLids(rest, 110 * slow);
    }
    blinkTimer = setTimeout(blink, (mood === 2 ? 2400 : 2800) + Math.random() * 3200);
  }
  blinkTimer = setTimeout(blink, 1500 + Math.random() * 1500);

  function burst(chars, n, cls) {
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.className = cls;
      s.textContent = chars[i % chars.length];
      s.style.setProperty("--dx", `${(Math.random() * 2 - 1) * 70}px`);
      s.style.setProperty("--dy", `${-40 - Math.random() * 60}px`);
      s.style.setProperty("--rot", `${(Math.random() * 2 - 1) * 60}deg`);
      s.style.animationDelay = `${i * 40}ms`;
      fx.append(s);
      setTimeout(() => s.remove(), 1600);
    }
  }

  async function react() {
    if (busy) return;
    busy = true;
    root.classList.remove("is-react");
    void root.offsetWidth;
    root.classList.add("is-react");
    if (mood === 5) {
      burst(["✦", "✧", "★"], 9, "mf-spark");
    } else if (mood === 4) {
      animateLids(1, 90, [lids[1]]).then(() => setTimeout(() => animateLids(rest, 140, [lids[1]]), 380));
      burst(["♥"], 1, "mf-heart");
    } else if (mood === 3) {
      await animateLids(.45, 160);
    } else if (mood === 2) {
      animateLids(.92, 700);
      burst(["z", "Z"], 2, "mf-zzz");
    } else {
      // Mal: a lágrima é CSS
    }
    setTimeout(async () => {
      root.classList.remove("is-react");
      await animateLids(rest, 260);
      busy = false;
    }, mood === 2 ? 1700 : 1100);
  }
  root.addEventListener("click", react);
  root.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); react(); } });
  root.tabIndex = 0;

  return {
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(blinkTimer);
      removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    }
  };
}

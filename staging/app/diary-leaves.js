// A few loose leaves sit above the painted border. Only these accents move;
// the paper, handwriting and original artwork stay still while someone writes.
const LEAVES = [
  { shape: 'maple', tone: 'copper' },
  { shape: 'slender', tone: 'ochre' },
  { shape: 'slender', tone: 'amber' },
  { shape: 'maple', tone: 'copper' },
  { shape: 'slender', tone: 'ochre' },
  { shape: 'maple', tone: 'amber' },
  { shape: 'maple', tone: 'copper' },
];

const TONES = {
  copper: ['#edb264', '#c36c36', '#914423'],
  ochre: ['#f1cb82', '#cd9244', '#a0672f'],
  amber: ['#eac17b', '#cf8040', '#a65a2a'],
};

const ART = {
  maple: {
    outline: 'M49 80C40 79 31 82 24 80L30 68 12 65 19 57 6 44 25 45 20 26 36 35 39 17 47 25 54 7 60 30 72 20 71 39 87 34 82 50 96 52 80 65 85 75 65 77 57 85Z',
    veins: 'M53 91Q56 63 54 27M55 61 28 44M55 61 75 43M54 73 30 70M55 72 77 66M46 54 40 36M63 53 69 36',
    wash: 'M54 16Q53 53 49 80L35 78 39 66 25 54 36 55 31 41 44 47 44 31Z',
  },
  slender: {
    outline: 'M49 86C29 80 17 65 21 47 24 30 46 21 57 7 59 23 77 36 77 54 77 70 64 83 49 86Z',
    veins: 'M45 96Q52 67 56 25M51 77 32 63M53 65 29 48M55 49 39 34M52 74 68 63M54 60 71 49M55 44 65 33',
    wash: 'M57 13C48 32 34 35 30 53 27 68 37 80 49 84L52 69 54 42Z',
  },
};

let instance = 0;

function leafMarkup(leaf, index, prefix) {
  const [light, middle, dark] = TONES[leaf.tone];
  const { outline, veins, wash } = ART[leaf.shape];
  const gradient = `${prefix}-${index}`;
  return `<span class="diary-leaf diary-leaf--${index + 1}"><svg class="diary-leaf__art" viewBox="0 0 100 100" focusable="false" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${gradient}" x1=".18" y1=".12" x2=".83" y2=".95" gradientUnits="objectBoundingBox"><stop stop-color="${light}"/><stop offset=".56" stop-color="${middle}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
    <path d="${outline}" fill="url(#${gradient})" stroke="${dark}" stroke-opacity=".45" stroke-width=".7"/>
    <path d="${wash}" fill="${light}" opacity=".25" stroke="none"/>
    <path d="${veins}" fill="none" stroke="#783f20" stroke-opacity=".43" stroke-width=".8"/>
    <path d="M45 83Q51 83 53 89" fill="none" stroke="#f8d69b" stroke-opacity=".7" stroke-width=".6"/>
  </svg></span>`;
}

/** Mount once on the paper element; the layer never enters the interaction tree. */
export function mountDiaryLeaves(paper) {
  if (!paper) return null;
  const existing = Array.from(paper.children).find(child => child.classList.contains('diary-leaves'));
  if (existing) return existing;

  const layer = paper.ownerDocument.createElement('div');
  layer.className = 'diary-leaves';
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('inert', '');
  layer.innerHTML = LEAVES.map((leaf, index) => leafMarkup(leaf, index, `diary-leaf-${++instance}`)).join('');
  paper.prepend(layer);
  return layer;
}

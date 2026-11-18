// Avatares propios en SVG: color, carita y accesorio.
export const AVATAR_OPTIONS = {
  colors: ['#ff5d5d', '#ff9f43', '#ffd23f', '#3ddc97', '#2ec4b6', '#4d96ff', '#9b5de5', '#f15bb5', '#8d6e63', '#5c6b73'],
  faces: ['feliz', 'canchero', 'sorprendido', 'picaro', 'dormido', 'enojado', 'nervioso', 'lengua'],
  accessories: ['nada', 'gorra', 'anteojos', 'corona', 'mono', 'auriculares', 'bigote', 'vincha'],
};
export const FACE_LABEL = { feliz: 'Feliz', canchero: 'Canchero', sorprendido: 'Sorpresa', picaro: 'Pícaro', dormido: 'Dormido', enojado: 'Enojado', nervioso: 'Nervioso', lengua: 'Lengua' };
export const ACC_LABEL = { nada: 'Nada', gorra: 'Gorra', anteojos: 'Anteojos', corona: 'Corona', mono: 'Moño', auriculares: 'Auris', bigote: 'Bigote', vincha: 'Vincha' };

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const FACES = {
  feliz: [['circle', { cx: 38, cy: 46, r: 5 }], ['circle', { cx: 62, cy: 46, r: 5 }], ['path', { d: 'M36 62 Q50 76 64 62', stroke: true }]],
  canchero: [['path', { d: 'M32 46 h12', stroke: true }], ['circle', { cx: 62, cy: 46, r: 5 }], ['path', { d: 'M40 66 Q54 72 64 60', stroke: true }]],
  sorprendido: [['circle', { cx: 38, cy: 44, r: 6 }], ['circle', { cx: 62, cy: 44, r: 6 }], ['ellipse', { cx: 50, cy: 66, rx: 7, ry: 9 }]],
  picaro: [['path', { d: 'M32 44 q6 -6 12 0', stroke: true }], ['path', { d: 'M56 44 q6 -6 12 0', stroke: true }], ['path', { d: 'M38 62 Q50 72 64 60', stroke: true }]],
  dormido: [['path', { d: 'M32 47 q6 5 12 0', stroke: true }], ['path', { d: 'M56 47 q6 5 12 0', stroke: true }], ['ellipse', { cx: 50, cy: 66, rx: 5, ry: 4 }]],
  enojado: [['path', { d: 'M31 38 l13 6', stroke: true }], ['path', { d: 'M69 38 l-13 6', stroke: true }], ['circle', { cx: 39, cy: 48, r: 4 }], ['circle', { cx: 61, cy: 48, r: 4 }], ['path', { d: 'M38 68 Q50 58 62 68', stroke: true }]],
  nervioso: [['circle', { cx: 38, cy: 46, r: 5 }], ['circle', { cx: 62, cy: 46, r: 5 }], ['path', { d: 'M36 66 l5 -4 l5 4 l5 -4 l5 4 l5 -4', stroke: true }], ['path', { d: 'M72 30 q4 8 0 12 q-4 -4 0 -12', fill: '#7fd3ff' }]],
  lengua: [['circle', { cx: 38, cy: 46, r: 5 }], ['path', { d: 'M56 46 h12', stroke: true }], ['path', { d: 'M36 62 Q50 72 64 62', stroke: true }], ['path', { d: 'M46 66 q4 12 10 0', fill: '#ff7a9a' }]],
};

function accessory(g, a) {
  const ink = '#2a1f3d';
  if (a === 'gorra') {
    g.append(s('path', { d: 'M20 34 Q50 4 80 34 Z', fill: '#4d96ff', stroke: ink, 'stroke-width': 3 }), s('path', { d: 'M74 32 Q92 32 96 38 L70 38 Z', fill: '#4d96ff', stroke: ink, 'stroke-width': 3 }));
  } else if (a === 'anteojos') {
    g.append(s('circle', { cx: 38, cy: 46, r: 11, fill: 'rgba(255,255,255,.25)', stroke: ink, 'stroke-width': 3 }), s('circle', { cx: 62, cy: 46, r: 11, fill: 'rgba(255,255,255,.25)', stroke: ink, 'stroke-width': 3 }), s('path', { d: 'M49 46 h2', stroke: ink, 'stroke-width': 3 }));
  } else if (a === 'corona') {
    g.append(s('path', { d: 'M28 26 L34 8 L44 20 L50 4 L56 20 L66 8 L72 26 Z', fill: '#ffc83d', stroke: ink, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  } else if (a === 'mono') {
    g.append(s('path', { d: 'M50 14 L32 4 L32 24 Z M50 14 L68 4 L68 24 Z', fill: '#f15bb5', stroke: ink, 'stroke-width': 3, 'stroke-linejoin': 'round' }), s('circle', { cx: 50, cy: 14, r: 5, fill: '#f15bb5', stroke: ink, 'stroke-width': 3 }));
  } else if (a === 'auriculares') {
    g.append(s('path', { d: 'M18 50 Q18 10 50 10 Q82 10 82 50', fill: 'none', stroke: ink, 'stroke-width': 5 }), s('rect', { x: 10, y: 44, width: 14, height: 22, rx: 6, fill: '#ff5a3c', stroke: ink, 'stroke-width': 3 }), s('rect', { x: 76, y: 44, width: 14, height: 22, rx: 6, fill: '#ff5a3c', stroke: ink, 'stroke-width': 3 }));
  } else if (a === 'bigote') {
    g.append(s('path', { d: 'M50 58 Q40 52 30 60 Q38 64 50 60 Q62 64 70 60 Q60 52 50 58 Z', fill: ink }));
  } else if (a === 'vincha') {
    g.append(s('path', { d: 'M16 30 Q50 16 84 30 L84 38 Q50 24 16 38 Z', fill: '#3ddc97', stroke: ink, 'stroke-width': 3 }));
  }
}

/** SVG del avatar. size en px (el dibujo es de 100×100). */
export function avatarSVG(av = {}, { size = 64, title = '' } = {}) {
  const color = AVATAR_OPTIONS.colors.includes(av.color) ? av.color : AVATAR_OPTIONS.colors[5];
  const svg = s('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'av', role: 'img', 'aria-label': title || 'avatar' });
  if (title) {
    const tt = s('title');
    tt.textContent = title;
    svg.append(tt);
  }
  svg.append(s('circle', { cx: 50, cy: 52, r: 44, fill: color, stroke: '#2a1f3d', 'stroke-width': 4 }));
  svg.append(s('ellipse', { cx: 36, cy: 30, rx: 12, ry: 7, fill: 'rgba(255,255,255,.35)', transform: 'rotate(-25 36 30)' }));
  const g = s('g', { fill: '#2a1f3d' });
  for (const [tag, a] of FACES[av.face] || FACES.feliz) {
    const attrs = { ...a };
    if (attrs.stroke === true) Object.assign(attrs, { stroke: '#2a1f3d', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    g.append(s(tag, attrs));
  }
  svg.append(g);
  accessory(svg, av.accessory);
  return svg;
}

export function randomAvatar() {
  const pick = (l) => l[Math.floor(Math.random() * l.length)];
  return { color: pick(AVATAR_OPTIONS.colors), face: pick(AVATAR_OPTIONS.faces), accessory: pick(AVATAR_OPTIONS.accessories.slice(0, 5)) };
}

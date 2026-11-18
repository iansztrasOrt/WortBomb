// La bomba: SVG propio con una mecha que se quema de verdad. La mecha se acorta desde la punta
// (stroke-dasharray), la chispa la recorre, salen brasas y humo, y la bomba tiembla y late
// cada vez más rápido. explodeAt() dibuja la explosión.

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const mix = (a, b, t) => {
  const pa = a.match(/\w\w/g).map((x) => parseInt(x, 16));
  const pb = b.match(/\w\w/g).map((x) => parseInt(x, 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

// Recorrido de la mecha: sale de la boquilla y hace una curva hacia arriba a la derecha.
const FUSE_PATH = 'M80 30 C 86 16, 98 22, 100 12 S 112 2, 116 -6';

export function createBomb() {
  const wrap = document.createElement('div');
  wrap.className = 'bomb';
  wrap.setAttribute('aria-hidden', 'true');
  const svg = s('svg', { viewBox: '0 0 120 120' });
  const inner = s('g', { class: 'bomb-inner' });
  // sombra
  inner.append(s('ellipse', { cx: 52, cy: 114, rx: 30, ry: 5, fill: 'rgba(0,0,0,.18)' }));
  // cuerpo
  const body = s('circle', { class: 'body', cx: 52, cy: 72, r: 38, fill: '#2a1f3d', stroke: '#120c1c', 'stroke-width': 3 });
  inner.append(body);
  inner.append(s('ellipse', { cx: 38, cy: 56, rx: 13, ry: 8, fill: 'rgba(255,255,255,.28)', transform: 'rotate(-30 38 56)' }));
  inner.append(s('circle', { cx: 31, cy: 66, r: 3, fill: 'rgba(255,255,255,.35)' }));
  // boquilla
  inner.append(s('rect', { x: 66, y: 28, width: 20, height: 16, rx: 3, fill: '#8a7fa8', stroke: '#120c1c', 'stroke-width': 3, transform: 'rotate(38 76 36)' }));
  // mecha: base quemada (gris) y cordón trenzado que se acorta
  const burnt = s('path', { d: FUSE_PATH, fill: 'none', stroke: 'rgba(60,50,70,.35)', 'stroke-width': 4, 'stroke-linecap': 'round' });
  const rope = s('path', { d: FUSE_PATH, fill: 'none', stroke: '#d9a35b', 'stroke-width': 5, 'stroke-linecap': 'round' });
  const braid = s('path', { d: FUSE_PATH, fill: 'none', stroke: '#a8743a', 'stroke-width': 5, 'stroke-dasharray': '3 4' });
  inner.append(burnt, rope, braid);
  // chispa
  const spark = s('g', { class: 'spark' });
  spark.append(
    s('circle', { r: 9, fill: 'rgba(255,200,61,.35)' }),
    s('path', { class: 'core', d: 'M0 -9 L2.5 -2.5 L9 0 L2.5 2.5 L0 9 L-2.5 2.5 L-9 0 L-2.5 -2.5 Z', fill: '#ffc83d' }),
    s('circle', { r: 3, fill: '#fff' }),
  );
  const fx = s('g'); // brasas y humo
  inner.append(fx, spark);
  svg.append(inner);
  wrap.append(svg);

  let length = 0;
  let lastFx = 0;
  let lit = false;
  const measure = () => {
    if (!length) length = rope.getTotalLength() || 60;
    return length;
  };

  const api = {
    el: wrap,
    /** fraction: 1 = mecha entera, 0 = se terminó. level: 1..10 (peligro). */
    setBurn(fraction, level = 1, now = performance.now()) {
      const L = measure();
      const f = Math.max(0, Math.min(1, fraction));
      const visible = L * f;
      rope.setAttribute('stroke-dasharray', `${visible} ${L + 10}`);
      // el trenzado (rayitas 3-4) solo hasta donde queda mecha
      const dash = [];
      let acc = 0;
      while (acc < visible) {
        const on = Math.min(3, visible - acc);
        dash.push(on, 4);
        acc += 7;
      }
      dash.push(0, L + 10);
      braid.setAttribute('stroke-dasharray', dash.join(' '));
      const p = rope.getPointAtLength(visible);
      spark.setAttribute('transform', `translate(${p.x} ${p.y})`);
      spark.style.display = lit && f > 0 ? '' : 'none';
      // color del cuerpo según el peligro y lo poco que queda
      const heat = Math.min(1, (level - 1) / 9 * 0.6 + (1 - f) * 0.5);
      body.setAttribute('fill', mix('2a1f3d', '7a1d1d', heat));
      const hot = lit && f < 0.3;
      wrap.classList.toggle('ticking', lit);
      wrap.classList.toggle('hot', hot);
      const tick = Math.max(0.16, Math.min(1, f * 1.4 - level * 0.03));
      wrap.style.setProperty('--tick', `${tick}s`);
      // brasas y humo: más seguido cuanto más peligro
      if (lit && f > 0 && now - lastFx > Math.max(60, 260 - level * 18)) {
        lastFx = now;
        const ember = s('circle', { class: 'ember', cx: p.x, cy: p.y, r: 1.8 + Math.random() * 1.5, fill: Math.random() < 0.5 ? '#ffc83d' : '#ff5a3c' });
        ember.style.setProperty('--dx', `${(Math.random() - 0.3) * 22}px`);
        ember.style.setProperty('--dy', `${-6 - Math.random() * 16}px`);
        fx.append(ember);
        setTimeout(() => ember.remove(), 700);
        if (Math.random() < 0.35 + level * 0.04) {
          const smoke = s('circle', { class: 'smoke', cx: p.x, cy: p.y - 4, r: 6, fill: 'rgba(140,130,150,.6)' });
          smoke.style.setProperty('--sx', `${(Math.random() - 0.5) * 18}px`);
          fx.append(smoke);
          setTimeout(() => smoke.remove(), 1600);
        }
      }
      return hot;
    },
    light(on = true) {
      lit = on;
      wrap.classList.toggle('ticking', on);
      if (!on) wrap.classList.remove('hot');
    },
    /** Mueve la bomba a (x, y) relativo al centro de la arena; con vuelo en arco si animate. */
    moveTo(x, y, { animate = true, duration = 360 } = {}) {
      const from = api.pos || { x, y };
      api.pos = { x, y };
      wrap.classList.remove('gone');
      const end = `translate(${x}px, ${y}px)`;
      if (!animate || (from.x === x && from.y === y) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        wrap.style.transform = end;
        return;
      }
      // arco: el punto medio se levanta hacia el centro de la arena y un poco hacia arriba
      const mx = (from.x + x) / 2 * 0.45;
      const my = (from.y + y) / 2 * 0.45 - 40;
      wrap.animate([
        { transform: `translate(${from.x}px, ${from.y}px) rotate(0deg) scale(1)` },
        { transform: `translate(${mx}px, ${my}px) rotate(200deg) scale(1.15)`, offset: 0.5 },
        { transform: `${end} rotate(360deg) scale(1)` },
      ], { duration, easing: 'cubic-bezier(.4,.1,.3,1)' });
      wrap.style.transform = end;
    },
    hide() {
      wrap.classList.add('gone');
    },
  };
  return api;
}

/** Explosión en (x, y) relativo al centro de `arena`. */
export function explodeAt(arena, x, y, { word = '¡BUM!', scale = 1 } = {}) {
  const boom = document.createElement('div');
  boom.className = 'boom';
  boom.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  boom.append(Object.assign(document.createElement('div'), { className: 'flash' }), Object.assign(document.createElement('div'), { className: 'ring' }));
  const colors = ['#2a1f3d', '#ff5a3c', '#ffc83d', '#8a7fa8', '#d9a35b'];
  for (let i = 0; i < 18; i += 1) {
    const b = document.createElement('i');
    b.className = 'bit';
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const d = 70 + Math.random() * 90;
    b.style.background = colors[i % colors.length];
    b.style.setProperty('--x', `${Math.cos(a) * d}px`);
    b.style.setProperty('--y', `${Math.sin(a) * d}px`);
    b.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    boom.append(b);
  }
  for (let i = 0; i < 6; i += 1) {
    const p = document.createElement('i');
    p.className = 'puff';
    p.style.setProperty('--x', `${(Math.random() - 0.5) * 120}px`);
    p.style.setProperty('--y', `${-20 - Math.random() * 70}px`);
    boom.append(p);
  }
  const w = document.createElement('div');
  w.className = 'word';
  w.textContent = word;
  boom.append(w);
  arena.append(boom);
  setTimeout(() => boom.remove(), 1500);
}

/** Bomba decorativa para la portada (quemándose en bucle). */
export function heroBomb() {
  const b = createBomb();
  b.el.classList.add('hero-bomb');
  b.el.style.position = 'relative';
  b.el.style.left = 'auto';
  b.el.style.top = 'auto';
  b.el.style.margin = '0';
  b.light(true);
  let start = performance.now();
  const loop = (now) => {
    if (!b.el.isConnected) return;
    const f = 1 - ((now - start) % 9000) / 9000;
    b.setBurn(Math.max(0.12, f), 3, now);
    if (f < 0.13) start = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return b.el;
}

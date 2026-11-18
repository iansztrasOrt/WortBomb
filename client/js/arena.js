// La rondita: asientos de los jugadores vivos, la bomba que viaja de uno a otro, el centro con la
// sílaba y las explosiones. Toda la geometría sale de /engine/circle.js, que está probada para que
// nada tape nada (2 a 16 jugadores, en compu y celular).
import { arenaLayout, bombPlacement, labelMode } from '/engine/circle.js';
import { el, highlight } from './ui.js';
import { avatarSVG } from './avatar.js';
import { createBomb, explodeAt } from './bomb.js';

export function createArena(root) {
  const arena = el('div', { class: 'arena', role: 'region', 'aria-label': 'Ronda de jugadores' });
  const seatsLayer = el('div');
  const center = el('div', { class: 'center' });
  const syllableEl = el('div', { class: 'syllable', 'aria-live': 'polite' });
  const fuseBar = el('div', { class: 'fuse-bar', 'aria-hidden': 'true' }, el('i'));
  const live = el('div', { class: 'live' });
  const whose = el('div', { class: 'whose' });
  const clock = el('div', { class: 'clock' });
  center.append(whose, syllableEl, fuseBar, live, clock);
  const bomb = createBomb();
  arena.append(seatsLayer, center, bomb.el);
  root.append(arena);

  const seatEls = new Map(); // id → { el, av, hearts, badge, name, lives }
  let layout = { seats: [], size: 80, rx: 0, ry: 0, cy: 0, center: { hw: 120, hh: 80, cy: 0 } };
  let order = []; // ids vivos, en orden de asiento
  let maxLives = 3;
  let liveTimer = 0;

  function seatEl(p) {
    let s = seatEls.get(p.id);
    if (s) return s;
    const badge = el('span', { class: 'lives-badge', 'aria-hidden': 'true' });
    const av = el('div', { class: 'av-wrap' }, avatarSVG(p.avatar, { size: 80, title: p.name }), badge);
    const name = el('div', { class: 'name', text: p.name, title: p.name });
    const hearts = el('div', { class: 'hearts', 'aria-label': 'vidas' });
    const node = el('div', { class: 'seat', dataset: { id: p.id } }, av, name, hearts);
    seatsLayer.append(node);
    s = { el: node, av, hearts, badge, name, lives: null };
    seatEls.set(p.id, s);
    return s;
  }

  function setHearts(s, lives, { breaking = false, gained = false } = {}) {
    s.hearts.replaceChildren();
    s.hearts.setAttribute('aria-label', `${lives} vidas`);
    const total = Math.max(maxLives, lives);
    for (let i = 0; i < total; i += 1) {
      const h = el('span', { class: `h${i >= lives ? ' lost' : ''}`, text: '❤️' });
      if (breaking && i === lives) h.classList.add('breaking');
      if (gained && i === lives - 1) h.classList.add('gained');
      s.hearts.append(h);
    }
    s.badge.textContent = `❤️${lives}`;
    s.lives = lives;
  }

  /** Dibuja/actualiza los asientos. players: [{id,name,avatar,lives,alive,connected}] en orden de asiento. */
  function render(players, { meId, activeId, lives = 3 } = {}) {
    maxLives = lives;
    const alive = players.filter((p) => p.alive);
    order = alive.map((p) => p.id);
    const rect = arena.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    layout = arenaLayout(alive.length, { width: rect.width, height: rect.height, localIndex: order.indexOf(meId) });
    const sz = Math.round(layout.size);
    const mode = labelMode(layout.size);
    arena.dataset.labels = mode;
    arena.style.setProperty('--seat', `${sz}px`);
    arena.style.setProperty('--name-w', `${Math.floor(sz * 1.25)}px`);

    // Centro: ocupa exactamente el hueco libre de la ronda.
    const { hw, hh, cy } = layout.center;
    center.style.width = `${hw * 2}px`;
    center.style.height = `${hh * 2}px`;
    center.style.transform = `translate(-50%, calc(-50% + ${cy}px))`;
    const syl = Math.max(20, Math.min(86, hh * 0.62, hw * 0.48));
    center.style.setProperty('--syl', `${syl}px`);
    center.style.setProperty('--live', `${Math.max(12, Math.min(24, syl * 0.36))}px`);
    center.classList.toggle('tight', hh < 72);
    center.classList.toggle('tiny', hh < 44);

    for (const p of players) {
      const s = seatEl(p);
      if (!p.alive) {
        if (!s.el.classList.contains('leaving')) {
          s.el.classList.add('leaving');
          setTimeout(() => {
            s.el.remove();
            seatEls.delete(p.id);
          }, 900);
        }
        continue;
      }
      const pos = layout.seats[order.indexOf(p.id)];
      // El punto del asiento es el centro del avatar; la etiqueta cuelga debajo.
      s.el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -${sz / 2}px)`;
      const svg = s.av.querySelector('svg');
      svg.setAttribute('width', sz);
      svg.setAttribute('height', sz);
      s.el.classList.toggle('me', p.id === meId);
      s.el.classList.toggle('active', p.id === activeId);
      s.el.classList.toggle('off', p.connected === false);
      if (s.lives !== p.lives) setHearts(s, p.lives);
    }
    for (const [id, s] of seatEls) {
      if (!players.some((p) => p.id === id)) {
        s.el.remove();
        seatEls.delete(id);
      }
    }
  }

  /** Lugar y tamaño de la bomba en el turno de `id` (sin tapar a nadie ni el centro). */
  function bombAt(id) {
    const i = order.indexOf(id);
    if (i < 0) return { x: 0, y: layout.center.cy, size: 60 };
    return bombPlacement(layout, i, { center: layout.center });
  }
  function seatPos(id) {
    const i = order.indexOf(id);
    return i < 0 ? { x: 0, y: 0 } : layout.seats[i];
  }

  return {
    el: arena,
    bomb,
    render,
    seatPos,
    /** Lleva la bomba al jugador `id` (con vuelo si animate). */
    placeBomb(id, { animate = true } = {}) {
      const b = bombAt(id);
      bomb.el.style.width = `${b.size}px`;
      bomb.el.style.height = `${b.size}px`;
      bomb.el.style.margin = `${-b.size / 2}px 0 0 ${-b.size / 2}px`;
      bomb.moveTo(b.x, b.y, { animate });
      return b;
    },
    setActive(id) {
      for (const [sid, s] of seatEls) s.el.classList.toggle('active', sid === id);
    },
    setSyllable(syl, { animate = true } = {}) {
      if (syllableEl.textContent === syl) return;
      syllableEl.textContent = syl || '';
      syllableEl.hidden = !syl;
      if (animate && syl) {
        syllableEl.classList.remove('new');
        void syllableEl.offsetWidth;
        syllableEl.classList.add('new');
      }
    },
    setFuse(fraction) {
      fuseBar.firstChild.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    },
    setWhose(text) {
      whose.textContent = text;
    },
    setClock(text) {
      clock.textContent = text;
    },
    /** Lo que escribe el jugador activo, en el centro, con la sílaba resaltada. */
    setLive(text, syllable, kind = '') {
      clearTimeout(liveTimer);
      live.className = `live ${kind}`;
      live.replaceChildren(highlight(text || '', syllable));
    },
    /** Palabra aceptada: se muestra en el centro en verde y el asiento hace un destello. */
    showAccepted(id, word, syllable) {
      this.setLive(`✓ ${word}`, syllable, 'ok');
      liveTimer = setTimeout(() => { live.replaceChildren(); live.className = 'live'; }, 900);
      const s = seatEls.get(id);
      if (s) {
        s.el.classList.remove('ok');
        void s.el.offsetWidth;
        s.el.classList.add('ok');
      }
    },
    loseLife(id, lives) {
      const s = seatEls.get(id);
      if (s) setHearts(s, lives, { breaking: true });
    },
    gainLife(id, lives) {
      const s = seatEls.get(id);
      if (s) setHearts(s, lives, { gained: true });
    },
    /** Explosión sobre el jugador (es una animación de 1 s: tapa a propósito, y se va). */
    explode(id) {
      const p = seatPos(id);
      explodeAt(arena, p.x, p.y, { scale: Math.max(0.5, Math.min(1, layout.size / 90)) });
      arena.classList.remove('shake');
      void arena.offsetWidth;
      arena.classList.add('shake');
    },
  };
}

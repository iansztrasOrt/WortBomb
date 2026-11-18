// Tutorial "para ver": cada regla tiene una escenita animada con la ronda, la bomba y la sílaba.
// Se abre la primera vez y desde "¿Cómo se juega?" (inicio) y "Tutorial" (sala). En partida no.
// (No hay bonus: todas las palabras valen igual y las vidas no se recuperan.)
import { el, modal, store, highlight } from './ui.js';
import { createBomb, explodeAt } from './bomb.js';
import { avatarSVG } from './avatar.js';

const PEOPLE = [
  { name: 'Vos', avatar: { color: '#9b5de5', face: 'canchero', accessory: 'corona' } },
  { name: 'Ramona', avatar: { color: '#ff5d5d', face: 'picaro', accessory: 'nada' } },
  { name: 'Tito', avatar: { color: '#3ddc97', face: 'feliz', accessory: 'gorra' } },
  { name: 'Male', avatar: { color: '#ffd23f', face: 'sorprendido', accessory: 'nada' } },
];
// Ronda de 4 en sentido horario empezando por VOS abajo: abajo, izquierda, arriba, derecha (% de la escena)
const SPOTS = [[50, 76], [14, 47], [50, 18], [86, 47]];

/** Escena base: avatares en ronda, sílaba al centro y bomba. Devuelve utilidades para animar. */
function roundScene(art, { syllable = 'TR', lives = 2 } = {}) {
  const scene = el('div', { class: 'scene' });
  const seats = PEOPLE.map((p, i) => {
    const hearts = el('span', { class: 's-hearts' });
    const node = el('div', { class: 's-av', style: { left: `${SPOTS[i][0]}%`, top: `${SPOTS[i][1]}%` } }, avatarSVG(p.avatar, { size: 42 }), hearts);
    scene.append(node);
    return { node, hearts, lives };
  });
  const syl = el('div', { class: 's-syl', text: syllable });
  const note = el('div', { class: 's-note', hidden: true });
  const bomb = createBomb();
  bomb.light(true);
  scene.append(syl, bomb.el, note);
  art.append(scene);
  const drawHearts = () => seats.forEach((s) => { s.hearts.textContent = s.lives > 0 ? '❤️'.repeat(s.lives) : '💀'; });
  drawHearts();
  const px = (i) => {
    const r = scene.getBoundingClientRect();
    return { x: (SPOTS[i][0] / 100 - 0.5) * r.width, y: (SPOTS[i][1] / 100 - 0.5) * r.height };
  };
  // la bomba al costado del avatar, hacia el siguiente en sentido horario
  const bombAt = (i) => {
    const p = px(i);
    const n = px((i + 1) % 4);
    const dx = n.x - p.x;
    const dy = n.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / d) * 40, y: p.y + (dy / d) * 40 };
  };
  let burnStart = performance.now();
  let burnMs = 2000;
  let raf = 0;
  const loop = (now) => {
    if (!scene.isConnected) return;
    bomb.setBurn(1 - Math.min(1, (now - burnStart) / burnMs), scene.classList.contains('red') ? 10 : 3, now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    scene, seats, syl, note, bomb, drawHearts, px,
    active(i) { seats.forEach((s, k) => s.node.classList.toggle('on', k === i)); },
    give(i, { animate = true, ms = 2000 } = {}) {
      const b = bombAt(i);
      bomb.moveTo(b.x, b.y, { animate, duration: 420 });
      this.active(i);
      burnStart = performance.now();
      burnMs = ms;
    },
    boom(i) {
      const p = px(i);
      bomb.hide();
      explodeAt(scene, p.x, p.y, { scale: 0.55 });
    },
    say(text) {
      note.hidden = !text;
      note.textContent = text || '';
    },
    stop() { cancelAnimationFrame(raf); },
  };
}

/** Línea de tiempo cancelable: [[ms, fn], ...] que se repite. */
function timeline(steps, total) {
  const timers = [];
  let stopped = false;
  const run = () => {
    if (stopped) return;
    for (const [ms, fn] of steps) timers.push(setTimeout(() => !stopped && fn(), ms));
    timers.push(setTimeout(run, total));
  };
  run();
  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
}

const STEPS = [
  {
    title: '¡Bienvenido a wORTbomb!',
    text: 'Se juega en ronda. La bomba pasa de mano en mano, siempre al siguiente en sentido horario. Vos estás abajo.',
    scene(art) {
      const s = roundScene(art, { syllable: 'TR' });
      let i = 0;
      s.give(0, { animate: false, ms: 1500 });
      s.say('La bomba pasa al siguiente →');
      const words = ['tren', 'otro', 'trampa', 'estrella'];
      const stop = timeline([[1500, () => { i = (i + 1) % 4; s.syl.textContent = ['ON', 'CA', 'TR', 'ES'][i]; s.give(i, { ms: 1500 }); s.say(`✓ "${words[i]}" — le toca a ${PEOPLE[i].name}`); }]], 1600);
      return () => { stop(); s.stop(); };
    },
  },
  {
    title: 'Escribí una palabra con la sílaba',
    text: 'Cuando te toca, aparece una sílaba y el campo ya está listo: escribís y Enter, sin tocar nada. Probá ahora con "AR":',
    interactive: 'ar',
  },
  {
    title: '🚫 No se puede repetir ninguna palabra',
    text: '<b>Regla de oro:</b> una palabra que ya se usó en la partida no vale más, la haya dicho quien la haya dicho. Tampoco cambiándole tildes ni mayúsculas. No perdés vida por intentarlo… pero la mecha sigue corriendo.',
    scene(art) {
      const box = el('div', { class: 'scene', style: { display: 'grid', placeItems: 'center' } });
      const list = el('div', { class: 'stack', style: { justifyItems: 'center' } });
      box.append(list);
      art.append(box);
      const items = [['pill good', '✓ casa — Ramona'], ['pill hot', '✗ CASA — ya se usó (la usó Ramona)'], ['pill hot', '✗ cása — ya se usó'], ['pill good', '✓ casas — vale (es otra forma)']];
      const stop = timeline(items.map(([cls, txt], k) => [k * 900, () => {
        if (k === 0) list.replaceChildren();
        const it = el('span', { class: cls, text: txt });
        it.style.animation = cls.includes('hot') ? 'inputShake .4s' : 'slideIn .4s';
        list.append(it);
      }]), 4600);
      return stop;
    },
  },
  {
    title: '💥 Si te explota, la sílaba pasa',
    text: 'Perdés una vida (<b>no se recuperan nunca</b>) y la bomba pasa al siguiente <b>con la misma sílaba</b>. Si él tampoco la sabe, recién ahí sale una nueva. Sin vidas quedás eliminado y mirás desde la tribuna.',
    scene(art) {
      const s = roundScene(art, { syllable: 'GÜ' });
      const reset = () => {
        s.seats.forEach((x) => { x.lives = 2; });
        s.drawHearts();
        s.syl.textContent = 'GÜ';
        s.give(1, { animate: false, ms: 1600 });
        s.say('Ramona no sabe ninguna con "GÜ"…');
      };
      reset();
      const stop = timeline([
        [1600, () => { s.boom(1); s.seats[1].lives -= 1; s.drawHearts(); s.say('💥 ¡Pierde una vida!'); }],
        [2500, () => { s.give(2, { ms: 1600 }); s.say('La MISMA sílaba pasa a Tito'); }],
        [4100, () => { s.boom(2); s.seats[2].lives -= 1; s.drawHearts(); s.say('💥 Tito tampoco…'); }],
        [5000, () => { s.syl.textContent = 'ON'; s.give(3, { ms: 1600 }); s.say('Ninguno la supo: ¡sílaba nueva!'); }],
        [6200, () => { s.say('✓ "melón" — Male la pasa'); s.give(0, { ms: 1600 }); }],
      ], 7600);
      const again = setInterval(reset, 7600);
      return () => { stop(); clearInterval(again); s.stop(); };
    },
  },
  {
    title: '💣 La mecha se acorta (de a poco)',
    text: 'De dos formas: con el <b>tiempo de partida</b> (un 5 % menos por minuto) y <b>cada vez que alguien pierde una vida</b> (un 3 % menos). Mirá el medidor de peligro arriba.',
    scene(art) {
      const box = el('div', { class: 'scene' });
      const clock = el('b');
      const lost = el('b');
      const secs = el('b');
      const bar = el('i');
      box.append(el('div', { class: 's-meter', style: { top: '34px' } },
        el('div', { class: 'row', style: { justifyContent: 'space-between' } }, el('span', {}, '⏱️ Tiempo de partida: ', clock), el('span', {}, '💔 Vidas perdidas: ', lost)),
        el('div', { class: 's-bar' }, bar),
        el('div', { style: { textAlign: 'center', fontSize: '22px' } }, '💣 Mecha: ', secs)));
      art.append(box);
      const frames = [[0, 0], [1, 0], [1, 1], [2, 2], [3, 2], [3, 4], [4, 5], [5, 6]];
      const stop = timeline(frames.map(([m, l], k) => [k * 700, () => {
        const v = Math.max(3, 12 * 0.95 ** m * 0.97 ** l);
        clock.textContent = `${m}:00`;
        lost.textContent = String(l);
        secs.textContent = `${v.toFixed(1)} s`;
        bar.style.width = `${(v / 12) * 100}%`;
      }]), frames.length * 700 + 900);
      return stop;
    },
  },
  {
    title: '💀 Muerte súbita',
    text: 'Si la partida se alarga, aparece una cuenta regresiva. Al llegar a cero la pantalla se pone roja: <b>todos quedan con 1 vida</b> y la bomba va el doble de rápido.',
    scene(art) {
      const s = roundScene(art, { syllable: 'RR', lives: 3 });
      const big = el('div', { class: 's-big', hidden: true });
      s.scene.append(big);
      const reset = () => {
        s.scene.classList.remove('red');
        s.seats.forEach((x, k) => { x.lives = [3, 2, 3, 1][k]; });
        s.drawHearts();
        s.give(0, { animate: false, ms: 3000 });
        s.syl.hidden = false;
        s.say('⏳ Muerte súbita en…');
      };
      reset();
      const stop = timeline([
        [0, () => { big.hidden = false; big.textContent = '3'; s.syl.hidden = true; }],
        [700, () => { big.textContent = '2'; }],
        [1400, () => { big.textContent = '1'; }],
        [2100, () => {
          big.textContent = '¡MUERTE SÚBITA!';
          big.style.fontSize = '34px';
          s.scene.classList.add('red');
          s.seats.forEach((x) => { x.lives = 1; });
          s.drawHearts();
          s.give(0, { animate: false, ms: 900 });
          s.say('Todos con 1 vida · la bomba vuela');
        }],
        [3000, () => { big.hidden = true; big.style.fontSize = ''; s.syl.hidden = false; s.give(1, { ms: 900 }); }],
        [3900, () => { s.give(2, { ms: 900 }); }],
        [4800, () => { s.give(3, { ms: 900 }); }],
      ], 6000);
      const again = setInterval(reset, 6000);
      return () => { stop(); clearInterval(again); s.stop(); };
    },
  },
  {
    title: '¡Listo para jugar!',
    text: 'Todas las palabras valen igual. No hace falta escribir tildes: "cancion" vale igual que "canción". Valen plurales, femeninos, conjugaciones, voseo ("tenés", "decime") y regionalismos. El último que queda con vidas gana.',
    scene(art) {
      const box = el('div', { class: 'scene', style: { display: 'grid', placeItems: 'center' } },
        el('div', { class: 'logo', style: { fontSize: '58px' } }, el('span', { class: 'w', text: 'w' }), el('span', { class: 'ort', text: 'ORT' }), el('span', { text: 'bomb' })));
      art.append(box);
      return () => {};
    },
  },
];

export function shouldShowTutorial() {
  return !store.get('wortbomb.tutorialDone', false);
}

export function openTutorial() {
  let i = 0;
  let cleanup = () => {};
  const box = el('div', { class: 'card modal tutorial' });
  const m = modal(box, { label: 'Cómo se juega', onClose: () => { cleanup(); store.set('wortbomb.tutorialDone', true); } });
  function render() {
    cleanup();
    cleanup = () => {};
    const step = STEPS[i];
    const art = el('div', { class: 'step-art', 'aria-hidden': step.interactive ? null : 'true' });
    const text = el('p');
    for (const part of step.text.split(/(<b>.*?<\/b>)/)) text.append(part.startsWith('<b>') ? el('strong', { text: part.slice(3, -4) }) : part);
    let extra = null;
    if (step.interactive) {
      const syl = step.interactive;
      const out = el('div', { class: 'msg-line', role: 'status' });
      const ghost = el('div', { class: 'ghost', 'aria-hidden': 'true' });
      const inp = el('input', { maxlength: 30, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Probá una palabra', placeholder: 'ej: árbol' });
      inp.addEventListener('input', () => ghost.replaceChildren(highlight(inp.value, syl)));
      extra = el('form', {
        class: 'stack', onsubmit: (e) => {
          e.preventDefault();
          const w = inp.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          if (w.length < 3) { out.className = 'msg-line bad'; out.textContent = 'Muy corta.'; }
          else if (!w.includes(syl)) { out.className = 'msg-line bad'; out.textContent = `"${inp.value}" no tiene "${syl.toUpperCase()}".`; }
          else { out.className = 'msg-line good'; out.textContent = '¡Eso! En el juego, además, se revisa que exista en el diccionario.'; }
        },
      }, el('div', { class: 'word-input mine' }, inp, ghost, el('button', { class: 'btn primary send', type: 'submit', text: 'Probar' })), out);
      art.append(el('div', { class: 'scene', style: { display: 'grid', placeItems: 'center' } }, el('div', { class: 's-syl', style: { position: 'static', transform: 'none' }, text: syl.toUpperCase() })));
    }
    box.replaceChildren(...[
      el('div', { class: 'modal-head' }, el('h2', { text: step.title }), el('button', { class: 'btn icon ghost', type: 'button', text: '✕', 'aria-label': 'Cerrar tutorial', onclick: () => m.close() })),
      art, text, extra,
      el('div', { class: 'dots', 'aria-hidden': 'true' }, ...STEPS.map((_, k) => el('i', { class: k === i ? 'on' : '' }))),
      el('div', { class: 'row', style: { justifyContent: 'space-between' } },
        el('button', { class: 'btn ghost', type: 'button', text: '← Atrás', disabled: i === 0, onclick: () => { i -= 1; render(); } }),
        el('span', { class: 'small muted', text: `${i + 1} de ${STEPS.length}` }),
        i < STEPS.length - 1
          ? el('button', { class: 'btn primary', type: 'button', text: 'Siguiente →', onclick: () => { i += 1; render(); } })
          : el('button', { class: 'btn go', type: 'button', text: '¡A jugar!', onclick: () => m.close() })),
    ].filter(Boolean));
    if (step.scene) requestAnimationFrame(() => { cleanup = step.scene(art) || (() => {}); });
    (box.querySelector('form input') || box.querySelector('.btn.primary, .btn.go'))?.focus();
  }
  render();
  return m;
}

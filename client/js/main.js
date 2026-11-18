// Arranque y controlador: estado de la sala, pantallas (inicio, sala de espera, partida,
// resultados) y eventos del servidor.
import { el, toast, modal, setTheme, currentTheme, announce } from './ui.js';
import { t } from './i18n.js';
import { net } from './net.js';
import { audio } from './audio.js';
import { loadProfile, saveProfile, recordGame } from './profile.js';
import { mountHome } from './home.js';
import { mountLobby, rulesList } from './room.js';
import { mountGame } from './game.js';
import { showResults } from './results.js';
import { openTutorial, shouldShowTutorial } from './tutorial.js';

const app = document.getElementById('app');
const S = { room: null };
const profile = loadProfile();
let view = null;
let viewName = null;
let resultsModal = null;

const params = new URLSearchParams(location.search);
const pendingCode = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

// Alto real de la pantalla (con el teclado del celular abierto) para que la bomba no quede tapada.
function syncHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${h}px`);
  app.style.height = viewName === 'game' ? `${h}px` : '';
  // ¿teclado del celular abierto? (la pantalla visible se achica mucho)
  const kb = viewName === 'game' && window.innerWidth <= 980 && h < window.innerHeight * 0.78;
  document.body.classList.toggle('kb-open', kb);
  if (viewName === 'game') window.scrollTo(0, 0);
}
window.visualViewport?.addEventListener('resize', syncHeight);
window.addEventListener('resize', syncHeight);

// ---------------------------------------------------------------- barra superior
let dangerEl = null;
let clockEl = null;
let countdownEl = null;
function topbar({ home = false, game = false } = {}) {
  const r = S.room;
  const bar = el('header', { class: `topbar${game ? ' in-game' : ''}` });
  bar.append(el('div', { class: 'logo small', 'aria-label': 'wORTbomb' }, el('span', { class: 'w', text: 'w' }), el('span', { class: 'ort', text: 'ORT' }), el('span', { class: 'bomb-word', text: 'bomb' })));
  if (r && !home) {
    bar.append(el('button', {
      class: 'chip code-chip', type: 'button', title: t('copyLink'), 'aria-label': `Código ${r.code}. Copiar link`,
      onclick: async () => {
        const url = `${location.origin}/sala/${r.code}`;
        try {
          await navigator.clipboard.writeText(url);
          toast(`Link copiado: ${url}`);
        } catch {
          toast(`Pasá este link: ${url}`, { ms: 6000 });
        }
      },
    }, el('span', { class: 'hide-sm', text: 'Sala' }), el('b', { text: r.code }), '🔗'));
  }
  if (game) {
    clockEl = el('span', { class: 'chip', 'aria-label': 'Reloj de partida', text: '0:00' });
    dangerEl = el('span', { class: 'chip', 'aria-label': 'Nivel de peligro' }, el('span', { class: 'hide-sm', text: t('danger') }), el('span', { class: 'danger' }, ...Array.from({ length: 10 }, () => el('i'))));
    countdownEl = el('span', { class: 'chip countdown', role: 'timer', 'aria-label': 'Muerte súbita', hidden: true });
    bar.append(clockEl, dangerEl, countdownEl);
  }
  bar.append(el('span', { class: 'spacer' }));
  const soundBtn = el('button', { class: 'btn icon small', type: 'button', 'aria-label': 'Sonido', title: 'Sonido', text: audio.muted ? '🔇' : '🔊', onclick: () => openSound(soundBtn) });
  const toggleTheme = () => { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); themeBtn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙'; };
  const themeBtn = el('button', { class: 'btn icon small', type: 'button', 'aria-label': 'Cambiar tema claro/oscuro', title: 'Tema', text: currentTheme() === 'dark' ? '☀️' : '🌙', onclick: toggleTheme });
  const inRoom = r && !home;
  // En pantallas grandes, botones a la vista; en el celular, todo en un menú "⋯".
  const wide = el('div', { class: 'row hide-sm', style: { gap: '8px', flexWrap: 'nowrap' } },
    inRoom ? el('button', { class: 'btn small ghost', type: 'button', text: `📜 ${t('rules')}`, onclick: openRules }) : null,
    soundBtn, themeBtn,
    inRoom ? el('button', { class: 'btn small', type: 'button', text: t('leave'), onclick: leave }) : null);
  const more = el('button', {
    class: 'btn icon small show-sm', type: 'button', text: '⋯', 'aria-label': 'Menú',
    onclick: () => {
      const card = el('div', { class: 'card modal' },
        el('div', { class: 'modal-head' }, el('h2', { text: 'Menú' }), el('button', { class: 'btn icon ghost', type: 'button', text: '✕', 'aria-label': 'Cerrar', onclick: () => m.close() })),
        inRoom ? el('button', { class: 'btn', type: 'button', text: `🔗 Copiar link de la sala ${r.code}`, onclick: async () => {
          m.close();
          const url = `${location.origin}/sala/${r.code}`;
          try { await navigator.clipboard.writeText(url); toast(`Link copiado: ${url}`); } catch { toast(`Pasá este link: ${url}`, { ms: 6000 }); }
        } }) : null,
        inRoom ? el('button', { class: 'btn', type: 'button', text: `📜 ${t('rules')}`, onclick: () => { m.close(); openRules(); } }) : null,
        el('button', { class: 'btn', type: 'button', text: audio.muted ? '🔇 Sonido' : '🔊 Sonido', onclick: () => { m.close(); openSound(soundBtn); } }),
        el('button', { class: 'btn', type: 'button', text: currentTheme() === 'dark' ? '☀️ Modo claro' : '🌙 Modo oscuro', onclick: () => { toggleTheme(); m.close(); } }),
        S.room?.status === 'playing' ? null : el('button', { class: 'btn', type: 'button', text: '📖 Tutorial', onclick: () => { m.close(); openTutorial(); } }),
        inRoom ? el('button', { class: 'btn primary', type: 'button', text: t('leave'), onclick: () => { m.close(); leave(); } }) : null);
      const m = modal(card, { label: 'Menú' });
    },
  });
  bar.append(wide, more);
  return bar;
}
function setDanger(level, flash = false) {
  if (!dangerEl) return;
  const box = dangerEl.querySelector('.danger');
  [...box.children].forEach((i, k) => i.classList.toggle('on', k < level));
  dangerEl.setAttribute('aria-label', `Nivel de peligro ${level} de 10`);
  if (flash) {
    box.classList.remove('flash');
    void box.offsetWidth;
    box.classList.add('flash');
  }
}
/** Chip de muerte súbita: cuenta regresiva (el último minuto) o "MUERTE SÚBITA" cuando ya empezó. */
let lastCd = '';
function setCountdown(state) {
  if (!countdownEl) return;
  const key = state ? `${state.mode}:${state.text || ''}` : '';
  if (key === lastCd) return;
  lastCd = key;
  if (!state) {
    countdownEl.hidden = true;
    return;
  }
  countdownEl.hidden = false;
  countdownEl.className = `chip ${state.mode === 'sudden' ? 'sudden-chip' : 'countdown'}`;
  countdownEl.replaceChildren(state.mode === 'sudden' ? '💀 MUERTE SÚBITA' : '💀 ', state.mode === 'sudden' ? '' : el('span', { class: 'hide-sm', text: 'Muerte súbita en ' }), state.mode === 'sudden' ? '' : el('b', { text: state.text }));
}
function setClock(text) {
  if (clockEl) clockEl.textContent = `⏱️ ${text}`;
}

function openRules() {
  const card = el('div', { class: 'card modal' },
    el('div', { class: 'modal-head' }, el('h2', { text: t('rules') }), el('button', { class: 'btn icon ghost', type: 'button', text: '✕', 'aria-label': 'Cerrar', onclick: () => m.close() })),
    el('p', { class: 'hl-rule', text: '🚫 Ninguna palabra se puede repetir en toda la partida. 💣 La mecha se acorta con el tiempo y con cada vida perdida. 💀 Si dura mucho: muerte súbita.' }),
    rulesList(S.room?.settings),
    S.room?.status === 'playing' ? null : el('div', { class: 'row' }, el('button', { class: 'btn ghost', type: 'button', text: '📖 Ver tutorial', onclick: () => { m.close(); openTutorial(); } })));
  const m = modal(card, { label: t('rules') });
}
function openSound(btn) {
  const range = el('input', { type: 'range', min: 0, max: 100, value: Math.round(audio.volume * 100), 'aria-label': 'Volumen', oninput: (e) => audio.setVolume(e.target.value / 100) });
  const mute = el('input', { type: 'checkbox', checked: audio.muted, onchange: (e) => { audio.setMuted(e.target.checked); btn.textContent = e.target.checked ? '🔇' : '🔊'; } });
  const card = el('div', { class: 'card modal' },
    el('div', { class: 'modal-head' }, el('h2', { text: 'Sonido' }), el('button', { class: 'btn icon ghost', type: 'button', text: '✕', 'aria-label': 'Cerrar', onclick: () => m.close() })),
    el('label', { class: 'field' }, 'Volumen', range), el('label', { class: 'check' }, mute, 'Silenciar todo'),
    el('button', { class: 'btn', type: 'button', text: '🔔 Probar', onclick: () => { audio.ok(); setTimeout(() => audio.explode(), 300); } }));
  const m = modal(card, { label: 'Sonido' });
}

// ---------------------------------------------------------------- pantallas
window.__wb = { get S() { return S; } };
const ctx = {
  S, net, profile, toast, topbar, setDanger, setClock, setCountdown, pendingCode,
  saveProfile: () => saveProfile(profile),
  isDead: () => {
    const r = S.room;
    if (!r || r.status !== 'playing' || !r.game) return false;
    const seat = r.game.seats.find((s) => s.id === r.you);
    return !seat || !seat.alive;
  },
  actions: {
    async quick() {
      audio.unlock();
      const res = await net.call('room:quick', { profile });
      if (!res.ok) toast(res.error, { bad: true });
      return res.ok;
    },
    async create(opts) {
      audio.unlock();
      const res = await net.call('room:create', { ...opts, profile });
      if (!res.ok) toast(res.error, { bad: true });
      return res.ok;
    },
    async join(code, password = '') {
      audio.unlock();
      const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length < 4) {
        toast('Escribí el código de 5 letras.', { bad: true });
        return false;
      }
      const res = await net.call('room:join', { code: c, profile, password });
      if (res.needPassword) {
        const pw = window.prompt(res.error || 'Contraseña de la sala:');
        if (pw !== null) return ctx.actions.join(c, pw);
        return false;
      }
      if (!res.ok) toast(res.error, { bad: true });
      return res.ok;
    },
  },
};

function show(name) {
  const same = name === viewName;
  if (same && view) return;
  view?.unmount?.();
  viewName = name;
  if (name === 'home') view = mountHome(app, ctx);
  else if (name === 'lobby') view = mountLobby(app, ctx);
  else if (name === 'game') view = mountGame(app, ctx);
  syncHeight();
  window.scrollTo(0, 0);
}

function routeByStatus() {
  if (!S.room) return show('home');
  if (S.room.status === 'playing') {
    resultsModal?.close();
    resultsModal = null;
    return show('game');
  }
  return show('lobby');
}

async function leave() {
  if (S.room?.status === 'playing' && !ctx.isDead() && !window.confirm('¿Salir en plena partida? Vas a quedar eliminado.')) return;
  await net.call('room:leave');
  S.room = null;
  resultsModal?.close();
  history.replaceState(null, '', '/');
  show('home');
}

// ---------------------------------------------------------------- eventos del servidor
const socket = net.connect();
let wasConnected = false;
socket.on('connect', () => {
  if (wasConnected) toast('¡Conexión recuperada!');
  wasConnected = true;
  if (!S.room && pendingCode && profile.name && viewName === 'home') ctx.actions.join(pendingCode);
});
socket.on('disconnect', () => toast('Se cortó la conexión. Reintentando…', { bad: true }));

socket.on('room:state', (state) => {
  S.room = state;
  net.offset = Number.isFinite(state.serverNow) && !net.rtt ? state.serverNow - Date.now() : net.offset;
  history.replaceState(null, '', `/?sala=${state.code}`);
  const prev = viewName;
  view?.unmount?.();
  viewName = null;
  routeByStatus();
  if (prev && state.status === 'results' && state.game?.results && !resultsModal) resultsModal = showResults(ctx, state.game.results);
});
socket.on('room:members', ({ members, leaderId }) => {
  if (!S.room) return;
  S.room.members = members;
  S.room.leaderId = leaderId;
  view?.update?.('members');
});
socket.on('room:settings', (p) => {
  if (!S.room) return;
  Object.assign(S.room, { settings: p.settings, name: p.name, isPublic: p.isPublic, hasPassword: p.hasPassword, maxPlayers: p.maxPlayers, filterChat: p.filterChat });
  view?.update?.('settings');
});
socket.on('room:kicked', ({ reason }) => {
  S.room = null;
  resultsModal?.close();
  toast(reason, { bad: true, ms: 6000 });
  history.replaceState(null, '', '/');
  show('home');
});
socket.on('chat:message', (m) => {
  if (!S.room) return;
  const list = S.room.chat[m.channel] || (S.room.chat[m.channel] = []);
  list.push(m);
  if (list.length > 120) list.shift();
  view?.addChat?.(m);
});
socket.on('vote:update', ({ vote }) => {
  if (!S.room) return;
  S.room.votes = S.room.votes.filter((v) => v.id !== vote.id);
  if (!vote.closed) S.room.votes.push(vote);
  view?.update?.('votes');
});

socket.on('game:start', ({ game }) => {
  if (!S.room) return;
  S.room.game = game;
  S.room.status = 'playing';
  S.room.chat.dead = [];
  resultsModal?.close();
  resultsModal = null;
  view?.unmount?.();
  viewName = null;
  show('game');
  announce('¡Empezó la partida!');
});
socket.on('game:turn', ({ turn, reason, from, seats }) => {
  const g = S.room?.game;
  if (!g) return;
  g.turn = turn;
  g.level = turn.level;
  g.maxLevel = Math.max(g.maxLevel || 1, turn.level);
  for (const s of seats) Object.assign(g.seats.find((x) => x.id === s.id) || {}, s);
  view?.on?.('turn', { reason, from });
  if (turn.playerId === S.room.you) announce(`Te toca. Sílaba ${turn.syllable}`);
});
socket.on('game:typing', (d) => view?.on?.('typing', d));
socket.on('game:accept', (ev) => {
  const g = S.room?.game;
  if (!g) return;
  g.used.unshift(ev.entry);
  g.usedCount = (g.usedCount || 0) + 1;
  const seat = g.seats.find((s) => s.id === ev.playerId);
  if (seat) {
    seat.lives = ev.lives;
    seat.words = (seat.words || 0) + 1;
  }
  view?.on?.('accept', ev);
});
socket.on('game:reject', (ev) => view?.on?.('reject', ev));
socket.on('game:explode', (ev) => {
  const seat = S.room?.game?.seats.find((s) => s.id === ev.playerId);
  if (seat) seat.lives = ev.lives;
  view?.on?.('explode', ev);
});
socket.on('game:eliminated', (ev) => {
  const seat = S.room?.game?.seats.find((s) => s.id === ev.playerId);
  if (seat) {
    seat.alive = false;
    seat.place = ev.place;
  }
  view?.on?.('eliminated', ev);
  if (ev.playerId === S.room?.you) announce('Quedaste eliminado.');
});
socket.on('game:announce', (ev) => view?.on?.('announce', ev));
socket.on('game:countdown', ({ suddenAt }) => {
  const g = S.room?.game;
  if (!g) return;
  g.suddenAt = suddenAt;
  view?.on?.('countdown');
});
socket.on('game:sudden', ({ seats }) => {
  const g = S.room?.game;
  if (!g) return;
  g.sudden = true;
  for (const s of seats) Object.assign(g.seats.find((x) => x.id === s.id) || {}, s);
  view?.on?.('sudden');
});
socket.on('game:end', ({ results }) => {
  const r = S.room;
  if (!r?.game) return;
  r.game.state = 'ended';
  r.game.results = results;
  r.game.turn = null;
  r.status = 'results';
  view?.on?.('end', results);
  const mine = results.ranking.find((p) => p.id === r.you);
  if (mine) recordGame({ won: results.winner?.id === r.you, words: mine.stats.words, longest: mine.stats.longest });
  setTimeout(() => {
    if (S.room?.status !== 'results') return;
    view?.unmount?.();
    viewName = null;
    show('lobby');
    resultsModal = showResults(ctx, results);
  }, 1900);
});

// ---------------------------------------------------------------- inicio
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
document.addEventListener('keydown', () => audio.unlock(), { once: true });
show('home');
if (shouldShowTutorial()) setTimeout(() => openTutorial(), 400);

// Pantalla de partida. El cliente NO decide nada: manda lo que escribís y dibuja lo que dice el
// servidor. La mecha se anima con la hora del servidor (net.serverNow) y el vencimiento del turno.
import { el, toast, highlight, fmtTime, modal, announce, setToastSink } from './ui.js';
import { t } from './i18n.js';
import { audio } from './audio.js';
import { createArena } from './arena.js';
import { createSidePanel } from './panels.js';
import { avatarSVG } from './avatar.js';

export function mountGame(app, ctx) {
  const { S, net } = ctx;
  const root = el('div', { class: 'game' });
  const body = el('div', { class: 'game-body' });
  const stage = el('div', { class: 'stage' });
  const arenaHost = el('div', { style: { minHeight: 0, display: 'grid' } });
  const arena = createArena(arenaHost);
  const embers = el('div', { class: 'embers', 'aria-hidden': 'true', hidden: true });
  for (let i = 0; i < 26; i += 1) {
    const e = el('i');
    e.style.left = `${Math.random() * 100}%`;
    e.style.animationDuration = `${2.4 + Math.random() * 2.6}s`;
    e.style.animationDelay = `${-Math.random() * 4}s`;
    e.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
    embers.append(e);
  }
  arena.el.prepend(embers);
  /** Rojo y picante: muerte súbita. */
  function setSudden(on) {
    document.body.classList.toggle('sudden', on);
    embers.hidden = !on;
  }

  // ---- entrada
  const input = el('input', {
    type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send',
    maxlength: 40, placeholder: t('inputPh'), 'aria-label': 'Tu palabra',
  });
  const ghost = el('div', { class: 'ghost', 'aria-hidden': 'true' });
  const sendBtn = el('button', { class: 'btn primary send', type: 'submit', text: t('send'), onpointerdown: (e) => e.preventDefault() });
  // Cuando no es tu turno, acá se ve GRANDE lo que está escribiendo el que tiene la bomba.
  const others = el('div', { class: 'others', 'aria-live': 'off' });
  const wordBox = el('div', { class: 'word-input' }, input, ghost, others, sendBtn);
  function showOthers(name, text, syllable) {
    others.replaceChildren();
    if (!text) {
      wordBox.classList.remove('watching');
      return;
    }
    others.append(el('span', { class: 'who', text: `${name}:` }), el('span', { class: 'txt' }, highlight(text, syllable)));
    wordBox.classList.add('watching');
  }
  const msg = el('div', { class: 'msg-line', role: 'status', 'aria-live': 'polite' });
  const reportBtn = el('button', { class: 'report-link', type: 'button', text: t('report'), onclick: () => openReport(ctx) });
  const form = el('form', { class: 'dock', onsubmit: submit }, wordBox, msg, el('div', { style: { textAlign: 'center' } }, reportBtn));
  stage.append(arenaHost, form);

  const side = createSidePanel(ctx, { tabs: ['chat', 'words'], className: 'side side-game' });
  const spectators = el('div', { class: 'spectators' });
  side.el.append(spectators);
  body.append(stage, side.el);
  root.append(ctx.topbar({ game: true }), body);
  app.replaceChildren(root);

  const g = () => S.room.game;
  const me = () => S.room.you;
  const mySeat = () => g()?.seats.find((s) => s.id === me());
  const myTurn = () => g()?.turn?.playerId === me() && g()?.state === 'playing';
  let lastTyped = 0;
  let typedTimer = null;
  let lastTick = 0;
  let lastBeat = 0;
  let lastCountdownSec = null;
  let raf = 0;
  let pendingBomb = null;

  // ---- dibujo
  function seatsData() {
    return g().seats.map((s) => ({ ...s, connected: S.room.members.find((m) => m.id === s.id)?.connected !== false && s.connected !== false }));
  }
  function renderSeats() {
    arena.render(seatsData(), { meId: me(), activeId: g().turn?.playerId, lives: g().settings.startLives });
  }
  function placeBomb(animate) {
    const turn = g().turn;
    if (!turn) {
      arena.bomb.hide();
      return;
    }
    arena.bomb.light(true);
    arena.placeBomb(turn.playerId, { animate });
  }
  function renderSpectators() {
    const seated = new Set(g().seats.filter((s) => s.alive).map((s) => s.id));
    const list = S.room.members.filter((m) => !seated.has(m.id));
    spectators.replaceChildren(list.length ? el('span', {}, '👀 Tribuna: ', ...list.flatMap((m, i) => [i ? ', ' : '', avatarSVG(m.avatar, { size: 22 }), ` ${m.name}`])) : '');
    spectators.hidden = !list.length;
  }
  function renderTurnInfo() {
    showOthers('', '');
    const turn = g().turn;
    const seat = mySeat();
    arena.setSyllable(turn ? turn.syllable : '', { animate: true });
    const active = g().seats.find((s) => s.id === turn?.playerId);
    arena.setWhose(turn ? (myTurn() ? '¡Te toca!' : t('theirTurn', { name: active?.name || '' })) : '');
    arena.setLive('', turn?.syllable);
    ctx.setDanger(turn?.level ?? g().level);
    const can = myTurn();
    input.value = '';
    drawGhost();
    // Los que juegan tienen el campo siempre listo (en el celular el teclado no se cierra entre
    // turnos); fuera de tu turno lo que tecleás se ignora. Eliminados y espectadores no escriben.
    const playing = Boolean(seat && seat.alive && g().state === 'playing');
    input.disabled = !playing;
    sendBtn.disabled = !can;
    input.placeholder = can ? `escribí una palabra con "${turn.syllable}"…` : playing ? 'esperá tu turno…' : '';
    wordBox.classList.toggle('mine', can);
    if (!seat) msg.textContent = t('spectating');
    else if (!seat.alive) msg.textContent = t('eliminated');
    else if (can) {
      msg.className = 'msg-line';
      msg.replaceChildren(`${t('yourTurn')} `, el('mark', { text: turn.syllable.toUpperCase(), style: { background: 'var(--spark)', borderRadius: '6px', padding: '0 4px' } }));
      focusInput();
    } else {
      msg.className = 'msg-line';
      msg.textContent = '';
    }
  }

  /** Cuando te toca, el cursor ya está en el campo: no hay que tocar nada para escribir. */
  function focusInput() {
    if (input.disabled) return;
    if (document.activeElement !== input) input.focus({ preventScroll: true });
  }
  // En la compu: si te toca y tocás una letra estando en otro lado (que no sea el chat), va a la palabra.
  const onKey = (e) => {
    if (!myTurn() || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    const a = document.activeElement;
    if (a === input) return;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable) && !a.closest('.chat-form')) return;
    if (document.querySelector('.overlay')) return;
    input.focus({ preventScroll: true });
  };
  document.addEventListener('keydown', onKey, true);

  function drawGhost() {
    ghost.replaceChildren(highlight(input.value, g()?.turn?.syllable));
  }

  // ---- bucle de animación: mecha, reloj y tic-tac (todo con la hora del servidor)
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const game = g();
    if (!game) return;
    // En pausa todo queda congelado en el instante en que se pausó.
    const sn = game.paused && game.pausedAt ? game.pausedAt : net.serverNow();
    if (game.startedAt) ctx.setClock(fmtTime((game.state === 'playing' ? sn : (game.results ? game.startedAt + game.results.durationMs : sn)) - game.startedAt));
    // Cuenta regresiva de la muerte súbita (el último minuto) y chip fijo cuando ya empezó.
    if (game.state === 'playing' && game.sudden) ctx.setCountdown({ mode: 'sudden' });
    else if (game.state === 'playing' && game.suddenAt) {
      const left = game.suddenAt - sn;
      if (left <= (game.countdownMs || 60000) && left > 0) {
        ctx.setCountdown({ mode: 'countdown', text: fmtTime(left + 999) });
        const sec = Math.ceil(left / 1000);
        if (sec !== lastCountdownSec && sec <= 10) audio.countdownTick();
        lastCountdownSec = sec;
      } else ctx.setCountdown(null);
    } else ctx.setCountdown(null);
    if (game.sudden && game.state === 'playing' && now - lastBeat > 900) {
      lastBeat = now;
      audio.heartbeat();
    }
    const turn = game.turn;
    if (!turn || game.state !== 'playing') return;
    const remaining = turn.deadline - sn;
    const f = Math.max(0, remaining / turn.duration);
    arena.bomb.setBurn(f, turn.level, now);
    arena.setFuse(f);
    arena.setClock(remaining > 0 ? `${(remaining / 1000).toFixed(1)} s` : '💥');
    const interval = Math.max(140, Math.min(900, remaining / 7)) * (1 - (turn.level - 1) * 0.03);
    if (remaining > 0 && now - lastTick > interval) {
      lastTick = now;
      audio.tick(f < 0.3);
      if (f < 0.6) audio.fuse();
    }
  }
  raf = requestAnimationFrame(frame);

  // ---- envío y escritura en vivo
  async function submit(e) {
    e.preventDefault();
    if (!myTurn()) return;
    const text = input.value.trim();
    if (!text) return;
    const res = await net.call('game:submit', { text });
    if (res.ok) {
      wordBox.classList.add('okflash');
      setTimeout(() => wordBox.classList.remove('okflash'), 300);
    } else if (['late', 'rate', 'burst', 'paused'].includes(res.reason)) {
      showError(res.message || 'No se pudo enviar.');
    }
  }
  input.addEventListener('input', () => {
    if (!myTurn()) {
      // fuera de turno no se escribe (el campo queda enfocado para no cerrar el teclado del celular)
      input.value = '';
      drawGhost();
      return;
    }
    drawGhost();
    const send = () => {
      lastTyped = performance.now();
      net.socket.emit('game:typing', { text: input.value });
    };
    clearTimeout(typedTimer);
    if (performance.now() - lastTyped > 80) send();
    else typedTimer = setTimeout(send, 80);
  });
  function showError(text) {
    msg.className = 'msg-line bad';
    msg.textContent = text;
    wordBox.classList.remove('shake');
    void wordBox.offsetWidth;
    wordBox.classList.add('shake');
    audio.error();
    announce(text);
  }

  // ---- eventos del servidor
  const handlers = {
    turn({ reason, from }) {
      renderSeats();
      const animate = reason === 'pass' || reason === 'skip';
      if (reason === 'sudden') {
        renderSeats();
        placeBomb(false);
        renderTurnInfo();
        return;
      }
      if (reason === 'explode') {
        // la bomba nueva aparece después de la explosión, volando desde el que explotó
        clearTimeout(pendingBomb);
        pendingBomb = setTimeout(() => {
          const p = from ? arena.seatPos(from) : null;
          if (p) arena.bomb.moveTo(p.x, p.y, { animate: false });
          placeBomb(true);
        }, 550);
      } else {
        placeBomb(animate);
        if (animate) audio.pass();
      }
      renderTurnInfo();
      renderSpectators();
    },
    typing({ playerId, text }) {
      const syl = g().turn?.syllable;
      if (playerId === me()) return;
      arena.setLive(text, syl);
      const who = g().seats.find((s) => s.id === playerId);
      showOthers(who?.name || '', text, syl);
    },
    accept(ev) {
      arena.showAccepted(ev.playerId, ev.word, ev.syllable);
      audio.ok();
      side.renderWords(ev.word);
      side.bumpWords();
      if (ev.playerId === me()) {
        msg.className = 'msg-line good';
        msg.textContent = `¡Bien! "${ev.word}" ✓`;
      }
    },
    reject(ev) {
      if (ev.playerId !== me()) showOthers(g().seats.find((s) => s.id === ev.playerId)?.name || '', `✗ ${ev.word}`, g().turn?.syllable);
      if (ev.playerId === me()) showError(ev.message);
      else arena.setLive(`✗ ${ev.word}`, g().turn?.syllable, 'bad');
    },
    explode(ev) {
      arena.bomb.hide();
      arena.bomb.light(false);
      arena.explode(ev.playerId);
      arena.loseLife(ev.playerId, ev.lives);
      audio.explode();
      if (ev.playerId === me()) {
        msg.className = 'msg-line bad';
        msg.textContent = ev.lives > 0 ? `💥 ¡Te explotó! Te ${ev.lives === 1 ? 'queda 1 vida' : `quedan ${ev.lives} vidas`}.` : '💥 ¡Te explotó!';
        if (navigator.vibrate) navigator.vibrate([80, 40, 160]);
      }
    },
    eliminated(ev) {
      setTimeout(() => {
        renderSeats();
        renderSpectators();
      }, 700);
      if (ev.playerId === me()) {
        msg.className = 'msg-line bad';
        msg.textContent = t('eliminated');
        input.disabled = true;
        sendBtn.disabled = true;
        side.renderChat();
      }
    },
    announce(ev) {
      ctx.setDanger(ev.level, true);
      toast(`🔥 ${ev.text}`);
    },
    paused({ away }) {
      showPause(away);
    },
    resumed() {
      hidePause();
      renderTurnInfo();
      toast('▶ ¡Están todos! Sigue la partida.');
    },
    countdown() {
      toast('⏳ ¡En 1 minuto empieza la MUERTE SÚBITA!');
    },
    sudden() {
      setSudden(true);
      renderSeats();
      ctx.setDanger(10, true);
      audio.alarm();
      const flash = el('div', { class: 'sudden-flash', 'aria-hidden': 'true' }, el('b', {}, '¡MUERTE SÚBITA!', el('small', { text: 'Todos con 1 vida · la bomba va el doble de rápido' })));
      document.body.append(flash);
      setTimeout(() => flash.remove(), 1900);
      announce('¡Muerte súbita! Todos quedan con una vida y la bomba va mucho más rápido.');
      if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
    },
    end() {
      ctx.setCountdown(null);
      arena.bomb.hide();
      input.disabled = true;
      sendBtn.disabled = true;
      arena.setWhose('');
      arena.setSyllable('');
      arena.setClock('');
      renderSeats();
    },
    members() {
      renderSeats();
      renderSpectators();
    },
  };

  // Avisos en la línea de mensajes (no tapan la ronda). Si te toca, no pisan la indicación del turno.
  let noticeTimer = 0;
  setToastSink((text, { bad, ms }) => {
    if (myTurn() && !bad) return;
    clearTimeout(noticeTimer);
    msg.className = `msg-line ${bad ? 'bad' : 'info'}`;
    msg.textContent = text;
    noticeTimer = setTimeout(() => {
      if (msg.textContent === text) msg.textContent = '';
    }, ms);
  });

  // ---- pausa: alguien que juega no está mirando la pestaña
  const pauseBox = el('div', { class: 'pause-box', role: 'alertdialog', 'aria-live': 'assertive', hidden: true });
  arena.el.append(pauseBox);
  function showPause(away = []) {
    const leader = S.room.leaderId === me();
    const imAway = away.some((a) => a.id === me());
    pauseBox.hidden = false;
    pauseBox.replaceChildren(
      el('div', { class: 'pause-card' },
        el('b', { class: 'pause-title', text: '⏸ ¡Pausa!' }),
        el('p', { class: 'pause-text', text: 'No están todos en la web. La partida sigue cuando vuelvan todos a la pestaña.' }),
        el('ul', { class: 'pause-list' }, ...away.map((a) => el('li', {}, a.offline ? '📡 ' : '👀 ', el('b', { text: a.id === me() ? 'Vos' : a.name }), a.offline ? ' se desconectó' : ' no está mirando',
          leader && a.id !== me() ? el('button', { class: 'btn small ghost', type: 'button', text: 'Expulsar', onclick: async () => {
            if (!window.confirm(`¿Expulsar a ${a.name}?`)) return;
            const res = await ctx.net.call('room:kick', { playerId: a.id });
            if (!res.ok) toast(res.error, { bad: true });
          } }) : null))),
        imAway ? el('p', { class: 'small', text: 'Tocá acá o volvé a esta pestaña para seguir.' }) : null));
    arena.bomb.el.classList.add('frozen');
  }
  function hidePause() {
    pauseBox.hidden = true;
    arena.bomb.el.classList.remove('frozen');
  }

  // primer dibujo (al entrar o reconectar en plena partida)
  setSudden(Boolean(g().sudden && g().state === 'playing'));
  if (g().paused) showPause(S.room.away || []);
  requestAnimationFrame(() => {
    renderSeats();
    placeBomb(false);
    renderTurnInfo();
    renderSpectators();
    side.renderChat();
    side.renderWords();
  });
  const onResize = () => {
    renderSeats();
    placeBomb(false);
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  return {
    on(event, data) {
      handlers[event]?.(data);
    },
    update(what) {
      if (what === 'members') handlers.members();
      if (what === 'chat') side.renderChat();
    },
    addChat: (m) => side.addChat(m),
    unmount() {
      cancelAnimationFrame(raf);
      clearTimeout(pendingBomb);
      clearTimeout(noticeTimer);
      setToastSink(null);
      setSudden(false);
      ctx.setCountdown(null);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    },
  };
}

function openReport(ctx) {
  const word = el('input', { class: 'input', maxlength: 40, placeholder: 'La palabra que falta', autofocus: true });
  const note = el('input', { class: 'input', maxlength: 120, placeholder: 'Comentario (opcional): de dónde es, qué significa…' });
  const send = el('button', { class: 'btn primary', type: 'submit', text: 'Enviar reporte' });
  const form = el('form', {
    class: 'card modal',
    onsubmit: async (e) => {
      e.preventDefault();
      send.disabled = true;
      const res = await ctx.net.call('report:word', { word: word.value, note: note.value });
      send.disabled = false;
      if (res.ok) {
        toast('¡Gracias! Lo revisamos. (La palabra no se habilita sola.)');
        m.close();
      } else toast(res.error, { bad: true });
    },
  }, el('div', { class: 'modal-head' }, el('h2', { text: 'Reportar palabra que falta' }), el('button', { class: 'btn icon ghost', type: 'button', text: '✕', 'aria-label': 'Cerrar', onclick: () => m.close() })),
  el('p', { class: 'muted', text: 'Si una palabra existe y el juego no la aceptó, avisanos. Queda guardada para que la revise un administrador.' }),
  word, note, send);
  const m = modal(form, { label: 'Reportar palabra' });
}

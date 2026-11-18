// Capa Socket.IO: sesiones por token, límites de tasa y traducción eventos ↔ salas.
// Ver la tabla completa de eventos en el README.

import crypto from 'node:crypto';
import { RATE, ROOM_LIMITS } from '../engine/constants.js';
import { normalizeWord } from '../engine/normalize.js';
import { RateLimiter, BurstGuard, cleanName, cleanAvatar, cleanText } from './moderation.js';

const roomChannel = (code) => `r:${code}`;
const memberChannel = (code, id) => `m:${code}:${id}`;

export function attachSockets(io, { manager, reports, log, dict, rates = {} }) {
  const R = { ...RATE, ...rates };
  const sessions = new Map(); // token → { code, memberId }
  const limits = {
    submit: new RateLimiter(R.submitsPerSecond, 1000),
    typing: new RateLimiter(R.typingPerSecond, 1000),
    chat: new RateLimiter(R.chatPer5s, 5000),
    rooms: new RateLimiter(R.roomsPerIpPerMinute, 60000),
    reports: new RateLimiter(R.reportsPerMinute, 60000),
    any: new RateLimiter(60, 1000),
  };
  const burst = new BurstGuard(R.sameTextBurst, 2000);
  setInterval(() => Object.values(limits).forEach((l) => l.sweep()), 60000).unref?.();

  // Las salas mandan por acá: a todos, a un miembro, o al canal de eliminados/espectadores.
  manager.deps.emit = (code, target, event, data) => {
    if (target === 'all') io.to(roomChannel(code)).emit(event, data);
    else if (target === 'dead') {
      const room = manager.get(code);
      if (!room) return;
      for (const m of room.members.values()) if (room.isDead(m.id) || room.status !== 'playing') io.to(memberChannel(code, m.id)).emit(event, data);
    } else io.to(memberChannel(code, target)).emit(event, data);
  };
  manager.deps.onKicked = (code, member) => {
    sessions.delete(member.token);
    io.in(memberChannel(code, member.id)).socketsLeave([roomChannel(code), memberChannel(code, member.id)]);
    for (const s of io.sockets.sockets.values()) if (s.data.token === member.token) s.data.code = null;
  };
  manager.deps.onClosed = (code) => {
    for (const [t, s] of sessions) if (s.code === code) sessions.delete(t);
  };

  const socketsOf = (code, id) => io.sockets.adapter.rooms.get(memberChannel(code, id))?.size || 0;

  function attach(socket, room, member) {
    sessions.set(member.token, { code: room.code, memberId: member.id });
    socket.data.code = room.code;
    socket.data.memberId = member.id;
    socket.join([roomChannel(room.code), memberChannel(room.code, member.id)]);
    socket.emit('room:state', room.stateFor(member.id));
  }

  function detach(socket) {
    const { code, memberId } = socket.data;
    if (!code) return;
    socket.leave(roomChannel(code));
    socket.leave(memberChannel(code, memberId));
    socket.data.code = null;
    socket.data.memberId = null;
  }

  io.use((socket, next) => {
    const fwd = String(socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim();
    socket.data.ip = fwd || socket.handshake.address || '';
    next();
  });

  io.on('connection', (socket) => {
    // ---- sesión: el token vive en el navegador. Si ese token ya está jugando en otra pestaña,
    // esta pestaña recibe uno nuevo (así se puede probar con varias pestañas del mismo navegador).
    let token = typeof socket.handshake.auth?.token === 'string' && /^[a-f0-9-]{20,64}$/.test(socket.handshake.auth.token) ? socket.handshake.auth.token : null;
    let fresh = false;
    if (token) {
      const s = sessions.get(token);
      if (s && socketsOf(s.code, s.memberId) > 0) {
        token = null;
        fresh = true;
      }
    }
    if (!token) token = crypto.randomUUID();
    socket.data.token = token;
    socket.emit('session', { token, fresh });

    // ¿Volvía a una sala? (recarga de página o corte de conexión)
    const prev = sessions.get(token);
    if (prev) {
      const room = manager.get(prev.code);
      const m = room?.member(prev.memberId);
      if (room && m) {
        attach(socket, room, m);
        room.setConnected(m.id, true);
      } else sessions.delete(token);
    }

    const ctx = () => {
      const room = socket.data.code ? manager.get(socket.data.code) : null;
      return { room, id: socket.data.memberId };
    };
    const guard = (fn) => (...args) => {
      const ack = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
      if (!limits.any.allow(socket.id)) return ack({ ok: false, error: 'Demasiados mensajes, despacio.' });
      try {
        const out = fn(args[0] && typeof args[0] === 'object' ? args[0] : {});
        ack(out ?? { ok: true });
      } catch (err) {
        log.error('[socket]', err);
        ack({ ok: false, error: 'Error del servidor.' });
      }
      return undefined;
    };

    // ---- reloj: el cliente estima la diferencia con el servidor para animar la mecha
    socket.on('time:sync', (_p, ack) => typeof ack === 'function' && ack({ server: Date.now() }));

    socket.on('lobby:list', guard(() => ({ ok: true, rooms: manager.list() })));

    function enter(room, { profile, password }) {
      const res = room.join({ name: profile?.name, avatar: profile?.avatar, password, token, ip: socket.data.ip });
      if (!res.ok) return res;
      detachFromOld();
      attach(socket, room, res.member);
      return { ok: true, code: room.code };
    }
    function detachFromOld() {
      const { room, id } = ctx();
      if (room && id) {
        room.leave(id);
        detach(socket);
      }
      sessions.delete(token);
    }

    socket.on('room:create', guard(({ name, isPublic, password, maxPlayers, profile }) => {
      if (!limits.rooms.allow(socket.data.ip || socket.id)) return { ok: false, error: 'Creaste muchas salas seguidas. Esperá un minuto.' };
      if (!cleanName(profile?.name)) return { ok: false, error: 'Elegí otro apodo (1 a 16 caracteres, sin insultos).' };
      const res = manager.create({ name: name || `Sala de ${cleanName(profile.name)}`, isPublic: isPublic !== false, password, maxPlayers });
      if (!res.ok) return res;
      return enter(res.room, { profile, password });
    }));

    socket.on('room:join', guard(({ code, password, profile }) => {
      const room = manager.get(code);
      if (!room) return { ok: false, error: 'No existe esa sala. Revisá el código.' };
      if (room.code === socket.data.code) return { ok: true, code: room.code };
      return enter(room, { profile, password });
    }));

    socket.on('room:quick', guard(({ profile }) => {
      if (!cleanName(profile?.name)) return { ok: false, error: 'Elegí otro apodo (1 a 16 caracteres, sin insultos).' };
      if (!limits.rooms.allow(socket.data.ip || socket.id)) return { ok: false, error: 'Esperá un minuto.' };
      const res = manager.quick();
      if (!res.ok) return res;
      return enter(res.room, { profile });
    }));

    socket.on('room:leave', guard(() => {
      detachFromOld();
      return { ok: true };
    }));

    const inRoom = (fn) => guard((p) => {
      const { room, id } = ctx();
      if (!room || !room.member(id)) return { ok: false, error: 'No estás en una sala.' };
      return fn(room, id, p);
    });

    socket.on('room:ready', inRoom((room, id, { ready }) => room.setReady(id, ready)));
    socket.on('room:settings', inRoom((room, id, p) => room.updateSettings(id, p)));
    socket.on('room:kick', inRoom((room, id, { playerId }) => room.kick(id, String(playerId))));
    socket.on('room:start', inRoom((room, id) => room.start(id)));
    socket.on('profile:update', inRoom((room, id, p) => room.updateProfile(id, { name: p.name, avatar: p.avatar ? cleanAvatar(p.avatar) : undefined })));
    socket.on('vote:kick', inRoom((room, id, { playerId }) => room.startVote(id, String(playerId))));
    socket.on('vote:cast', inRoom((room, id, { voteId, yes }) => room.castVote(id, String(voteId), Boolean(yes))));

    socket.on('game:submit', inRoom((room, id, { text }) => {
      const t = typeof text === 'string' ? text.slice(0, ROOM_LIMITS.wordMax) : '';
      if (!limits.submit.allow(socket.id)) return { ok: false, reason: 'rate', message: 'Más despacio.' };
      if (!burst.allow(`s:${socket.id}`, normalizeWord(t))) return { ok: false, reason: 'burst', message: 'Ya mandaste eso.' };
      return room.submit(id, t);
    }));

    socket.on('game:typing', (p) => {
      const { room, id } = ctx();
      if (!room || !limits.typing.allow(socket.id)) return;
      room.typing(id, p?.text);
    });

    socket.on('chat:send', inRoom((room, id, { text }) => {
      const t = cleanText(text, ROOM_LIMITS.chatMax);
      if (!limits.chat.allow(socket.id)) return { ok: false, error: 'Más despacio con el chat.' };
      if (!burst.allow(`c:${socket.id}`, t)) return { ok: false, error: 'Ya mandaste eso.' };
      return room.chatFrom(id, t);
    }));

    // Reportar palabra que falta: se guarda para revisión; NO la habilita.
    socket.on('report:word', guard(({ word, note }) => {
      if (!limits.reports.allow(socket.data.ip || socket.id)) return { ok: false, error: 'Mandaste muchos reportes. Gracias, igual.' };
      const w = normalizeWord(typeof word === 'string' ? word.slice(0, ROOM_LIMITS.wordMax) : '');
      if (!/^[a-zñ]{2,40}$/.test(w)) return { ok: false, error: 'Escribí una sola palabra, solo letras.' };
      if (dict.has(w)) return { ok: false, error: `"${w}" ya está en el diccionario.` };
      const { room, id } = ctx();
      const m = room?.member(id);
      reports.add({ word: w, note: cleanText(note, 120), player: m?.name || null, room: room?.code || null, at: new Date().toISOString() });
      return { ok: true };
    }));

    socket.on('disconnect', () => {
      const { room, id } = ctx();
      if (room && id && socketsOf(room.code, id) === 0) room.setConnected(id, false);
    });
  });

  return { sessions };
}

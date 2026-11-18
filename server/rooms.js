// Salas: sala de espera, ajustes, líder, partida, chat por canal, votaciones y temporizadores.
// La sala no conoce Socket.IO: manda todo por deps.emit(code, destino, evento, datos), donde
// destino es 'all', 'dead' (eliminados y espectadores) o el id de un miembro.

import crypto from 'node:crypto';
import { Game } from '../engine/game.js';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS, ROOM_LIMITS, TIMING } from '../engine/constants.js';
import { cleanText, cleanName, cleanAvatar, filterChat } from './moderation.js';
import { cleanTyping } from '../engine/game.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const cleanCode = (v) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '');

const clampInt = (v, [lo, hi], def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

export function cleanSettings(patch = {}, base = DEFAULT_SETTINGS) {
  const s = { ...base };
  for (const [k, range] of Object.entries(SETTINGS_LIMITS)) if (patch[k] !== undefined) s[k] = clampInt(patch[k], range, base[k]);
  if (s.fuseMin >= s.fuseInitial) s.fuseMin = Math.max(SETTINGS_LIMITS.fuseMin[0], s.fuseInitial - 1);
  return s;
}

export class Room {
  constructor({ code, name, isPublic = true, password = '', maxPlayers = ROOM_LIMITS.defaultMaxPlayers }, deps) {
    this.code = code;
    this.name = cleanText(name, ROOM_LIMITS.roomNameMax) || 'Sala wORTbomb';
    this.isPublic = Boolean(isPublic);
    this.password = cleanText(password, ROOM_LIMITS.passwordMax);
    this.maxPlayers = clampInt(maxPlayers, [ROOM_LIMITS.minPlayers, ROOM_LIMITS.maxPlayers], ROOM_LIMITS.defaultMaxPlayers);
    this.deps = deps;
    this.members = new Map();
    this.leaderId = null;
    this.status = 'lobby'; // lobby | playing | results
    this.settings = { ...DEFAULT_SETTINGS };
    this.filterChat = true;
    this.game = null;
    this.chat = { main: [], dead: [] };
    this.votes = new Map();
    this.banned = new Set();
    this.timers = { turn: null, grace: new Map(), drop: new Map(), results: null, clock: [] };
    this.createdAt = deps.now();
    this.lastActivity = deps.now();
    this.offTurnAttempts = 0;
    this.seq = 0;
  }

  // ---------------------------------------------------------------- utilidades
  now() {
    return this.deps.now();
  }

  emit(target, event, data) {
    this.deps.emit(this.code, target, event, data);
  }

  touch() {
    this.lastActivity = this.now();
  }

  member(id) {
    return this.members.get(id) || null;
  }

  get connectedCount() {
    return [...this.members.values()].filter((m) => m.connected).length;
  }

  /** ¿Este miembro está "muerto" para el chat? (eliminado o espectador durante una partida) */
  isDead(id) {
    if (this.status !== 'playing' || !this.game) return false;
    const seat = this.game.seat(id);
    return !seat || !seat.alive;
  }

  memberView(m) {
    const seat = this.game?.seat(m.id);
    return {
      id: m.id, name: m.name, avatar: m.avatar, ready: m.ready, connected: m.connected, leader: m.id === this.leaderId,
      playing: Boolean(seat), alive: seat ? seat.alive : false, joinedAt: m.joinedAt,
    };
  }

  members_() {
    return [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((m) => this.memberView(m));
  }

  summary() {
    return {
      code: this.code, name: this.name, players: this.members.size, max: this.maxPlayers, status: this.status,
      hasPassword: Boolean(this.password), leader: this.member(this.leaderId)?.name || '',
    };
  }

  /** Estado completo para un miembro (al entrar o reconectar). */
  stateFor(id) {
    const dead = this.isDead(id);
    return {
      code: this.code, name: this.name, isPublic: this.isPublic, hasPassword: Boolean(this.password), maxPlayers: this.maxPlayers,
      status: this.status, leaderId: this.leaderId, you: id, settings: this.settings, filterChat: this.filterChat,
      members: this.members_(), game: this.game ? this.game.snapshot() : null,
      chat: { main: this.chat.main, dead: dead || this.status !== 'playing' ? this.chat.dead : [] },
      votes: [...this.votes.values()].map((v) => this.voteView(v)), serverNow: this.now(),
    };
  }

  broadcastMembers() {
    this.emit('all', 'room:members', { members: this.members_(), leaderId: this.leaderId });
  }

  // ---------------------------------------------------------------- miembros
  /** @returns {{ ok: true, member } | { ok: false, error }} */
  join({ name, avatar, password = '', token, ip = '' }) {
    if (this.banned.has(token)) return { ok: false, error: 'Te expulsaron de esta sala.' };
    if (this.password && cleanText(password, ROOM_LIMITS.passwordMax) !== this.password) return { ok: false, error: password ? 'Contraseña incorrecta.' : 'Esta sala tiene contraseña.', needPassword: true };
    if (this.members.size >= this.maxPlayers + 6) return { ok: false, error: 'La sala está llena.' };
    const nick = cleanName(name);
    if (!nick) return { ok: false, error: 'Elegí otro apodo (1 a 16 caracteres, sin insultos).' };
    let finalName = nick;
    const taken = new Set([...this.members.values()].map((m) => m.name.toLowerCase()));
    for (let i = 2; taken.has(finalName.toLowerCase()); i += 1) finalName = `${nick.slice(0, ROOM_LIMITS.nameMax - 2)} ${i}`;
    const m = {
      id: `m${++this.seq}${crypto.randomBytes(2).toString('hex')}`, token, name: finalName, avatar: cleanAvatar(avatar),
      ready: false, connected: true, joinedAt: this.now(), ip, offTurn: 0,
    };
    this.members.set(m.id, m);
    if (!this.leaderId) this.leaderId = m.id;
    this.touch();
    const late = this.status === 'playing';
    this.system(late ? `${m.name} entró como espectador: juega desde la próxima partida.` : `${m.name} entró a la sala.`);
    this.broadcastMembers();
    return { ok: true, member: m };
  }

  leave(id, reason = 'salió') {
    const m = this.member(id);
    if (!m) return;
    this.clearMemberTimers(id);
    this.members.delete(id);
    if (this.game && this.status === 'playing') this.apply(this.game.removePlayer(id, 'left', this.now()));
    for (const v of this.votes.values()) {
      v.yes.delete(id);
      v.no.delete(id);
      if (v.targetId === id) this.votes.delete(v.id);
    }
    this.system(`${m.name} ${reason}.`);
    if (this.leaderId === id) this.transferLeader();
    this.broadcastMembers();
    this.checkVotes();
  }

  transferLeader() {
    const next = [...this.members.values()].filter((m) => m.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0]
      || [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    this.leaderId = next ? next.id : null;
    if (next) this.system(`${next.name} ahora es el líder 👑`);
  }

  setConnected(id, connected) {
    const m = this.member(id);
    if (!m || m.connected === connected) return;
    m.connected = connected;
    const now = this.now();
    if (connected) {
      this.clearMemberTimers(id);
      if (this.game) this.game.setConnected(id, true, now);
      this.system(`${m.name} volvió.`);
    } else {
      if (this.game && this.status === 'playing') {
        this.game.setConnected(id, false, now);
        if (this.game.turn?.playerId === id) this.armGrace(id);
      }
      // Si no vuelve en 30 s: sale de la sala (en partida, queda eliminado).
      this.timers.drop.set(id, setTimeout(() => {
        this.timers.drop.delete(id);
        if (!this.member(id)?.connected) this.leave(id, 'se desconectó');
      }, TIMING.eliminateAfterMs));
      this.system(`${m.name} se desconectó…`);
    }
    this.broadcastMembers();
  }

  /** 5 s de gracia para el jugador con la bomba que se desconectó; si no vuelve, le explota. */
  armGrace(id) {
    clearTimeout(this.timers.grace.get(id));
    this.timers.grace.set(id, setTimeout(() => {
      this.timers.grace.delete(id);
      if (this.member(id)?.connected || !this.game) return;
      this.apply(this.game.forfeit(id, this.now()));
    }, TIMING.activeGraceMs));
  }

  clearMemberTimers(id) {
    clearTimeout(this.timers.grace.get(id));
    clearTimeout(this.timers.drop.get(id));
    this.timers.grace.delete(id);
    this.timers.drop.delete(id);
  }

  setReady(id, ready) {
    const m = this.member(id);
    if (!m) return;
    m.ready = Boolean(ready);
    this.touch();
    this.broadcastMembers();
  }

  updateProfile(id, { name, avatar }) {
    const m = this.member(id);
    if (!m || this.status === 'playing') return { ok: false, error: 'No se puede cambiar en plena partida.' };
    if (name !== undefined) {
      const n = cleanName(name);
      if (!n) return { ok: false, error: 'Elegí otro apodo.' };
      m.name = n;
    }
    if (avatar !== undefined) m.avatar = cleanAvatar(avatar);
    this.broadcastMembers();
    return { ok: true };
  }

  // ---------------------------------------------------------------- líder
  isLeader(id) {
    return id === this.leaderId;
  }

  updateSettings(id, patch = {}) {
    if (!this.isLeader(id)) return { ok: false, error: 'Solo el líder cambia los ajustes.' };
    if (this.status === 'playing') return { ok: false, error: 'Esperá a que termine la partida.' };
    this.settings = cleanSettings(patch.settings || {}, this.settings);
    if (patch.name !== undefined) this.name = cleanText(patch.name, ROOM_LIMITS.roomNameMax) || this.name;
    if (patch.isPublic !== undefined) this.isPublic = Boolean(patch.isPublic);
    if (patch.password !== undefined) this.password = cleanText(patch.password, ROOM_LIMITS.passwordMax);
    if (patch.filterChat !== undefined) this.filterChat = Boolean(patch.filterChat);
    if (patch.maxPlayers !== undefined) this.maxPlayers = clampInt(patch.maxPlayers, [ROOM_LIMITS.minPlayers, ROOM_LIMITS.maxPlayers], this.maxPlayers);
    this.touch();
    this.emit('all', 'room:settings', {
      settings: this.settings, name: this.name, isPublic: this.isPublic, hasPassword: Boolean(this.password), maxPlayers: this.maxPlayers, filterChat: this.filterChat,
    });
    return { ok: true };
  }

  kick(id, targetId, reason = 'fue expulsado por el líder') {
    if (id !== null && !this.isLeader(id)) return { ok: false, error: 'Solo el líder puede expulsar.' };
    const t = this.member(targetId);
    if (!t || targetId === id) return { ok: false, error: 'No se puede.' };
    this.banned.add(t.token);
    this.emit(targetId, 'room:kicked', { reason: id === null ? 'La sala votó tu expulsión.' : 'El líder te expulsó de la sala.' });
    this.deps.onKicked?.(this.code, t);
    this.leave(targetId, reason);
    return { ok: true };
  }

  /** Empieza (o reempieza: revancha) con los miembros conectados. Reinicia reloj y palabras usadas. */
  start(id) {
    if (!this.isLeader(id)) return { ok: false, error: 'Solo el líder puede empezar.' };
    if (this.status === 'playing') return { ok: false, error: 'Ya hay una partida en curso.' };
    const players = [...this.members.values()].filter((m) => m.connected).sort((a, b) => a.joinedAt - b.joinedAt).slice(0, this.maxPlayers);
    if (players.length < ROOM_LIMITS.minPlayers) return { ok: false, error: 'Hacen falta al menos 2 jugadores conectados.' };
    clearTimeout(this.timers.results);
    this.game = new Game({
      players: players.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar })), settings: this.settings,
      dict: this.deps.dict, bank: this.deps.bank, now: this.deps.now, rng: this.deps.rng || Math.random,
    });
    this.status = 'playing';
    this.chat.dead = [];
    for (const m of this.members.values()) m.ready = false;
    this.touch();
    const events = this.game.start(this.now());
    this.system(`¡Arranca la partida! ${players.length} jugadores. Recuerden: no se puede repetir ninguna palabra.`);
    this.apply(events);
    this.armClock();
    this.broadcastMembers();
    return { ok: true };
  }

  // ---------------------------------------------------------------- partida
  submit(id, text) {
    if (!this.game || this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    this.touch();
    const word = typeof text === 'string' ? text.slice(0, ROOM_LIMITS.wordMax) : '';
    const { events, result } = this.game.submit(id, word, this.now());
    if (result.ignored) {
      // Envío fuera de turno: se ignora y se registra.
      const m = this.member(id);
      if (m) m.offTurn += 1;
      this.offTurnAttempts += 1;
      this.deps.log?.debug?.(`[sala ${this.code}] envío fuera de turno de ${m?.name}`);
    }
    this.apply(events);
    return result;
  }

  typing(id, text) {
    if (!this.game || this.game.turn?.playerId !== id) return;
    this.emit('all', 'game:typing', { playerId: id, text: cleanTyping(text, ROOM_LIMITS.typingMax), turn: this.game.turn.n });
  }

  /** Reparte los eventos del motor y programa el temporizador de la mecha. */
  apply(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'start':
          this.emit('all', 'game:start', { game: this.game.snapshot(), serverNow: this.now() });
          break;
        case 'turn': {
          this.emit('all', 'game:turn', {
            turn: ev.turn, reason: ev.reason, from: ev.from, serverNow: this.now(),
            seats: this.game.seats.map((s) => ({ id: s.id, lives: s.lives, alive: s.alive, connected: s.connected })),
          });
          this.armTurnTimer(ev.turn);
          const active = this.member(ev.turn.playerId);
          if (active && !active.connected) this.armGrace(active.id);
          break;
        }
        case 'accept':
          this.emit('all', 'game:accept', ev);
          break;
        case 'reject':
          this.emit('all', 'game:reject', ev);
          break;
        case 'explode':
          this.emit('all', 'game:explode', ev);
          break;
        case 'eliminated': {
          const m = this.game.seat(ev.playerId);
          this.emit('all', 'game:eliminated', ev);
          if (ev.reason === 'exploded') this.system(`💥 ${m?.name} quedó eliminado (puesto ${ev.place}).`);
          else if (ev.reason === 'left' || ev.reason === 'disconnected') this.system(`${m?.name} abandonó la partida.`);
          break;
        }
        case 'announce':
          this.emit('all', 'game:announce', ev);
          this.system(`🔥 ${ev.text}`);
          break;
        case 'countdown':
          this.emit('all', 'game:countdown', { suddenAt: ev.suddenAt, serverNow: this.now() });
          this.system(`⏳ ¡En ${ev.seconds} segundos empieza la MUERTE SÚBITA!`);
          break;
        case 'sudden':
          this.emit('all', 'game:sudden', { seats: ev.seats, at: ev.at, serverNow: this.now() });
          this.system('💀 ¡MUERTE SÚBITA! Todos quedan con 1 vida y la mecha va a la mitad.');
          break;
        case 'end':
          this.endGame(ev.results);
          break;
        default:
      }
    }
  }

  armTurnTimer(turn) {
    clearTimeout(this.timers.turn);
    const delay = Math.max(0, turn.deadline - this.now()) + 3;
    this.timers.turn = setTimeout(() => {
      if (!this.game || this.game.turn?.n !== turn.n) return;
      this.apply(this.game.tick(this.now()));
    }, delay);
  }

  /** Temporizadores de la cuenta regresiva y de la muerte súbita (los decide el motor con clock()). */
  armClock() {
    for (const t of this.timers.clock) clearTimeout(t);
    this.timers.clock = [];
    const g = this.game;
    if (!g || g.suddenAt === null || g.sudden) return;
    const fire = () => {
      if (this.game === g && this.status === 'playing') this.apply(g.clock(this.now()));
    };
    for (const when of [g.suddenAt - g.snapshot().countdownMs, g.suddenAt]) {
      this.timers.clock.push(setTimeout(fire, Math.max(0, when - this.now()) + 5));
    }
  }

  endGame(results) {
    clearTimeout(this.timers.turn);
    for (const t of this.timers.clock) clearTimeout(t);
    this.status = 'results';
    this.results = results;
    const w = results.winner;
    this.system(w ? `🏆 ¡Ganó ${w.name}${results.byAbandon ? ' (por abandono)' : ''}!` : 'Terminó la partida.');
    this.emit('all', 'game:end', { results, serverNow: this.now() });
    this.broadcastMembers();
  }

  // ---------------------------------------------------------------- chat
  system(text) {
    this.pushChat('main', { system: true, text, at: this.now() });
  }

  pushChat(channel, msg) {
    const list = this.chat[channel];
    list.push(msg);
    if (list.length > ROOM_LIMITS.chatHistory) list.shift();
    this.emit(channel === 'dead' ? 'dead' : 'all', 'chat:message', { channel, ...msg });
  }

  chatFrom(id, raw) {
    const m = this.member(id);
    if (!m) return { ok: false };
    let text = cleanText(raw, ROOM_LIMITS.chatMax);
    if (!text) return { ok: false };
    if (this.filterChat) text = filterChat(text);
    this.touch();
    // Eliminados y espectadores hablan en su propio canal durante la partida (sin spoilers).
    const channel = this.isDead(id) ? 'dead' : 'main';
    this.pushChat(channel, { from: { id: m.id, name: m.name, color: m.avatar.color }, text, at: this.now() });
    return { ok: true };
  }

  // ---------------------------------------------------------------- votación para expulsar
  voteView(v) {
    return { id: v.id, targetId: v.targetId, target: this.member(v.targetId)?.name, by: this.member(v.by)?.name, yes: v.yes.size, no: v.no.size, needed: this.votesNeeded(v), endsAt: v.endsAt };
  }

  votesNeeded(v) {
    const voters = [...this.members.values()].filter((m) => m.connected && m.id !== v.targetId).length;
    return Math.floor(voters / 2) + 1;
  }

  startVote(id, targetId) {
    const by = this.member(id);
    const target = this.member(targetId);
    if (!by || !target || id === targetId) return { ok: false, error: 'No se puede.' };
    if ([...this.votes.values()].some((v) => v.targetId === targetId)) return { ok: false, error: 'Ya hay una votación por ese jugador.' };
    const v = { id: `v${++this.seq}`, targetId, by: id, yes: new Set([id]), no: new Set(), endsAt: this.now() + TIMING.voteMs };
    this.votes.set(v.id, v);
    v.timer = setTimeout(() => {
      if (!this.votes.has(v.id)) return;
      this.votes.delete(v.id);
      this.system(`La votación para expulsar a ${target.name} no alcanzó la mayoría.`);
      this.emit('all', 'vote:update', { vote: { ...this.voteView(v), closed: true, passed: false } });
    }, TIMING.voteMs);
    this.system(`${by.name} propone expulsar a ${target.name}. Voten en la lista de jugadores.`);
    this.checkVotes();
    return { ok: true };
  }

  castVote(id, voteId, yes) {
    const v = this.votes.get(voteId);
    if (!v || !this.member(id) || id === v.targetId) return { ok: false };
    (yes ? v.yes : v.no).add(id);
    (yes ? v.no : v.yes).delete(id);
    this.checkVotes();
    return { ok: true };
  }

  checkVotes() {
    for (const v of [...this.votes.values()]) {
      const needed = this.votesNeeded(v);
      const voters = needed * 2 - 1;
      if (v.yes.size >= needed) {
        clearTimeout(v.timer);
        this.votes.delete(v.id);
        this.emit('all', 'vote:update', { vote: { ...this.voteView(v), closed: true, passed: true } });
        this.kick(null, v.targetId, 'fue expulsado por votación');
      } else if (v.no.size > voters - needed) {
        clearTimeout(v.timer);
        this.votes.delete(v.id);
        this.emit('all', 'vote:update', { vote: { ...this.voteView(v), closed: true, passed: false } });
      } else this.emit('all', 'vote:update', { vote: this.voteView(v) });
    }
  }

  // ---------------------------------------------------------------- ciclo de vida
  dispose() {
    clearTimeout(this.timers.turn);
    for (const t of this.timers.clock) clearTimeout(t);
    clearTimeout(this.timers.results);
    for (const t of this.timers.grace.values()) clearTimeout(t);
    for (const t of this.timers.drop.values()) clearTimeout(t);
    for (const v of this.votes.values()) clearTimeout(v.timer);
  }

  toJSON() {
    return {
      code: this.code, name: this.name, isPublic: this.isPublic, password: this.password, maxPlayers: this.maxPlayers, leaderId: this.leaderId,
      status: this.status, settings: this.settings, filterChat: this.filterChat, chat: this.chat, banned: [...this.banned], seq: this.seq,
      results: this.results || null, createdAt: this.createdAt, lastActivity: this.lastActivity,
      members: [...this.members.values()].map((m) => ({ ...m, connected: false })), game: this.game ? this.game.toJSON() : null,
    };
  }

  static fromJSON(data, deps) {
    const r = new Room(data, deps);
    Object.assign(r, {
      leaderId: data.leaderId, status: data.status, settings: data.settings, filterChat: data.filterChat, chat: data.chat,
      banned: new Set(data.banned), seq: data.seq, results: data.results, createdAt: data.createdAt, lastActivity: data.lastActivity,
    });
    r.password = data.password;
    for (const m of data.members) r.members.set(m.id, { ...m, connected: false });
    if (data.game) {
      r.game = Game.fromJSON(data.game, { dict: deps.dict, bank: deps.bank, now: deps.now, rng: deps.rng || Math.random });
      for (const s of r.game.seats) s.connected = false;
    }
    return r;
  }

  /** Tras recuperar de disco: reprograma la mecha y los temporizadores de desconexión. */
  resume() {
    for (const m of this.members.values()) {
      this.timers.drop.set(m.id, setTimeout(() => {
        this.timers.drop.delete(m.id);
        if (!this.member(m.id)?.connected) this.leave(m.id, 'no volvió');
      }, TIMING.eliminateAfterMs));
    }
    if (this.status === 'playing' && this.game?.turn) {
      this.armTurnTimer(this.game.turn);
      this.armClock();
    }
  }
}

// ---------------------------------------------------------------- administrador de salas
export class RoomManager {
  constructor(deps) {
    this.deps = deps;
    this.rooms = new Map();
  }

  newCode() {
    for (let i = 0; i < 500; i += 1) {
      let c = '';
      for (let j = 0; j < 5; j += 1) c += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('No hay códigos libres.');
  }

  get(code) {
    return this.rooms.get(cleanCode(code)) || null;
  }

  create(opts) {
    if (this.rooms.size >= (this.deps.maxRooms || ROOM_LIMITS.maxRooms)) return { ok: false, error: 'El servidor está lleno de salas. Probá en un rato.' };
    const room = new Room({ ...opts, code: this.newCode() }, this.deps);
    this.rooms.set(room.code, room);
    this.deps.log?.info?.(`[sala ${room.code}] creada (${room.isPublic ? 'pública' : 'privada'})`);
    return { ok: true, room };
  }

  /** "Jugar rápido": una sala pública con lugar (mejor si está esperando), o una nueva. */
  quick() {
    const candidates = [...this.rooms.values()].filter((r) => r.isPublic && !r.password && r.members.size < r.maxPlayers && r.connectedCount > 0)
      .sort((a, b) => (a.status === 'lobby' ? 0 : 1) - (b.status === 'lobby' ? 0 : 1) || b.members.size - a.members.size);
    if (candidates[0]) return { ok: true, room: candidates[0] };
    return this.create({ name: 'Sala rápida', isPublic: true });
  }

  list() {
    return [...this.rooms.values()].filter((r) => r.isPublic && r.connectedCount > 0).map((r) => r.summary())
      .sort((a, b) => (a.status === 'lobby' ? 0 : 1) - (b.status === 'lobby' ? 0 : 1) || b.players - a.players).slice(0, 60);
  }

  /** Cierra salas vacías o inactivas. */
  sweep() {
    const now = this.deps.now();
    for (const [code, r] of this.rooms) {
      const empty = r.members.size === 0 || (r.connectedCount === 0 && now - r.lastActivity > TIMING.emptyRoomMs);
      const idle = now - r.lastActivity > TIMING.idleRoomMs;
      if (empty || idle) {
        r.dispose();
        this.rooms.delete(code);
        this.deps.onClosed?.(code);
        this.deps.log?.info?.(`[sala ${code}] cerrada (${empty ? 'vacía' : 'inactiva'})`);
      }
    }
  }

  toJSON() {
    return { rooms: [...this.rooms.values()].map((r) => r.toJSON()) };
  }

  restore(data) {
    for (const rd of data?.rooms || []) {
      try {
        const r = Room.fromJSON(rd, this.deps);
        this.rooms.set(r.code, r);
        r.resume();
      } catch (err) {
        this.deps.log?.error?.(`[persistencia] sala ${rd.code}: ${err.message}`);
      }
    }
  }
}

// La partida de wORTbomb: lógica pura y determinista (reloj y azar inyectables).
// No sabe nada de sockets: cada método devuelve una lista de eventos que el servidor reparte,
// y el servidor programa un temporizador para llamar a tick() cuando vence la mecha.
//
// Eventos: start · turn · accept · reject · explode · eliminated · announce · countdown · sudden · end
//
// Reglas de la mecha y la sílaba:
//  · la mecha se acorta con el tiempo de partida y con cada vida perdida (ver fuse.js)
//  · si a alguien le explota la bomba, el siguiente recibe LA MISMA sílaba; si tampoco la sabe,
//    recién ahí sale una nueva
//  · muerte súbita (si está activada): cuenta regresiva de 1 minuto y, al llegar, todos quedan con
//    1 vida y la mecha va a la mitad

import { DEFAULT_SETTINGS, TIMING, SUDDEN_DEATH } from './constants.js';
import { baseFuseSeconds, fuseDurationMs, dangerLevel, fuseAnnouncement } from './fuse.js';
import { UsedWords } from './usedWords.js';
import { checkAndClaim, REASONS } from './turn.js';
import { nextAlive } from './circle.js';
import { normalizeWord } from './normalize.js';

const newStats = () => ({ words: 0, longest: '', totalMs: 0, explosions: 0, repeats: 0, invalid: 0 });

export class Game {
  /**
   * @param {{ players: {id:string,name:string,avatar?:object}[], settings?:object, dict, bank,
   *           now?: () => number, rng?: () => number }} o
   */
  constructor({ players, settings = {}, dict, bank, now = Date.now, rng = Math.random }) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.dict = dict;
    this.bank = bank;
    this.now = now;
    this.rng = rng;
    this.seats = players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar || null,
      lives: this.settings.startLives, alive: true, connected: true, disconnectedAt: null,
      stats: newStats(), place: null, out: null,
    }));
    this.used = new UsedWords();
    this.state = 'idle'; // idle | playing | ended
    this.startedAt = null;
    this.endedAt = null;
    this.turn = null;
    this.turnCount = 0;
    this.activeIdx = -1;
    this.lastSyllable = null;
    this.lastBase = null;
    this.maxLevel = 1;
    this.results = null;
    this.livesLost = 0; // vidas perdidas en la partida (acortan la mecha)
    this.eliminations = 0;
    this.sudden = false; // ¿estamos en muerte súbita?
    this.suddenAt = null; // hora (del servidor) en que empieza la muerte súbita
    this.countdownSent = false;
  }

  /** Lo que acorta la mecha en este momento. */
  pressure(at = this.now()) {
    return { minutes: this.minutes(at), livesLost: this.livesLost, eliminations: this.eliminations, sudden: this.sudden };
  }

  // ---------------------------------------------------------------- consultas

  seat(id) {
    return this.seats.find((s) => s.id === id) || null;
  }

  get aliveSeats() {
    return this.seats.filter((s) => s.alive);
  }

  minutes(at = this.now()) {
    return this.startedAt === null ? 0 : (at - this.startedAt) / 60000;
  }

  // ---------------------------------------------------------------- inicio

  start(at = this.now()) {
    if (this.seats.length < 2) throw new Error('Se necesitan al menos 2 jugadores.');
    // Partida nueva: el Set de palabras usadas y el reloj empiezan de cero.
    this.used.clear();
    this.startedAt = at;
    this.state = 'playing';
    this.livesLost = 0;
    this.eliminations = 0;
    this.sudden = false;
    this.countdownSent = false;
    this.lastBase = null;
    this.maxLevel = 1;
    this.suddenAt = this.settings.suddenDeathMinutes > 0 ? at + this.settings.suddenDeathMinutes * 60000 : null;
    for (const s of this.seats) {
      s.lives = this.settings.startLives;
      s.alive = true;
      s.stats = newStats();
      s.place = null;
      s.out = null;
    }
    const first = Math.floor(this.rng() * this.seats.length);
    return [{ type: 'start', at }, ...this.beginTurn(first, at, 'start', null)];
  }

  /**
   * Arranca el turno del asiento idx con la mecha calculada en este momento.
   * keepSyllable: la sílaba sigue (al que le explotó se la pasa al siguiente). fails: cuántos
   * jugadores seguidos ya no la supieron.
   */
  beginTurn(idx, at, reason, fromId, { keepSyllable = null, fails = 0 } = {}) {
    const events = [];
    const pressure = this.pressure(at);
    const base = baseFuseSeconds(pressure, this.settings);
    const announce = this.sudden ? null : fuseAnnouncement(this.lastBase, base);
    this.lastBase = base;
    const level = dangerLevel(pressure, this.settings);
    this.maxLevel = Math.max(this.maxLevel, level);
    let syllable = keepSyllable;
    let available = null;
    if (syllable) available = this.bank.available(syllable, this.used, this.settings.minWordLength);
    if (!syllable || available < 1) {
      ({ syllable, available } = this.bank.pick({
        minutes: pressure.minutes, rng: this.rng, used: this.used, minAvailable: this.settings.minSyllableWords,
        avoid: this.lastSyllable, minLength: this.settings.minWordLength,
      }));
      fails = 0;
    }
    this.lastSyllable = syllable;
    const duration = fuseDurationMs(pressure, this.settings, this.rng);
    this.activeIdx = idx;
    this.turnCount += 1;
    this.turn = {
      n: this.turnCount, playerId: this.seats[idx].id, syllable, available, fails,
      startedAt: at, duration, deadline: at + duration, level, base: Math.round(base * 10) / 10, sudden: this.sudden,
    };
    if (announce !== null) {
      const floor = base <= this.settings.fuseMin + 1e-9;
      events.push({
        type: 'announce', level, seconds: announce,
        text: floor ? `¡Mecha al mínimo! Ahora ${announce} s por turno.` : `¡La mecha se acorta! Ahora ${announce} s.`,
      });
    }
    events.push({ type: 'turn', reason, from: fromId, turn: { ...this.turn } });
    return events;
  }

  // ---------------------------------------------------------------- reloj: cuenta regresiva y muerte súbita

  /**
   * Lo llama el servidor con temporizadores (y también se revisa en cada turno):
   * avisa la cuenta regresiva y arranca la muerte súbita cuando llega la hora.
   */
  clock(at = this.now(), { restartTurn = true } = {}) {
    if (this.state !== 'playing' || this.suddenAt === null || this.sudden) return [];
    const events = [];
    if (!this.countdownSent && at >= this.suddenAt - SUDDEN_DEATH.countdownMs) {
      this.countdownSent = true;
      events.push({ type: 'countdown', suddenAt: this.suddenAt, seconds: Math.max(0, Math.round((this.suddenAt - at) / 1000)) });
    }
    if (at >= this.suddenAt) events.push(...this.startSuddenDeath(at, { restartTurn }));
    return events;
  }

  /** ¡Muerte súbita! Todos con 1 vida, mecha a la mitad. El turno en curso sigue con la mecha nueva. */
  startSuddenDeath(at = this.now(), { restartTurn = true } = {}) {
    if (this.state !== 'playing' || this.sudden) return [];
    this.sudden = true;
    for (const s of this.aliveSeats) s.lives = 1;
    const events = [{ type: 'sudden', at, seats: this.seats.map((s) => ({ id: s.id, lives: s.lives, alive: s.alive })) }];
    if (restartTurn && this.turn) {
      const { syllable, fails } = this.turn;
      events.push(...this.beginTurn(this.activeIdx, at, 'sudden', null, { keepSyllable: syllable, fails }));
    }
    return events;
  }

  /** Siguiente jugador vivo en sentido horario. Salta desconectados mientras haya alguien conectado. */
  nextIndex(from) {
    const connected = this.seats.map((s) => s.alive && s.connected);
    const i = nextAlive(connected, from);
    if (i >= 0 && i !== from) return i;
    return nextAlive(this.seats.map((s) => s.alive), from);
  }

  // ---------------------------------------------------------------- jugadas

  /**
   * Un jugador manda una palabra. Decide el orden de llegada con el reloj del servidor:
   * si llega después del vencimiento, primero explota la bomba y la palabra se descarta.
   */
  submit(playerId, text, at = this.now()) {
    if (this.state !== 'playing' || !this.turn) return { events: [], result: { ok: false, reason: 'not_playing' } };
    if (this.turn.playerId !== playerId) return { events: [], result: { ok: false, reason: 'not_your_turn', ignored: true } };
    if (at > this.turn.deadline) {
      return { events: this.tick(at), result: { ok: false, reason: 'late', message: REASONS.late } };
    }
    const seat = this.seats[this.activeIdx];
    const res = checkAndClaim({
      text, syllable: this.turn.syllable, dict: this.dict, used: this.used,
      minLength: this.settings.minWordLength, by: seat.id, name: seat.name, at,
    });
    if (!res.ok) {
      if (res.reason === 'used') seat.stats.repeats += 1;
      else seat.stats.invalid += 1;
      const message = res.reason === 'used' ? `${REASONS.used} La usó ${res.entry.by === seat.id ? 'vos mismo' : res.entry.name}.` : REASONS[res.reason];
      const ev = { type: 'reject', playerId, reason: res.reason, word: res.word, message, by: res.entry ? { id: res.entry.by, name: res.entry.name } : null };
      // La mecha sigue corriendo y NO se pierde ninguna vida por intentar.
      return { events: [ev], result: { ok: false, reason: res.reason, message } };
    }
    // Aceptada
    seat.stats.words += 1;
    seat.stats.totalMs += at - this.turn.startedAt;
    if (res.word.length > seat.stats.longest.length) seat.stats.longest = res.word;
    // Todas las palabras valen lo mismo y las vidas no se recuperan nunca.
    const events = [{
      type: 'accept', playerId, word: res.word, syllable: this.turn.syllable, entry: res.entry, lives: seat.lives,
      ms: at - this.turn.startedAt,
    }];
    // Si justo llegó la hora de la muerte súbita, el turno nuevo ya sale con la mecha corta.
    events.push(...this.clock(at, { restartTurn: false }));
    events.push(...this.beginTurn(this.nextIndex(this.activeIdx), at, 'pass', playerId));
    return { events, result: { ok: true, word: res.word } };
  }

  /** Llamado por el temporizador del servidor (o en cualquier momento): explota si venció la mecha. */
  tick(at = this.now()) {
    if (this.state !== 'playing' || !this.turn || at < this.turn.deadline) return [];
    return this.explode(at, 'timeout');
  }

  explode(at, cause = 'timeout') {
    const seat = this.seats[this.activeIdx];
    const { syllable, fails } = this.turn;
    seat.lives -= 1;
    seat.stats.explosions += 1;
    this.livesLost += 1; // cada vida perdida acorta la mecha
    const events = [{ type: 'explode', playerId: seat.id, lives: Math.max(0, seat.lives), cause, syllable }];
    if (seat.lives <= 0) events.push(...this.eliminate(seat, 'exploded', at));
    if (this.state === 'playing') {
      events.push(...this.clock(at, { restartTurn: false }));
      // La sílaba pasa al siguiente; si ya falló uno antes con ella, sale otra.
      const keep = fails < 1 ? syllable : null;
      events.push(...this.beginTurn(this.nextIndex(this.activeIdx), at, 'explode', seat.id, { keepSyllable: keep, fails: fails + 1 }));
    }
    return events;
  }

  eliminate(seat, reason, at) {
    if (!seat.alive) return [];
    seat.place = this.aliveSeats.length; // el último eliminado queda 2.º, etc.
    seat.alive = false;
    seat.lives = Math.max(0, seat.lives);
    seat.out = { reason, at };
    this.eliminations += 1; // cada eliminado acorta un poco más la mecha
    const events = [{ type: 'eliminated', playerId: seat.id, place: seat.place, reason }];
    if (this.aliveSeats.length <= 1) events.push(...this.finish(at));
    return events;
  }

  /** El jugador con la bomba se desconectó y no volvió en la gracia: la bomba le explota y sigue. */
  forfeit(playerId, at = this.now()) {
    if (this.state !== 'playing' || this.turn?.playerId !== playerId) return [];
    return this.explode(at, 'disconnect');
  }

  /** Un jugador se fue (o pasaron 30 s desconectado). Si tenía la bomba, pasa sin explotar. */
  removePlayer(playerId, reason = 'left', at = this.now()) {
    const seat = this.seat(playerId);
    if (!seat || !seat.alive || this.state !== 'playing') return [];
    const wasActive = this.turn?.playerId === playerId;
    const idx = this.seats.indexOf(seat);
    const events = this.eliminate(seat, reason, at);
    if (this.state === 'playing' && wasActive) events.push(...this.beginTurn(this.nextIndex(idx), at, 'skip', playerId, { keepSyllable: this.turn?.syllable, fails: this.turn?.fails || 0 }));
    return events;
  }

  setConnected(playerId, connected, at = this.now()) {
    const seat = this.seat(playerId);
    if (!seat) return;
    seat.connected = connected;
    seat.disconnectedAt = connected ? null : at;
  }

  finish(at) {
    this.state = 'ended';
    this.endedAt = at;
    this.turn = null;
    const winner = this.aliveSeats[0] || null;
    if (winner) winner.place = 1;
    const ranking = [...this.seats].sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map((s) => ({
      id: s.id, name: s.name, avatar: s.avatar, place: s.place, lives: s.lives, out: s.out?.reason || null,
      stats: { ...s.stats, avgMs: s.stats.words ? Math.round(s.stats.totalMs / s.stats.words) : null },
    }));
    const abandon = winner && this.seats.filter((s) => s.out && s.out.reason !== 'exploded').length >= this.seats.length - 1;
    this.results = {
      winner: winner ? { id: winner.id, name: winner.name } : null, byAbandon: Boolean(abandon), ranking,
      durationMs: at - this.startedAt, maxLevel: this.maxLevel, words: this.used.size, sudden: this.sudden,
    };
    return [{ type: 'end', results: this.results }];
  }

  // ---------------------------------------------------------------- vista pública y persistencia

  /** Estado completo para un cliente (al entrar, reconectar o empezar). */
  snapshot() {
    return {
      state: this.state, settings: this.settings, startedAt: this.startedAt, maxLevel: this.maxLevel,
      level: this.turn ? this.turn.level : dangerLevel(this.pressure(), this.settings),
      sudden: this.sudden, suddenAt: this.suddenAt, countdownMs: SUDDEN_DEATH.countdownMs,
      turn: this.turn ? { ...this.turn } : null,
      seats: this.seats.map((s) => ({
        id: s.id, name: s.name, avatar: s.avatar, lives: s.lives, alive: s.alive, connected: s.connected,
        place: s.place, words: s.stats.words,
      })),
      used: this.used.list({ limit: 500 }),
      usedCount: this.used.size,
      results: this.results,
    };
  }

  toJSON() {
    return {
      settings: this.settings, state: this.state, startedAt: this.startedAt, endedAt: this.endedAt, turn: this.turn,
      turnCount: this.turnCount, activeIdx: this.activeIdx, lastSyllable: this.lastSyllable, lastBase: this.lastBase,
      maxLevel: this.maxLevel, results: this.results, used: this.used.toJSON(),
      livesLost: this.livesLost, eliminations: this.eliminations, sudden: this.sudden, suddenAt: this.suddenAt, countdownSent: this.countdownSent,
      seats: this.seats.map((s) => ({ ...s })),
    };
  }

  static fromJSON(data, { dict, bank, now = Date.now, rng = Math.random }) {
    const g = new Game({ players: [], settings: data.settings, dict, bank, now, rng });
    Object.assign(g, {
      state: data.state, startedAt: data.startedAt, endedAt: data.endedAt, turn: data.turn, turnCount: data.turnCount,
      activeIdx: data.activeIdx, lastSyllable: data.lastSyllable, lastBase: data.lastBase, maxLevel: data.maxLevel, results: data.results,
      livesLost: data.livesLost || 0, eliminations: data.eliminations || 0, sudden: Boolean(data.sudden), suddenAt: data.suddenAt ?? null,
      countdownSent: Boolean(data.countdownSent),
    });
    g.used = UsedWords.fromJSON(data.used);
    g.seats = data.seats.map((s) => ({ ...s }));
    return g;
  }
}

/** Texto en vivo del jugador activo, limpio para mostrar a los demás. */
export function cleanTyping(text, max = 40) {
  if (typeof text !== 'string') return '';
  return text.slice(0, max).replace(/[^\p{L}]/gu, '').toLowerCase();
}

export { REASONS, TIMING, normalizeWord };

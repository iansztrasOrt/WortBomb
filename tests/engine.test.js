import { describe, it, expect } from 'vitest';
import { normalizeWord, validateFormat, syllablesOf } from '../engine/normalize.js';
import { Dictionary } from '../engine/dictionary.js';
import { UsedWords } from '../engine/usedWords.js';
import { SyllableBank, tierWeightsAt } from '../engine/syllables.js';
import { baseFuseSeconds, fuseDurationMs, dangerLevel, fuseAnnouncement } from '../engine/fuse.js';
import { checkAndClaim } from '../engine/turn.js';
import { Game } from '../engine/game.js';
import { DEFAULT_SETTINGS, FUSE } from '../engine/constants.js';

// ---------------------------------------------------------------- ayudas
const WORDS = ['casa', 'casas', 'cancion', 'canciones', 'canto', 'cantos', 'cantor', 'encanto', 'montaña', 'pinguino', 'ascensor',
  'casamiento', 'casita', 'cascada', 'escasa', 'escaso', 'pasa', 'masa', 'tasa', 'mesa', 'misa', 'cosa', 'cosas', 'casco', 'tenes'];
const dict = new Dictionary(WORDS);
function bankFrom(words, extra = []) {
  const counts = new Map();
  for (const w of words) for (const s of syllablesOf(w)) counts.set(s, (counts.get(s) || 0) + 1);
  return new SyllableBank([...counts].map(([s, n]) => ({ s, n: n * 1000 })).concat(extra));
}
/** Banco que siempre da la misma sílaba (para tests de turnos). */
const fixedBank = (s = 'ca') => ({ pick: () => ({ syllable: s, tier: 0, available: 99 }), available: () => 99 });
/** Banco que va dando sílabas distintas en orden (para ver cuándo cambia la sílaba). */
const seqBank = (list) => {
  let i = 0;
  return { pick: () => ({ syllable: list[i++ % list.length], tier: 0, available: 99 }), available: () => 99 };
};
function clock(start = 1_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; return t; };
  now.set = (v) => { t = v; };
  return now;
}
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
function newGame({ n = 3, settings = {}, syllable = 'ca', rng = seq(0), bank = null } = {}) {
  const now = clock();
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));
  const g = new Game({ players, settings: { suddenDeathMinutes: 0, ...settings }, dict, bank: bank || fixedBank(syllable), now, rng });
  g.start();
  return { g, now };
}

// ---------------------------------------------------------------- normalización
describe('normalización', () => {
  it('minúsculas, trim, sin tildes ni diéresis, pero con ñ', () => {
    expect(normalizeWord('  CANCIÓN ')).toBe('cancion');
    expect(normalizeWord('Pingüino')).toBe('pinguino');
    expect(normalizeWord('MONTAÑA')).toBe('montaña');
    expect(normalizeWord('año')).not.toBe(normalizeWord('ano'));
    // ñ escrita con tilde combinada (n + U+0303)
    expect(normalizeWord('mañana')).toBe('mañana');
  });
  it('rechaza espacios internos, números, guiones y símbolos; respeta el largo mínimo', () => {
    expect(validateFormat('dos palabras').reason).toBe('chars');
    expect(validateFormat('abc1').reason).toBe('chars');
    expect(validateFormat('medio-día').reason).toBe('chars');
    expect(validateFormat('<b>').reason).toBe('chars');
    expect(validateFormat('').reason).toBe('empty');
    expect(validateFormat('sí', { minLength: 3 }).reason).toBe('short');
    expect(validateFormat('Árbol').ok).toBe(true);
  });
});

// ---------------------------------------------------------------- palabras usadas
describe('regla: no se repiten palabras en la partida', () => {
  it('claim es atómico: la segunda vez falla y dice quién la usó', () => {
    const u = new UsedWords();
    expect(u.claim('casa', { by: 'a', name: 'Ana' }).ok).toBe(true);
    const r = u.claim('casa', { by: 'b', name: 'Beto' });
    expect(r.ok).toBe(false);
    expect(r.entry.name).toBe('Ana');
    expect(u.size).toBe(1);
  });

  it('mismo jugador en otro turno, otro jugador, mayúsculas, tildes y espacios: todas repetidas', () => {
    const { g, now } = newGame({ n: 3, settings: { startLives: 3 } });
    const first = g.turn.playerId;
    expect(g.submit(first, 'canción', now()).result.ok).toBe(true); // pasa al siguiente
    const second = g.turn.playerId;
    for (const v of ['cancion', 'CANCIÓN', '  Canción  ', 'CaNcIoN']) {
      const r = g.submit(second, v, now());
      expect(r.result.reason).toBe('used');
      expect(r.result.message).toMatch(/ya se usó/);
    }
    expect(g.submit(second, 'casa', now()).result.ok).toBe(true);
    // vuelve a tocarle al primero (3 jugadores, ronda completa) y tampoco puede repetir
    g.submit(g.turn.playerId, 'casas', now());
    expect(g.turn.playerId).toBe(first);
    expect(g.submit(first, 'canción', now()).result.reason).toBe('used');
  });

  it('dos envíos "simultáneos" de la misma palabra: solo uno se acepta', () => {
    const used = new UsedWords();
    const a = checkAndClaim({ text: 'casa', syllable: 'ca', dict, used, by: 'a', name: 'A' });
    const b = checkAndClaim({ text: 'Casa', syllable: 'ca', dict, used, by: 'b', name: 'B' });
    expect([a.ok, b.ok]).toEqual([true, false]);
    expect(b.reason).toBe('used');
  });

  it('una palabra rechazada (sin sílaba, inexistente, mal formada) NO queda como usada', () => {
    const used = new UsedWords();
    expect(checkAndClaim({ text: 'mesa', syllable: 'ca', dict, used }).reason).toBe('syllable');
    expect(checkAndClaim({ text: 'casaxyz', syllable: 'ca', dict, used }).reason).toBe('dictionary');
    expect(checkAndClaim({ text: 'ca sa', syllable: 'ca', dict, used }).reason).toBe('chars');
    expect(used.size).toBe(0);
    expect(used.has('mesa')).toBe(false);
  });

  it('formas distintas no cuentan como repetición (casa/casas, canto/cantó)', () => {
    const used = new UsedWords();
    expect(checkAndClaim({ text: 'casa', syllable: 'ca', dict, used }).ok).toBe(true);
    expect(checkAndClaim({ text: 'casas', syllable: 'ca', dict, used }).ok).toBe(true);
    expect(checkAndClaim({ text: 'canto', syllable: 'ca', dict, used }).ok).toBe(true);
    expect(checkAndClaim({ text: 'cantó', syllable: 'ca', dict, used }).reason).toBe('used'); // sin tildes son la misma
    expect(checkAndClaim({ text: 'cantos', syllable: 'ca', dict, used }).ok).toBe(true);
  });

  it('el intento repetido no consume vida y la mecha sigue igual', () => {
    const { g, now } = newGame({ n: 2 });
    g.submit(g.turn.playerId, 'casa', now());
    const p = g.turn.playerId;
    const { deadline } = g.turn;
    const lives = g.seat(p).lives;
    now.advance(500);
    expect(g.submit(p, 'casa', now()).result.reason).toBe('used');
    expect(g.seat(p).lives).toBe(lives);
    expect(g.turn.deadline).toBe(deadline);
    expect(g.turn.playerId).toBe(p);
    expect(g.seat(p).stats.repeats).toBe(1);
  });

  it('el Set se vacía SOLO al empezar una partida nueva (revancha), nunca a mitad de partida', () => {
    const { g, now } = newGame({ n: 2, settings: { startLives: 1 } });
    g.submit(g.turn.playerId, 'casa', now());
    g.submit(g.turn.playerId, 'casco', now());
    now.advance(g.turn.duration + 1);
    g.tick(now()); // explota uno → con 1 vida termina la partida
    expect(g.state).toBe('ended');
    expect(g.used.size).toBe(2); // ni siquiera al terminar se borra
    g.start(now()); // revancha
    expect(g.used.size).toBe(0);
    expect(g.submit(g.turn.playerId, 'casa', now()).result.ok).toBe(true);
  });

  it('el historial muestra la más reciente primero, con quién la usó, y se puede buscar', () => {
    const u = new UsedWords();
    u.claim('casa', { by: 'a', name: 'Ana' });
    u.claim('masa', { by: 'b', name: 'Beto' });
    u.claim('cosa', { by: 'a', name: 'Ana' });
    expect(u.list().map((e) => e.word)).toEqual(['cosa', 'masa', 'casa']);
    expect(u.list({ query: 'as' }).map((e) => e.word)).toEqual(['masa', 'casa']);
    expect(UsedWords.fromJSON(JSON.parse(JSON.stringify(u))).has('masa')).toBe(true);
  });
});

// ---------------------------------------------------------------- sílabas
describe('sílabas', () => {
  it('nunca sale una sílaba con menos de N palabras sin usar, ni la misma dos veces seguidas', () => {
    const bank = new SyllableBank([{ s: 'aa', n: 6 }, { s: 'bb', n: 2000 }, { s: 'cc', n: 2000 }]);
    const used = { containing: (s) => (s === 'aa' ? 2 : 0) }; // a "aa" le quedan 4
    for (let i = 0; i < 50; i += 1) {
      const r = bank.pick({ minutes: 9, rng: Math.random, used, minAvailable: 5, avoid: 'bb' });
      expect(r.syllable).toBe('cc');
    }
  });

  it('una sílaba que se quedó sin palabras disponibles se reemplaza por otra', () => {
    const words = ['casa', 'masa', 'tasa', 'pasa', 'cosa'];
    const bank = new SyllableBank([{ s: 'asa', n: 4 }, { s: 'os', n: 1200 }]);
    const used = new UsedWords();
    for (const w of words.slice(0, 2)) used.claim(w);
    // "asa" tenía 4 y se usaron 2: quedan 2 < 3 → no puede salir
    for (let i = 0; i < 30; i += 1) expect(bank.pick({ minutes: 20, used, minAvailable: 3 }).syllable).toBe('os');
  });

  it('la dificultad sube con el tiempo de partida', () => {
    expect(tierWeightsAt(0)).toEqual([1, 0, 0, 0]);
    const late = tierWeightsAt(10);
    expect(late[3]).toBeGreaterThan(0);
    expect(late[0]).toBeLessThan(1);
    const bank = new SyllableBank([{ s: 'aa', n: 5000, f: 999 }, { s: 'bb', n: 600 }, { s: 'cc', n: 100 }, { s: 'dd', n: 20 }]);
    const tiers = (m) => Array.from({ length: 400 }, () => bank.pick({ minutes: m, minAvailable: 1 }).tier);
    expect(new Set(tiers(0))).toEqual(new Set([0]));
    expect(new Set(tiers(10)).size).toBe(4);
  });

  it('usa el conteo según el largo mínimo de palabra de la sala', () => {
    const bank = new SyllableBank([{ s: 'ab', n: 100, c: [120, 100, 60, 3, 1, 0, 0] }]);
    expect(bank.total('ab', 3)).toBe(100);
    expect(bank.total('ab', 5)).toBe(3);
  });
});

// ---------------------------------------------------------------- mecha
describe('mecha: se acorta con el tiempo y con cada vida perdida (suave)', () => {
  const s = DEFAULT_SETTINGS;
  it('por tiempo: 12 × 0,95^minutos, decreciente y con piso', () => {
    expect(baseFuseSeconds(0, s)).toBe(12);
    expect(baseFuseSeconds(1, s)).toBeCloseTo(11.4);
    expect(baseFuseSeconds(5, s)).toBeCloseTo(12 * 0.95 ** 5);
    let prev = Infinity;
    for (let m = 0; m <= 90; m += 0.5) {
      const v = baseFuseSeconds(m, s);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(3);
      prev = v;
    }
    expect(baseFuseSeconds(60, s)).toBe(3);
  });

  it('por vidas perdidas (× 0,97 cada una) y eliminados (× 0,95 extra)', () => {
    expect(baseFuseSeconds({ minutes: 0, livesLost: 1 }, s)).toBeCloseTo(12 * 0.97);
    expect(baseFuseSeconds({ minutes: 0, livesLost: 3, eliminations: 1 }, s)).toBeCloseTo(12 * 0.97 ** 3 * 0.95);
    expect(baseFuseSeconds({ minutes: 2, livesLost: 2 }, s)).toBeCloseTo(12 * 0.95 ** 2 * 0.97 ** 2);
    expect(baseFuseSeconds({ minutes: 0, livesLost: 500 }, s)).toBe(3);
  });

  it('la aceleración es suave: a los 4 minutos con 4 vidas perdidas quedan más de 8 s', () => {
    expect(baseFuseSeconds({ minutes: 4, livesLost: 4, eliminations: 1 }, s)).toBeGreaterThan(8);
  });

  it('muerte súbita: la mecha va a la mitad, con piso de 2 s', () => {
    expect(baseFuseSeconds({ minutes: 0, sudden: true }, s)).toBe(6);
    expect(baseFuseSeconds({ minutes: 60, sudden: true }, s)).toBe(2);
    for (let i = 0; i < 200; i += 1) expect(fuseDurationMs({ minutes: 60, sudden: true }, s, Math.random)).toBeGreaterThanOrEqual(2000);
    expect(dangerLevel({ minutes: 0, sudden: true }, s)).toBe(10);
  });

  it('curva lineal alternativa', () => {
    expect(baseFuseSeconds(5, s, { ...FUSE, curve: 'linear', linearPerMinute: 1 })).toBe(7);
    expect(baseFuseSeconds(30, s, { ...FUSE, curve: 'linear', linearPerMinute: 1 })).toBe(3);
  });

  it('el margen aleatorio (±10 %) nunca baja del mínimo absoluto', () => {
    expect(fuseDurationMs(0, s, () => 0)).toBe(10800);
    expect(fuseDurationMs(0, s, () => 0.999999)).toBe(13200);
    for (let i = 0; i < 200; i += 1) expect(fuseDurationMs(90, s, Math.random)).toBeGreaterThanOrEqual(3000);
  });

  it('nivel de peligro y anuncios al bajar cada segundo', () => {
    expect(dangerLevel(0, s)).toBe(1);
    expect(dangerLevel(90, s)).toBe(9); // el 10 queda para la muerte súbita
    expect(fuseAnnouncement(12, 11.4)).toBe(null);
    expect(fuseAnnouncement(11.01, 10.99)).toBe(11);
  });

  it('se recalcula tras acierto y tras explosión (tiempo de PARTIDA + vidas perdidas)', () => {
    const { g, now } = newGame({ n: 3, rng: seq(0.5) }); // rng 0.5 → sin margen
    expect(g.turn.duration).toBe(12000);
    now.advance(3 * 60000);
    g.tick(now()); // explota: 3 minutos y 1 vida perdida
    expect(g.turn.duration).toBe(Math.round(12 * 0.95 ** 3 * 0.97 * 1000));
    now.advance(2000); // acierta a tiempo
    g.submit(g.turn.playerId, 'casa', now());
    const minutes = (now() - g.startedAt) / 60000;
    expect(g.turn.duration).toBe(Math.round(12 * 0.95 ** minutes * 0.97 * 1000));
  });

  it('se reinicia en la revancha', () => {
    const { g, now } = newGame({ n: 2, settings: { startLives: 1 }, rng: seq(0.5) });
    now.advance(10 * 60000);
    g.tick(now());
    expect(g.state).toBe('ended');
    g.start(now());
    expect(g.turn.duration).toBe(12000);
    expect(g.livesLost).toBe(0);
  });
});

describe('la sílaba pasa al siguiente si explota', () => {
  it('al que le explota se la pasa al siguiente; si tampoco la sabe, sale otra', () => {
    const { g, now } = newGame({ n: 3, settings: { startLives: 3 }, bank: seqBank(['ca', 'as', 'co']) });
    expect(g.turn.syllable).toBe('ca');
    now.advance(g.turn.duration + 1);
    g.tick(now()); // explota p0 con "ca" → p1 recibe "ca"
    expect(g.turn.playerId).toBe('p1');
    expect(g.turn.syllable).toBe('ca');
    expect(g.turn.fails).toBe(1);
    now.advance(g.turn.duration + 1);
    g.tick(now()); // tampoco la sabe p1 → p2 recibe una sílaba nueva
    expect(g.turn.playerId).toBe('p2');
    expect(g.turn.syllable).toBe('as');
    expect(g.turn.fails).toBe(0);
  });

  it('si el siguiente la sabe, después sale otra sílaba', () => {
    const { g, now } = newGame({ n: 3, settings: { startLives: 3 }, bank: seqBank(['ca', 'as', 'co']) });
    now.advance(g.turn.duration + 1);
    g.tick(now());
    expect(g.turn.syllable).toBe('ca');
    g.submit('p1', 'casa', now());
    expect(g.turn.syllable).toBe('as');
  });
});

describe('muerte súbita', () => {
  const sd = (extra = {}) => newGame({ n: 3, settings: { startLives: 3, suddenDeathMinutes: 5, ...extra }, rng: seq(0.5) });
  it('cuenta regresiva 1 minuto antes y, al llegar, todos con 1 vida y la mecha a la mitad', () => {
    const { g, now } = sd();
    expect(g.clock(now.advance(3 * 60000))).toEqual([]);
    const cd = g.clock(now.set(g.startedAt + 4 * 60000) ?? now());
    expect(cd[0]).toMatchObject({ type: 'countdown', seconds: 60 });
    expect(g.clock(now())).toEqual([]); // se avisa una sola vez
    const syl = g.turn.syllable;
    const evs = g.clock(now.set(g.startedAt + 5 * 60000) ?? now());
    const sudden = evs.find((e) => e.type === 'sudden');
    expect(sudden).toBeTruthy();
    expect(g.aliveSeats.every((x) => x.lives === 1)).toBe(true);
    const turn = evs.find((e) => e.type === 'turn');
    expect(turn.reason).toBe('sudden');
    expect(turn.turn.syllable).toBe(syl);
    const normal = baseFuseSeconds({ minutes: 5 }, g.settings);
    expect(g.turn.duration).toBe(Math.round(Math.max(2, normal * 0.5) * 1000));
    expect(g.turn.level).toBe(10);
  });

  it('si la hora llega justo en un acierto o una explosión, el turno nuevo ya sale con la mecha corta', () => {
    const { g, now } = sd();
    now.set(g.startedAt + 5 * 60000 + 10);
    g.turn.deadline = now() + 1000; // el turno todavía no venció
    const { events } = g.submit(g.turn.playerId, 'casa', now());
    expect(events.some((e) => e.type === 'sudden')).toBe(true);
    expect(g.sudden).toBe(true);
    expect(g.turn.sudden).toBe(true);
  });

  it('con 0 minutos no hay muerte súbita', () => {
    const { g, now } = sd({ suddenDeathMinutes: 0 });
    expect(g.clock(now.advance(60 * 60000))).toEqual([]);
    expect(g.suddenAt).toBe(null);
  });

  it('se guarda y se recupera (persistencia)', () => {
    const { g, now } = sd();
    g.startSuddenDeath(now());
    const copy = Game.fromJSON(JSON.parse(JSON.stringify(g)), { dict, bank: fixedBank(), now });
    expect(copy.sudden).toBe(true);
    expect(copy.suddenAt).toBe(g.suddenAt);
  });
});

describe('turnos', () => {
  it('valida en orden: formato, sílaba, diccionario, repetida', () => {
    const { g, now } = newGame({ n: 2 });
    const p = g.turn.playerId;
    expect(g.submit(p, 'ca 1', now()).result.reason).toBe('chars');
    expect(g.submit(p, 'mesa', now()).result.reason).toBe('syllable');
    expect(g.submit(p, 'cazzz', now()).result.reason).toBe('dictionary');
    expect(g.submit(p, 'casa', now()).result.ok).toBe(true);
  });

  it('envíos fuera de turno se ignoran', () => {
    const { g, now } = newGame({ n: 3 });
    const other = g.seats.find((s) => s.id !== g.turn.playerId).id;
    const r = g.submit(other, 'casa', now());
    expect(r.result.ignored).toBe(true);
    expect(g.used.size).toBe(0);
  });

  it('la bomba pasa siempre al siguiente vivo en sentido horario', () => {
    const { g, now } = newGame({ n: 4, settings: { startLives: 1 } });
    expect(g.turn.playerId).toBe('p0'); // rng 0 → empieza el asiento 0
    g.submit('p0', 'casa', now());
    expect(g.turn.playerId).toBe('p1');
    now.advance(g.turn.duration + 1);
    g.tick(now()); // p1 explota y queda eliminado (1 vida)
    expect(g.seat('p1').alive).toBe(false);
    expect(g.turn.playerId).toBe('p2');
    g.submit('p2', 'casas', now());
    g.submit('p3', 'cosa', now()); // 'cosa' no tiene "ca" → rechazo
    expect(g.turn.playerId).toBe('p3');
    g.submit('p3', 'casco', now());
    expect(g.turn.playerId).toBe('p0'); // salta a p1 (eliminado)
  });

  it('explosión: pierde vida; a 0 queda eliminado; gana el último con vidas', () => {
    const { g, now } = newGame({ n: 3, settings: { startLives: 2 } });
    const order = [];
    while (g.state === 'playing') {
      now.advance(g.turn.duration + 1);
      const evs = g.tick(now());
      for (const e of evs) if (e.type === 'eliminated') order.push(e.playerId);
    }
    expect(order.length).toBe(2);
    expect(g.results.winner).not.toBe(null);
    expect(g.results.ranking[0].place).toBe(1);
    expect(g.results.ranking.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(g.results.ranking[2].id).toBe(order[0]); // el primero en caer queda último
  });

  it('palabra enviada justo al explotar: decide el reloj del servidor', () => {
    const a = newGame({ n: 2 });
    const p = a.g.turn.playerId;
    const atDeadline = a.g.turn.deadline;
    expect(a.g.submit(p, 'casa', atDeadline).result.ok).toBe(true); // llegó en el último ms: vale
    const b = newGame({ n: 2 });
    const q = b.g.turn.playerId;
    const r = b.g.submit(q, 'casa', b.g.turn.deadline + 1); // 1 ms tarde
    expect(r.result.reason).toBe('late');
    expect(r.events.some((e) => e.type === 'explode' && e.playerId === q)).toBe(true);
    expect(b.g.used.has('casa')).toBe(false);
  });

  it('jugador activo desconectado: forfeit lo hace explotar y la bomba sigue', () => {
    const { g, now } = newGame({ n: 3 });
    const p = g.turn.playerId;
    g.setConnected(p, false, now());
    const evs = g.forfeit(p, now.advance(5000));
    expect(evs[0]).toMatchObject({ type: 'explode', playerId: p, cause: 'disconnect' });
    expect(g.turn.playerId).not.toBe(p);
  });

  it('el orden salta a los desconectados mientras haya alguien conectado', () => {
    const { g, now } = newGame({ n: 3 });
    g.setConnected('p1', false, now());
    g.submit('p0', 'casa', now());
    expect(g.turn.playerId).toBe('p2');
  });

  it('si se van todos menos uno, gana por abandono', () => {
    const { g, now } = newGame({ n: 3 });
    g.removePlayer('p1', 'left', now());
    const evs = g.removePlayer(g.turn.playerId === 'p0' ? 'p0' : 'p2', 'left', now());
    expect(evs.some((e) => e.type === 'end')).toBe(true);
    expect(g.results.byAbandon).toBe(true);
  });

  it('el que se va con la bomba la pasa sin que explote', () => {
    const { g, now } = newGame({ n: 3 });
    const evs = g.removePlayer('p0', 'left', now());
    expect(evs.some((e) => e.type === 'explode')).toBe(false);
    expect(g.turn.playerId).toBe('p1');
  });

  it('se serializa a JSON y vuelve igual (persistencia), con palabras usadas y reloj', () => {
    const { g, now } = newGame({ n: 3 });
    g.submit('p0', 'casa', now());
    const copy = Game.fromJSON(JSON.parse(JSON.stringify(g)), { dict, bank: fixedBank(), now });
    expect(copy.used.has('casa')).toBe(true);
    expect(copy.startedAt).toBe(g.startedAt);
    expect(copy.turn).toEqual(g.turn);
    expect(copy.submit('p1', 'casa', now()).result.reason).toBe('used');
  });
});

// ---------------------------------------------------------------- vidas
describe('vidas', () => {
  it('no hay forma de ganar vidas: acertar nunca suma, aunque la palabra use muchas letras', () => {
    const { g, now } = newGame({ n: 2, settings: { startLives: 2 } });
    const seat = g.seat(g.turn.playerId);
    const ev = g.submit(seat.id, 'cascada', now()).events[0];
    expect(ev).toMatchObject({ type: 'accept', lives: 2 });
    expect(ev.gained).toBeUndefined();
    expect('alphabet' in seat).toBe(false);
  });
});

// ---------------------------------------------------------------- banco real chiquito
describe('banco de sílabas armado desde palabras', () => {
  it('toma sílabas de 2 y 3 letras', () => {
    const bank = bankFrom(['casa']);
    expect(bank.entries.has('ca')).toBe(true);
    expect(bank.entries.has('cas')).toBe(true);
    expect(bank.entries.has('casa')).toBe(false);
  });
});

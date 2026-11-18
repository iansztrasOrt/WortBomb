import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as connect } from 'socket.io-client';
import { createServer } from '../server/index.js';
import { Dictionary } from '../engine/dictionary.js';
import { SyllableBank } from '../engine/syllables.js';

const WORDS = ['casa', 'casas', 'cosa', 'casco', 'cascada', 'pasa', 'masa', 'tasa', 'escasa', 'escaso', 'casita', 'casero', 'acaso'];
let srv;
let url;
const quiet = { debug() {}, info() {}, error() {} };
beforeAll(async () => {
  srv = await createServer({
    port: 0, log: quiet, dict: new Dictionary(WORDS), bank: new SyllableBank([{ s: 'as', n: 5000 }, { s: 'ca', n: 5000 }]),
    reportsFile: '/tmp/wortbomb-test-reports.jsonl',
  });
  url = `http://localhost:${srv.port}`;
});
afterAll(async () => srv?.close());

function client(token) {
  const s = connect(url, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
  s.events = [];
  s.onAny((e, d) => s.events.push([e, d]));
  return s;
}
const call = (s, ev, data = {}) => new Promise((r) => s.emit(ev, data, r));
const once = (s, ev, pred = () => true) => new Promise((resolve, reject) => {
  const found = s.events.find(([e, d]) => e === ev && pred(d));
  if (found) return resolve(found[1]);
  const t = setTimeout(() => reject(new Error(`timeout ${ev}`)), 4000);
  const h = (d) => {
    if (!pred(d)) return;
    clearTimeout(t);
    s.off(ev, h);
    resolve(d);
  };
  s.on(ev, h);
  return undefined;
});
const profile = (name) => ({ name, avatar: { color: '#4d96ff', face: 'feliz', accessory: 'nada' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('servidor', () => {
  it('crear, unirse, empezar, jugar y la regla de no repetir en simultáneo', async () => {
    const a = client();
    const b = client();
    const c = client();
    const { token: tokA } = await once(a, 'session');
    const res = await call(a, 'room:create', { name: 'Test', profile: profile('Ana') });
    expect(res.ok).toBe(true);
    const { code } = res;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect((await call(b, 'room:join', { code, profile: profile('Beto') })).ok).toBe(true);
    expect((await call(c, 'room:join', { code, profile: profile('Caro') })).ok).toBe(true);
    // solo el líder empieza
    expect((await call(b, 'room:start')).ok).toBe(false);
    expect((await call(a, 'room:start')).ok).toBe(true);
    const turn = (await once(a, 'game:turn')).turn;
    const all = { [ (await once(a, 'room:state')).you ]: a };
    const stB = await once(b, 'room:state');
    const stC = await once(c, 'room:state');
    all[stB.you] = b;
    all[stC.you] = c;
    const active = all[turn.playerId];
    const others = Object.entries(all).filter(([id]) => id !== turn.playerId).map(([, s]) => s);
    // fuera de turno: se ignora
    const off = await call(others[0], 'game:submit', { text: 'casa' });
    expect(off.reason).toBe('not_your_turn');
    // el activo juega "casa"
    expect((await call(active, 'game:submit', { text: 'Casa' })).ok).toBe(true);
    const t2 = (await once(a, 'game:turn', (d) => d.turn.n === 2)).turn;
    const second = all[t2.playerId];
    // dos envíos "simultáneos" de la misma palabra nueva desde el MISMO turno: solo uno vale
    const fresh = ['cascada', 'escasa', 'casita', 'acaso', 'casas'].find((w) => w.includes(t2.syllable));
    const [r1, r2] = await Promise.all([call(second, 'game:submit', { text: fresh }), call(second, 'game:submit', { text: fresh.toUpperCase() })]);
    expect([r1.ok, r2.ok].filter(Boolean).length).toBe(1);
    // repetir "casa" (con tilde rara y espacios) en otro turno: rechazada como usada
    const t3 = (await once(a, 'game:turn', (d) => d.turn.n === 3)).turn;
    const rep = await call(all[t3.playerId], 'game:submit', { text: '  CÁSA ' });
    expect(rep.reason).toBe('used');
    const rej = await once(a, 'game:reject', (d) => d.reason === 'used');
    expect(rej.message).toMatch(/ya se usó/);
    // escritura en vivo
    all[t3.playerId].emit('game:typing', { text: 'cas' });
    expect((await once(others[0] === all[t3.playerId] ? others[1] : others[0], 'game:typing')).text).toBe('cas');
    // reconexión: A se reconecta con su token y recibe el estado completo con las palabras usadas
    a.disconnect();
    await sleep(100);
    const a2 = client(tokA);
    const st = await once(a2, 'room:state');
    expect(st.game.used.map((u) => u.word)).toContain('casa');
    expect(st.game.state).toBe('playing');
    // un espectador tardío entra como espectador (no está en el círculo)
    const d = client();
    expect((await call(d, 'room:join', { code, profile: profile('Dani') })).ok).toBe(true);
    const stD = await once(d, 'room:state');
    expect(stD.game.seats.some((s) => s.id === stD.you)).toBe(false);
    // chat de muertos/espectadores: no lo ven los vivos
    await call(d, 'chat:send', { text: 'hola desde la tribuna' });
    await sleep(100);
    expect(a2.events.some(([e, m]) => e === 'chat:message' && m.text === 'hola desde la tribuna')).toBe(false);
    expect(d.events.some(([e, m]) => e === 'chat:message' && m.channel === 'dead')).toBe(true);
    // el líder se va: el rol pasa a otro
    await call(a2, 'room:leave');
    const mem = await once(b, 'room:members', (m) => !m.members.some((x) => x.name === 'Ana'));
    expect(mem.leaderId).not.toBe(st.you);
    [a2, b, c, d].forEach((s) => s.disconnect());
  });

  it('sala que queda con un solo jugador: gana por abandono', async () => {
    const a = client();
    const b = client();
    const { code } = await call(a, 'room:create', { profile: profile('Uno') });
    await call(b, 'room:join', { code, profile: profile('Dos') });
    await call(a, 'room:start');
    await once(a, 'game:turn');
    await call(b, 'room:leave');
    const end = await once(a, 'game:end');
    expect(end.results.winner.name).toBe('Uno');
    expect(end.results.byAbandon).toBe(true);
    a.disconnect();
    b.disconnect();
  });

  it('contraseña, código inexistente, apodos con insultos y reporte de palabra', async () => {
    const a = client();
    const b = client();
    const created = await call(a, 'room:create', { profile: profile('Host'), password: 'secreta', isPublic: false });
    expect(created.ok, created.error).toBe(true);
    const { code } = created;
    expect((await call(b, 'room:join', { code, profile: profile('X') })).error).toMatch(/contraseña/i);
    expect((await call(b, 'room:join', { code, profile: profile('X'), password: 'secreta' })).ok).toBe(true);
    expect((await call(b, 'room:join', { code: 'ZZZZZ', profile: profile('X') })).ok).toBe(false);
    const c = client();
    expect((await call(c, 'room:quick', { profile: profile('pelotudo') })).ok).toBe(false);
    expect((await call(b, 'report:word', { word: 'chuchichuchi' })).ok).toBe(true);
    expect((await call(b, 'report:word', { word: 'casa' })).ok).toBe(false); // ya está
    [a, b, c].forEach((s) => s.disconnect());
  });

  it('la lista pública muestra salas con nombre, jugadores y estado', async () => {
    const a = client();
    await call(a, 'room:create', { name: 'Pública de prueba', profile: profile('Lista') });
    const res = await call(a, 'lobby:list');
    expect(res.rooms.some((r) => r.name === 'Pública de prueba' && r.status === 'lobby' && r.players === 1)).toBe(true);
    a.disconnect();
  });
});

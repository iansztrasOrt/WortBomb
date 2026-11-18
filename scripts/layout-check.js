// Control visual de la rondita: llena una sala con bots (2, 3, 6, 10 y 16 jugadores), la mira desde
// una compu y desde un celular, y mide en el navegador que NADA se superponga (avatares, nombres,
// corazones, bomba, sílaba, mecha y texto en vivo). Guarda capturas layout-*.png.
// Uso: node scripts/layout-check.js   (necesita Playwright)
import { io as connect } from 'socket.io-client';
import { createServer } from '../server/index.js';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright/index.mjs'));
}
const quiet = { debug() {}, info() {}, error: console.error };
const srv = await createServer({ port: 0, log: quiet, reportsFile: '/tmp/wortbomb-layout-reports.jsonl', rates: { roomsPerIpPerMinute: 1000 } });
const URL = `http://localhost:${srv.port}`;
const NAMES = ['Ramona', 'Tito', 'Maximiliano', 'Chiqui', 'Pocho', 'Mirta', 'Coco', 'Beba', 'Tano', 'Nené', 'Toto', 'Cacho', 'Pirucha', 'Lalo', 'Fito'];
const COLORS = ['#ff5d5d', '#ff9f43', '#ffd23f', '#3ddc97', '#2ec4b6', '#4d96ff', '#9b5de5', '#f15bb5'];
const call = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));

const browser = await chromium.launch();
const VIEWS = [
  { name: 'compu', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { name: 'celu', viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const problems = [];

// Mide superposiciones dentro de la arena.
const measure = () => {
  const arena = document.querySelector('.arena');
  const rect = (e) => {
    const r = e.getBoundingClientRect();
    return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, w: r.width, h: r.height };
  };
  const items = [];
  const a = rect(arena);
  for (const seat of document.querySelectorAll('.seat:not(.leaving)')) {
    const id = seat.dataset.id;
    const svg = seat.querySelector('.av-wrap svg');
    items.push({ kind: 'avatar', id, r: rect(svg), round: true });
    const name = seat.querySelector('.name');
    if (name && name.offsetParent) items.push({ kind: 'nombre', id, r: rect(name) });
    const hearts = seat.querySelector('.hearts');
    if (hearts && getComputedStyle(hearts).display !== 'none') items.push({ kind: 'corazones', id, r: rect(hearts) });
  }
  const bomb = document.querySelector('.bomb:not(.gone)');
  const activeId = document.querySelector('.seat.active')?.dataset.id;
  if (bomb) items.push({ kind: 'bomba', id: activeId, r: rect(bomb.querySelector('circle.body')) , round: true });
  for (const sel of ['.center .syllable', '.center .fuse-bar', '.center .live', '.center .whose', '.center .clock']) {
    const e = document.querySelector(sel);
    if (e && e.offsetParent && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none') items.push({ kind: sel.replace('.center .', 'centro:'), id: 'centro', r: rect(e) });
  }
  const bad = [];
  const shrink = (r, k) => ({ x0: r.x0 + k, x1: r.x1 - k, y0: r.y0 + k, y1: r.y1 - k });
  for (const it of items) {
    if (it.r.x0 < a.x0 - 1 || it.r.x1 > a.x1 + 1 || it.r.y0 < a.y0 - 1 || it.r.y1 > a.y1 + 1) bad.push(`${it.kind} ${it.id} se sale de la arena`);
  }
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const p = items[i];
      const q = items[j];
      if (p.id === q.id && p.id !== 'centro' && p.kind !== 'bomba' && q.kind !== 'bomba') continue; // partes del mismo asiento
      if (p.id === 'centro' && q.id === 'centro') continue;
      if ((p.kind === 'bomba' && q.kind === 'avatar' && q.id === p.id) || (q.kind === 'bomba' && p.kind === 'avatar' && p.id === q.id)) continue; // la bomba toca a su jugador
      // los círculos se miden como círculos (la caja de un círculo tiene esquinas vacías)
      if (p.round && q.round) {
        const d = Math.hypot((p.r.x0 + p.r.x1) / 2 - (q.r.x0 + q.r.x1) / 2, (p.r.y0 + p.r.y1) / 2 - (q.r.y0 + q.r.y1) / 2);
        if (d < (p.r.w + q.r.w) / 2 - 2) bad.push(`${p.kind} ${p.id} pisa ${q.kind} ${q.id}`);
        continue;
      }
      const A = shrink(p.r, 1);
      const B = shrink(q.r, 1);
      if (A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1) {
        // círculo contra rectángulo: distancia real
        const c = p.round ? p : q.round ? q : null;
        const rc = c === p ? q : p;
        if (c) {
          const cx = (c.r.x0 + c.r.x1) / 2;
          const cy = (c.r.y0 + c.r.y1) / 2;
          const nx = Math.max(rc.r.x0, Math.min(cx, rc.r.x1));
          const ny = Math.max(rc.r.y0, Math.min(cy, rc.r.y1));
          if (Math.hypot(cx - nx, cy - ny) >= c.r.w / 2 - 1) continue;
        }
        bad.push(`${p.kind} ${p.id} pisa ${q.kind} ${q.id}`);
      }
    }
  }
  return { count: document.querySelectorAll('.seat:not(.leaving)').length, bad };
};

for (const view of VIEWS) {
  for (const n of [2, 3, 6, 10, 16]) {
    const ctx = await browser.newContext({ ...view });
    await ctx.addInitScript(() => {
      localStorage.setItem('wortbomb.tutorialDone', 'true');
      localStorage.setItem('wortbomb.profile', JSON.stringify({ name: 'Yo mismo', avatar: { color: '#9b5de5', face: 'feliz', accessory: 'corona' } }));
      localStorage.setItem('wortbomb.audio', JSON.stringify({ muted: true, volume: 0 }));
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${view.name} n=${n}: ${e.message}`));
    await page.goto(URL);
    await page.click('text=Crear sala');
    await page.click('form.modal button[type=submit]');
    await page.waitForSelector('.lobby');
    const code = (await page.textContent('.chip b')).trim();
    await page.fill('input[data-key=startLives]', '5');
    await page.fill('input[data-key=maxLives]', '5');
    await page.fill('input[data-key=fuseInitial]', '30');
    await page.fill('input[type=number][max="16"]', '16');
    await page.click('text=Guardar ajustes');
    const bots = [];
    for (let i = 0; i < n - 1; i += 1) {
      const s = connect(URL, { transports: ['websocket'], forceNew: true });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => s.on('connect', r));
      // eslint-disable-next-line no-await-in-loop
      const res = await call(s, 'room:join', { code, profile: { name: NAMES[i % NAMES.length], avatar: { color: COLORS[i % COLORS.length], face: 'feliz', accessory: i % 3 ? 'nada' : 'gorra' } } });
      if (!res.ok) problems.push(`bot ${i}: ${res.error}`);
      bots.push(s);
    }
    await page.waitForFunction((k) => document.querySelectorAll('.pcard').length === k, n);
    await page.click('text=¡Empezar!');
    await page.waitForSelector('.game .seat');
    // turnos: el bot activo escribe algo en vivo; después medimos con distintos jugadores activos
    for (let round = 0; round < 3; round += 1) {
      await page.waitForTimeout(700);
      const m = await page.evaluate(measure);
      if (m.count !== n) problems.push(`${view.name} n=${n}: se ven ${m.count} asientos`);
      for (const b of m.bad) problems.push(`${view.name} n=${n} vuelta ${round}: ${b}`);
      if (round === 1) await page.screenshot({ path: `layout-${view.name}-${n}.png` });
      // pasar el turno: si le toca a un bot, que mande una palabra válida
      const st = await page.evaluate(() => window.__wb.S.room.game.turn);
      const me = await page.evaluate(() => window.__wb.S.room.you);
      if (st.playerId === me) {
        const w = [...srv.dict.words()].find((x) => x.length > 4 && x.length < 9 && x.includes(st.syllable) && !srv.manager.get(code).game.used.has(x));
        await page.keyboard.type(w); // sin hacer clic: el campo ya tiene el foco
        await page.keyboard.press('Enter');
      } else {
        const sock = bots.find((b) => srv.manager.get(code).members.get(st.playerId)?.token === b.auth?.token) || null;
        const room = srv.manager.get(code);
        const w = [...srv.dict.words()].find((x) => x.length > 4 && x.length < 9 && x.includes(st.syllable) && !room.game.used.has(x));
        room.typing(st.playerId, w.slice(0, 5));
        await page.waitForTimeout(150);
        const m2 = await page.evaluate(measure);
        for (const b of m2.bad) problems.push(`${view.name} n=${n} escribiendo: ${b}`);
        room.submit(st.playerId, w);
        if (!sock) { /* el bot no necesita socket para jugar por el servidor */ }
      }
    }
    bots.forEach((b) => b.disconnect());
    await ctx.close();
    console.log(`${view.name} n=${n}: ok`);
  }
}

// Escribir directo: el jugador local, cuando le toca, escribe sin hacer clic en ningún lado.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('wortbomb.tutorialDone', 'true');
    localStorage.setItem('wortbomb.profile', JSON.stringify({ name: 'Directo', avatar: { color: '#4d96ff', face: 'feliz', accessory: 'nada' } }));
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.click('text=Crear sala');
  await page.click('form.modal button[type=submit]');
  await page.waitForSelector('.lobby');
  const code = (await page.textContent('.chip b')).trim();
  const bot = connect(URL, { transports: ['websocket'], forceNew: true });
  await new Promise((r) => bot.on('connect', r));
  await call(bot, 'room:join', { code, profile: { name: 'Bot', avatar: {} } });
  await page.waitForFunction(() => document.querySelectorAll('.pcard').length === 2);
  await page.click('text=¡Empezar!');
  await page.waitForSelector('.game .seat');
  const room = srv.manager.get(code);
  let mine = 0;
  for (let i = 0; i < 6; i += 1) {
    const st = room.game.turn;
    const me = await page.evaluate(() => window.__wb.S.room.you);
    const w = [...srv.dict.words()].find((x) => x.length > 4 && x.length < 9 && x.includes(st.syllable) && !room.game.used.has(x));
    if (st.playerId === me) {
      // el foco está en otro lado (en el chat): igual las letras van a la palabra
      mine += 1;
      const chatFirst = mine === 2;
      if (chatFirst) await page.click('.chat-form input');
      // y además: lo resaltado y el aviso de turno tienen que estar
      const mineCls = await page.evaluate(() => document.querySelector('.word-input').classList.contains('mine'));
      if (!mineCls) problems.push('el campo no se resalta cuando te toca');
      await page.keyboard.type(w);
      await page.keyboard.press('Enter');
      await page.waitForFunction((n) => window.__wb.S.room.game.turn?.n > n, st.n);
      console.log(`escribir directo (turno ${st.n}${chatFirst ? ', con el foco puesto en el chat' : ''}): ok`);
    } else {
      room.submit(st.playerId, w);
      await page.waitForTimeout(300);
    }
  }
  bot.disconnect();
  await ctx.close();
}

await browser.close();
await srv.close();
if (problems.length) {
  console.log(`\nPROBLEMAS (${problems.length}):\n${[...new Set(problems)].slice(0, 60).join('\n')}`);
  process.exit(1);
}
console.log('\nNada se superpone en ninguna combinación ✓');
process.exit(0);

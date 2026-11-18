// Prueba de punta a punta con navegadores reales (necesita Playwright: npm i -D playwright).
// Tres "pestañas" (dos del mismo navegador y una de otro), crean y se unen a una sala, juegan
// varios turnos (incluida una palabra repetida), dejan explotar la bomba y llegan a los resultados.
// Guarda capturas en ./e2e-*.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server/index.js';
import { normalizeWord } from '../engine/normalize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright/index.mjs'));
}

const quiet = { debug() {}, info() {}, error: console.error };
const srv = await createServer({ port: 0, log: quiet, reportsFile: '/tmp/wortbomb-e2e-reports.jsonl', rates: { roomsPerIpPerMinute: 1000 } });
const URL = `http://localhost:${srv.port}`;
// Palabras comunes para jugar (de la lista de frecuencias, si está; si no, del diccionario).
const freqFile = path.join(ROOT, 'data/sources/es_full.txt');
const common = fs.existsSync(freqFile)
  ? fs.readFileSync(freqFile, 'utf8').split('\n').slice(0, 40000).map((l) => normalizeWord(l.split(' ')[0])).filter((w) => w.length >= 4 && srv.dict.has(w))
  : [...srv.dict.words()].filter((w) => w.length >= 5).slice(0, 200000);
const usedHere = new Set();
const wordFor = (syl) => {
  const w = common.find((x) => x.includes(syl) && !usedHere.has(x));
  usedHere.add(w);
  return w;
};

const browser = await chromium.launch();
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  return p;
};
const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const A = watch(await ctx1.newPage(), 'A');
const B = watch(await ctx1.newPage(), 'B'); // misma "ventana" que A (otra pestaña)
const C = watch(await ctx2.newPage(), 'C'); // celular
const pages = { A, B, C };
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await A.goto(URL);
await A.waitForSelector('.tutorial');
await A.screenshot({ path: 'e2e-tutorial.png' });
await A.keyboard.press('Escape');
await A.fill('#nick', 'Ana');
await A.screenshot({ path: 'e2e-inicio.png' });
await A.click('text=Crear sala');
await A.click('form.modal button[type=submit]');
await A.waitForSelector('.lobby');
const code = (await A.textContent('.chip b')).trim();
log('sala', code);

// B: otra pestaña del mismo navegador. Ya tiene apodo y vio el tutorial: con el link entra sola
// (el servidor le da otra sesión porque la de A está en uso).
await B.goto(`${URL}/sala/${code}`);
await B.waitForSelector('.lobby');
// C: un celular nuevo
await C.goto(`${URL}/sala/${code}`);
await C.waitForSelector('.tutorial');
await C.keyboard.press('Escape');
await C.fill('#nick', 'Caro');
await C.click('.join-row button');
await C.waitForSelector('.lobby');
await A.waitForFunction(() => document.querySelectorAll('.pcard').length === 3);
log('3 jugadores en la sala:', await A.$$eval('.pcard .nm', (e) => e.map((x) => x.textContent)).then((n) => n.join(', ')));
// el líder acorta la mecha para que la prueba no tarde
await A.fill('input[data-key=fuseInitial]', '6');
await A.fill('input[data-key=fuseMin]', '3');
await A.fill('input[data-key=startLives]', '1');
await A.click('text=Guardar ajustes');
await sleep(300);
await A.screenshot({ path: 'e2e-sala.png' });
await A.click('text=¡Empezar!');
for (const p of Object.values(pages)) await p.waitForSelector('.game .arena .seat');
log('partida empezada en las 3');

const state = async (p) => p.evaluate(() => {
  const s = window.__wb?.S?.room;
  return s ? { you: s.you, turn: s.game?.turn, status: s.status } : null;
});
async function activePage() {
  const st = await state(A);
  for (const p of Object.values(pages)) if ((await state(p)).you === st.turn.playerId) return { p, turn: st.turn };
  return null;
}

// Tres turnos acertados
let firstWord = null;
for (let i = 0; i < 3; i += 1) {
  const { p, turn } = await activePage();
  const w = wordFor(turn.syllable);
  firstWord = firstWord || w;
  await p.fill('.word-input input', w.toUpperCase());
  if (i === 1) await sleep(900);
  if (i === 1) await A.screenshot({ path: 'e2e-partida.png' });
  await p.press('.word-input input', 'Enter');
  await A.waitForFunction((n) => window.__wb.S.room.game.turn?.n > n, turn.n);
  log(`turno ${turn.n}: "${turn.syllable}" → ${w}`);
}
// Palabra repetida (si contiene la sílaba nueva) o una inexistente
{
  const { p, turn } = await activePage();
  const repeat = [...usedHere].find((w) => w && w.includes(turn.syllable));
  await p.fill('.word-input input', repeat || `${turn.syllable}zzqx`);
  await p.press('.word-input input', 'Enter');
  await p.waitForSelector('.msg-line.bad');
  log(`rechazo: "${await p.textContent('.msg-line')}"`);
  await C.screenshot({ path: 'e2e-celular.png' });
  // ahora nadie escribe: la bomba explota → con 1 vida, queda eliminado
  await sleep(Math.max(0, turn.deadline - Date.now()) + 150);
  await A.screenshot({ path: 'e2e-explosion.png' });
}
// esperar a que alguien quede eliminado y luego dejar que explote todo hasta el final
await A.waitForFunction(() => window.__wb.S.room.game.seats.filter((s) => !s.alive).length >= 1, null, { timeout: 15000 });
log('primer eliminado ✓');
await A.waitForFunction(() => window.__wb.S.room.status === 'results', null, { timeout: 30000 });
await A.waitForSelector('.results', { timeout: 5000 });
await sleep(1600);
await A.screenshot({ path: 'e2e-resultados.png' });
const winner = await A.evaluate(() => window.__wb.S.room.game.results.winner?.name);
log('ganó', winner);
// revancha: reinicia palabras usadas y reloj
await A.click('text=Jugar de nuevo');
await A.waitForFunction(() => window.__wb.S.room.status === 'playing' && window.__wb.S.room.game.usedCount === 0, null, { timeout: 5000 });
log('revancha: palabras usadas = 0 ✓');

console.log(errors.length ? `ERRORES:\n${errors.join('\n')}` : 'sin errores en consola');
await browser.close();
await srv.close();
process.exit(errors.length ? 1 : 0);

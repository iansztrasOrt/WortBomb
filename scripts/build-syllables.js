// Banco de sílabas: todas las subcadenas de 2 y 3 letras del diccionario, con la cantidad de
// palabras (de largo jugable) que contienen cada una. Salida: data/syllables.json
//   [{ "s": "ion", "n": 48211, "f": 1630, "c": [...] }, ...]   ordenado de más a menos frecuente
// Se descartan las que aparecen en menos de MIN_WORDS palabras (no sirven para jugar).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary } from '../engine/dictionary.js';
import { syllablesOf, normalizeWord } from '../engine/normalize.js';
import { DEFAULT_SETTINGS } from '../engine/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_WORDS = 10;
const minLen = DEFAULT_SETTINGS.minWordLength;

// Para cada sílaba se cuentan las palabras que la contienen según el largo mínimo de palabra
// que use la sala: c[0] = palabras de 2+ letras, c[1] = 3+, ... c[6] = 8+ (ajuste minWordLength).
const LENS = [2, 3, 4, 5, 6, 7, 8];
const t0 = Date.now();
const dict = loadDictionary();
const counts = new Map();
let words = 0;
for (const w of dict.words()) {
  words += 1;
  const top = Math.min(w.length, 8) - 2; // índice máximo de c[] al que suma esta palabra
  for (const s of syllablesOf(w)) {
    let c = counts.get(s);
    if (!c) counts.set(s, (c = new Array(LENS.length).fill(0)));
    for (let i = 0; i <= top; i += 1) c[i] += 1;
  }
}
// "f": en cuántas de las 30.000 palabras más usadas del español hablado aparece (lista de
// frecuencias de OpenSubtitles). Sirve para que al principio salgan sílabas que a la gente se le
// ocurren rápido, no solo las que tienen muchas formas raras en el diccionario.
const freqFile = path.join(ROOT, 'data/sources/es_full.txt');
const frequent = [];
if (fs.existsSync(freqFile)) {
  for (const line of fs.readFileSync(freqFile, 'utf8').split('\n')) {
    const w = normalizeWord(line.slice(0, line.lastIndexOf(' ')));
    if (w.length >= minLen && dict.has(w)) frequent.push(w);
    if (frequent.length >= 30000) break;
  }
}
const freqCount = new Map();
for (const w of frequent) for (const s of syllablesOf(w)) freqCount.set(s, (freqCount.get(s) || 0) + 1);

const idx = minLen - 2;
const list = [...counts].filter(([, c]) => c[0] >= MIN_WORDS)
  .sort((a, b) => b[1][idx] - a[1][idx] || a[0].localeCompare(b[0]))
  .map(([s, c]) => ({ s, n: c[idx], f: frequent.length ? freqCount.get(s) || 0 : c[idx], c }));
fs.writeFileSync(path.join(ROOT, 'data/syllables.json'), `[\n${list.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`);

const tiers = [[1000, Infinity], [300, 1000], [50, 300], [10, 50]];
console.log(`${words} palabras → ${list.length} sílabas útiles en ${Date.now() - t0} ms (n = palabras de ${minLen}+ letras)`);
for (const [lo, hi] of tiers) {
  const t = list.filter((x) => x.n >= lo && x.n < hi);
  console.log(`  ${lo}–${hi === Infinity ? '∞' : hi} palabras: ${t.length} sílabas · ej: ${t.slice(0, 8).map((x) => x.s).join(', ')}`);
}

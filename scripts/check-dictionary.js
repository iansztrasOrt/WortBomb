// Control de calidad del diccionario. Corre solo con: npm run check:dict  (y al final de build:dict).
//
// Pasadas:
//  1. Tamaño y distribución por largo.
//  2. Ortografía: busca combinaciones de letras imposibles en español.
//  3. Lista de control positiva (data/control-words.txt): palabras comunes que TIENEN que estar.
//  4. Lista de control negativa (data/control-misspellings.txt): errores que NO tienen que estar.
//  5. Categorías: conjugaciones, voseo, enclíticos, plurales y femeninos, ñ/ü, regionalismos.
//  6. Memoria que ocupa el diccionario cargado.
// Sale con código 1 si la cobertura baja del umbral o si se cuela algún error de la lista negativa.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWord } from '../engine/normalize.js';
import { loadDictionary, DICTIONARY_FILES } from '../engine/dictionary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const MIN_COVERAGE = Number(process.env.MIN_COVERAGE || 0.99);
const list = (f) => fs.readFileSync(path.join(DATA, f), 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
let failed = false;
const fail = (msg) => {
  failed = true;
  console.log(`  ✗ ${msg}`);
};

// ---------------------------------------------------------------- 1) carga, tamaño y memoria
global.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
const t0 = Date.now();
const dict = loadDictionary();
const ms = Date.now() - t0;
global.gc?.();
const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1048576;
console.log('\n== 1. Tamaño');
console.log(`  ${dict.size.toLocaleString('es-AR')} palabras en ${DICTIONARY_FILES.map((f) => path.basename(f)).join(' + ')}`);
console.log(`  carga: ${ms} ms · memoria: ~${heapMb.toFixed(0)} MB${global.gc ? '' : ' (aprox.; con --expose-gc es exacto)'}`);
const byLen = new Map();
for (const w of dict.words()) byLen.set(w.length, (byLen.get(w.length) || 0) + 1);
const lens = [...byLen.keys()].sort((a, b) => a - b);
console.log(`  por largo: ${lens.map((l) => `${l}:${byLen.get(l)}`).join(' ')}`);

// ---------------------------------------------------------------- 2) ortografía
console.log('\n== 2. Ortografía (combinaciones imposibles en español)');
const RULES = [
  [/(.)\1\1/, 'tres letras iguales seguidas', true],
  [/q(?!u)/, 'q sin u', true],
  [/^[^aeiouy]+$/, 'sin vocales', true],
  [/[^aeiouy]{5}/, 'cinco consonantes seguidas', true],
  [/qu[aou]/, 'qu + a/o/u', false],
  [/nb/, 'nb (va mb)', false],
  [/([bdfgjkmpstvwxz])\1/, 'consonante doble poco común', false],
];
const hits = RULES.map(() => []);
for (const w of dict.words()) RULES.forEach(([re], i) => { if (re.test(w)) hits[i].push(w); });
RULES.forEach(([, name, hard], i) => {
  const h = hits[i];
  const line = `${name}: ${h.length}${h.length ? ` · ${h.slice(0, 8).join(', ')}` : ''}`;
  if (hard && h.length) fail(line);
  else console.log(`  ${h.length ? '·' : '✓'} ${line}${!hard && h.length ? '  (préstamos y compuestos válidos: subbase, pizza, quórum...)' : ''}`);
});

// ---------------------------------------------------------------- 3) lista de control positiva
console.log('\n== 3. Lista de control (palabras comunes que tienen que estar)');
const control = list('control-words.txt');
const missing = control.filter((w) => !dict.has(normalizeWord(w)));
const coverage = 1 - missing.length / control.length;
const covLine = `cobertura ${(coverage * 100).toFixed(1)}% (${control.length - missing.length}/${control.length}, mínimo ${(MIN_COVERAGE * 100).toFixed(0)}%)${missing.length ? ` · faltan: ${missing.join(', ')}` : ''}`;
if (coverage < MIN_COVERAGE) fail(covLine);
else console.log(`  ✓ ${covLine}`);

// ---------------------------------------------------------------- 4) lista negativa
console.log('\n== 4. Errores de ortografía que NO tienen que estar');
const bad = list('control-misspellings.txt');
const accepted = bad.filter((w) => dict.has(normalizeWord(w)));
if (accepted.length) fail(`se aceptan ${accepted.length} errores: ${accepted.join(', ')}`);
else console.log(`  ✓ los ${bad.length} errores se rechazan (haigan, nadien, llendo, estubo, hicistes, dijistes...)`);

// ---------------------------------------------------------------- 5) categorías
console.log('\n== 5. Categorías');
const CATEGORIES = {
  'conjugaciones': 'cantaríamos hubiésemos dijeron trajimos supieron anduve condujo cupiera oyendo leyendo huyó produjeron cabremos satisfice yendo erguido podrías haríamos',
  'voseo': 'tenés sos querés podés sabés andá vení decime hacelo poneme andate fijate escuchame bancame decímelo dormís pedís seguís',
  'enclíticos': 'dámelo díselo hagámoslo vámonos traémelo comiéndoselo diciéndome sentate ponme mantenlo ríndete síganme dímelo vete seguirle',
  'plurales y femeninos': 'canciones lápices peces luces actrices leones ratones casas maestras doctoras jueces reyes pies menús sofás',
  'ñ y ü': 'montaña niño año señora pañuelo ñandú cañón ñoqui pingüino cigüeña vergüenza agüita lingüística bilingüe',
  'diminutivos y aumentativos': 'casita perrito cafecito pancito abuelita grandote cosita amiguito osito cabecita pueblito golpazo poquito',
  'regionalismos': 'pibe piba laburo laburar bondi fiaca chamba chido güey guagua chévere bacán parcero chamo pollera heladera frutilla palta choclo',
};
for (const [cat, words] of Object.entries(CATEGORIES)) {
  const ws = words.split(' ');
  const miss = ws.filter((w) => !dict.has(normalizeWord(w)));
  console.log(`  ${miss.length ? '·' : '✓'} ${cat}: ${ws.length - miss.length}/${ws.length}${miss.length ? ` · faltan: ${miss.join(', ')}` : ''}`);
}
// La ñ no equivale a n.
for (const [a, b] of [['año', 'ano'], ['niño', 'nino'], ['peña', 'pena']]) {
  const same = normalizeWord(a) === normalizeWord(b);
  if (same) fail(`"${a}" y "${b}" se normalizan igual`);
}
console.log('  ✓ la ñ es una letra distinta de la n (año ≠ ano)');

console.log(failed ? '\nRESULTADO: FALLÓ\n' : '\nRESULTADO: OK\n');
process.exit(failed ? 1 : 0);

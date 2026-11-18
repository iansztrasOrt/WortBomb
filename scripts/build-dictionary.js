// Genera el diccionario de wORTbomb a partir de fuentes de licencia libre.
//
// Salida (una palabra normalizada por línea, ordenada, sin duplicados):
//   data/dictionary.es.txt       núcleo: LibreOffice/RLA-ES (todas las variantes regionales, expandidas),
//                                lista Letterpress, voseo con enclíticos,
//                                regionalismos de extra-lemmas.txt y extra-words.txt
//   data/dictionary.es-uso.txt   formas derivadas (diminutivos, aumentativos, -ísimo, -mente, prefijos,
//                                enclíticos) que NO están en el núcleo pero sí aparecen usadas en la
//                                lista de frecuencias de OpenSubtitles (CC BY-SA 4.0). Va en archivo
//                                aparte porque tiene otra licencia.
//
// Uso: npm run build:dict   (necesita las devDependencies instaladas: npm install)
// Fuentes y licencias: ver README.md, sección "Diccionario".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWord, isNormalizedWord } from '../engine/normalize.js';
import { parseAff, parseDic, expandEntry } from './hunspell.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const SOURCES = path.join(DATA, 'sources');
const FREQ_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_full.txt';
const EN_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';
const MIN_LEN = 2; // se guardan desde 2 letras; el largo mínimo de juego (3) es un ajuste de sala
const FREQ_MIN_COUNT = 5; // apariciones mínimas en subtítulos para aceptar un enclítico
const FREQ_AFFIX_COUNT = 15; // y para aceptar un diminutivo, aumentativo, -mente o prefijo

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const readLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : []);
const cleanList = (file) => readLines(file).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
const ok = (w) => isNormalizedWord(w) && w.length >= MIN_LEN;

// Reglas de ortografía española que ninguna palabra bien escrita rompe. Se aplican a todo lo que
// NO viene directamente de los diccionarios de LibreOffice (que ya son de corrector ortográfico).
export const ORTHO_HARD = [
  [/(.)\1\1/, 'tres letras iguales seguidas'],
  [/q(?!u)/, 'q sin u'],
  [/qu[aou]/, 'qu + a/o/u'],
  [/^[^aeiouy]+$/, 'sin vocales'],
  [/[^aeiouy]{5}/, 'cinco consonantes seguidas'],
  [/nb|np(?!ens)/, 'n antes de b/p (va m)'],
  [/(?:^|[^aeiou])y(?:[^aeiou]|$)(?<!^y)/, 'y entre consonantes'],
  [/([bdfgjkmpstvwxz])\1/, 'consonante doble que no existe en español'],
];
const orthoOk = (w) => !ORTHO_HARD.some(([re]) => re.test(w));
const rejected = new Map(); // motivo → ejemplos
function guard(w, source) {
  if (orthoOk(w)) return true;
  const why = ORTHO_HARD.find(([re]) => re.test(w))[1];
  const k = `${source}: ${why}`;
  if (!rejected.has(k)) rejected.set(k, []);
  rejected.get(k).push(w);
  return false;
}

// ---------------------------------------------------------------- 1) LibreOffice / RLA-ES
const DICT_PACKAGES = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies || {})
  .filter((p) => /^dictionary-es(-[a-z]{2})?$/.test(p));
if (!DICT_PACKAGES.length) throw new Error('Faltan los paquetes dictionary-es*: corré npm install (con devDependencies).');

const core = new Set();
const tiers = { letterpress: new Set(), voseo: new Set() }; // para auditar (AUDIT=1)
const lemmaFlags = new Map(); // lema → [{ aff, flags }]  (para extra-lemmas)
const properNouns = new Set();
const verbs = new Set(); // infinitivos que de verdad se conjugan
const verbForms = new Set(); // todas las formas de esos verbos (para validar enclíticos)

for (const pkg of DICT_PACKAGES) {
  const dir = path.join(ROOT, 'node_modules', pkg);
  const aff = parseAff(fs.readFileSync(path.join(dir, 'index.aff'), 'utf8'));
  const entries = parseDic(fs.readFileSync(path.join(dir, 'index.dic'), 'utf8'));
  let before = core.size;
  for (const { word, flags } of entries) {
    if (word[0] !== word[0].toLowerCase()) {
      // Nombres propios y siglas: no se agregan; se recuerdan para filtrar la lista de frecuencias.
      properNouns.add(normalizeWord(word));
      continue;
    }
    if (!lemmaFlags.has(word)) lemmaFlags.set(word, []);
    lemmaFlags.get(word).push({ aff, flags });
    const forms = expandEntry(aff, word, flags);
    for (const f of forms) {
      const n = normalizeWord(f);
      if (ok(n)) core.add(n);
    }
    const n = normalizeWord(word);
    // Es verbo si es un infinitivo con muchas formas y algún gerundio (vale para irregulares: siguiendo, pidiendo).
    if (/[aeií]r$/.test(word) && forms.size >= 20 && [...forms].some((f) => f.endsWith('ndo'))) {
      verbs.add(n);
      for (const f of forms) verbForms.add(normalizeWord(f));
    }
  }
  log(`${pkg}: ${entries.length} entradas → +${core.size - before} formas (total ${core.size})`);
}

// Abreviaturas sin punto (izq, apdo, km...) y entradas imposibles en español (sin vocales, q sin u).
const abbreviations = new Set(cleanList(path.join(DATA, 'abbreviations.txt')).flatMap((l) => l.split(/\s+/)).map(normalizeWord));
let dropped = 0;
for (const w of [...core]) {
  if (abbreviations.has(w) || /q(?!u)/.test(w) || /^[^aeiouy]+$/.test(w)) {
    core.delete(w);
    dropped += 1;
  }
}
log(`abreviaturas y entradas sin vocales quitadas: ${dropped}`);

// Copia del conjunto "de corrector ortográfico" (sirve para no tocar sus formas en filtros posteriores).
const hunspellSet = new Set(core);

// ---------------------------------------------------------------- 2) Regionalismos (extra-lemmas.txt)
let lemmaCount = 0;
for (const line of cleanList(path.join(DATA, 'extra-lemmas.txt'))) {
  const [lemma, model] = line.split('=').map((s) => s.trim());
  const variants = lemmaFlags.get(model);
  if (!lemma || !variants) {
    console.warn(`  ⚠ extra-lemmas: no encontré el modelo "${model}" para "${lemma}"`);
    continue;
  }
  for (const { aff, flags } of variants) {
    for (const f of expandEntry(aff, lemma, flags)) {
      const n = normalizeWord(f);
      if (ok(n)) core.add(n);
    }
  }
  const n = normalizeWord(lemma);
  if (verbs.has(normalizeWord(model))) verbs.add(n);
  lemmaCount += 1;
}
log(`extra-lemmas: ${lemmaCount} lemas regionales (total ${core.size})`);

// Palabras inglesas frecuentes (para que no se cuelen anglicismos crudos de las listas secundarias).
async function fetchCached(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return fs.readFileSync(file, 'utf8');
  log(`descargando ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}: ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}
let english = new Set();
try {
  english = new Set((await fetchCached(EN_URL, path.join(SOURCES, 'en_50k.txt'))).split('\n').slice(0, 30000).map((l) => l.split(' ')[0]));
} catch (err) {
  console.warn(`  ⚠ Sin lista de inglés (${err.message})`);
}

// ---------------------------------------------------------------- 3) Lista Letterpress (MIT)
const letterpress = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/an-array-of-spanish-words/index.json'), 'utf8'));
let before = core.size;
for (const w of letterpress) {
  const n = normalizeWord(w);
  if (ok(n) && !core.has(n) && !english.has(n) && guard(n, 'letterpress')) {
    core.add(n);
    tiers.letterpress.add(n);
  }
}
log(`an-array-of-spanish-words: ${letterpress.length} → +${core.size - before}`);

// ---------------------------------------------------------------- 4) Voseo con enclíticos
// Imperativo voseante = infinitivo sin la r (mandá, poné, decí) + pronombres: mandale, poneme, decímelo.
// Presente voseante de los verbos en -ir: decís, venís, salís (los de -ar/-er coinciden sin tildes con tú).
// Combinaciones de pronombres que existen: me/te/nos + lo/la/los/las ("decímelo"),
// y se + lo/la/los/las/le/les/me/te/nos ("andásele", "pasásela"). El voseo no usa "os".
const CLITIC1 = ['me', 'te', 'le', 'lo', 'la', 'nos', 'les', 'los', 'las', 'se'];
const CLITIC2 = [];
for (const a of ['me', 'te', 'nos']) for (const b of ['lo', 'la', 'los', 'las']) CLITIC2.push(a + b);
for (const b of ['lo', 'la', 'los', 'las', 'le', 'les', 'me', 'te', 'nos']) CLITIC2.push(`se${b}`);
before = core.size;
for (const inf of verbs) {
  if (inf.length < 3 || inf === 'ir') continue;
  const stem = inf.slice(0, -1); // manda, pone, deci
  const add = (w) => {
    if (guard(w, 'voseo')) {
      if (!core.has(w)) tiers.voseo.add(w);
      core.add(w);
      verbForms.add(w);
    }
  };
  add(stem);
  for (const c of CLITIC1) add(stem + c);
  for (const c of CLITIC2) add(stem + c);
  if (inf.endsWith('ir')) add(`${stem}s`);
}
log(`voseo: ${verbs.size} verbos → +${core.size - before}`);

// ---------------------------------------------------------------- 5) Diminutivos y aumentativos
// No se generan a ciegas (salen formas que no existen o con el género cambiado, como
// "despotismitas"). Los que valen ya están en los diccionarios o se agregan en el paso 8
// solo si aparecen usados de verdad.

// ---------------------------------------------------------------- 6) extra-words.txt
for (const w of cleanList(path.join(DATA, 'extra-words.txt'))) {
  const n = normalizeWord(w);
  if (ok(n)) core.add(n);
}

// ---------------------------------------------------------------- 7) Pretéritos con -s agregada ("hicistes")
// Formas vulgares de 2.ª persona del pretérito: cantastes, dijistes, hicistes, fuistes, vistes.
// Se reconocen porque existe la 3.ª persona plural del mismo pretérito (cantaron, dijeron, hicieron).
// No se tocan presentes que terminan igual (insistes, existes, vistes de "vestir" sí sale: vieron).
function vulgarPreterite(w, set) {
  if (hunspellSet.has(w)) return false; // LibreOffice nunca trae estas formas: lo que trae es legítimo (alistes, bastes, asistes)
  for (const [end, base] of [['astes', 'aste'], ['istes', 'iste']]) {
    if (!w.endsWith(end)) continue;
    const x = w.slice(0, -end.length);
    // Es pretérito si existen "-aste" y "-asteis" (cantaste, cantasteis) o "-iste" e "-isteis".
    const plural = end === 'astes' ? [`${x}aron`] : [`${x}ieron`, `${x}eron`, `${x}yeron`];
    if (set.has(x + base) && set.has(`${x + base}is`) && plural.some((p) => set.has(p))) return true;
  }
  return false;
}
const vulgar = [...core].filter((w) => vulgarPreterite(w, core));
for (const w of vulgar) core.delete(w);
log(`pretéritos vulgares en -stes quitados: ${vulgar.length} (ej: ${vulgar.slice(0, 6).join(', ')})`);

// ---------------------------------------------------------------- 8) blocklist
const blocked = new Set([...cleanList(path.join(DATA, 'blocklist.txt')).map(normalizeWord), ...abbreviations]);
for (const w of blocked) core.delete(w);
log(`núcleo: ${core.size} formas`);

// ---------------------------------------------------------------- 9) Formas atestiguadas por uso (CC BY-SA 4.0)
const uso = new Set();
// Nombres propios que NO son también palabras comunes ("Jorge" sí; "Grande" o "Pan" no).
const properOnly = new Set([...properNouns].filter((w) => !core.has(w)));
try {
  const freq = (await fetchCached(FREQ_URL, path.join(SOURCES, 'es_full.txt'))).split('\n');
  const freqOf = new Map();
  for (const line of freq) {
    const sp = line.lastIndexOf(' ');
    if (sp > 0) {
      const k = normalizeWord(line.slice(0, sp));
      if (!freqOf.has(k)) freqOf.set(k, Number(line.slice(sp + 1)));
    }
  }
  const fq = (w) => freqOf.get(w) || 0;
  // Errores de tipeo típicos del español: si cambiando UNA de estas letras sale una palabra del
  // núcleo mucho más usada, la forma se descarta (nececito → necesito, enpezar → empezar).
  const CONFUSIONS = [['s', 'c'], ['c', 's'], ['s', 'z'], ['z', 's'], ['c', 'z'], ['z', 'c'], ['b', 'v'], ['v', 'b'], ['y', 'll'], ['ll', 'y'],
    ['g', 'j'], ['j', 'g'], ['x', 'cc'], ['cc', 'x'], ['i', 'y'], ['y', 'i'], ['k', 'qu'], ['k', 'c']];
  function probableTypo(w) {
    const mine = fq(w);
    const variants = new Set();
    for (const [a, b] of CONFUSIONS) {
      for (let i = w.indexOf(a); i >= 0; i = w.indexOf(a, i + 1)) variants.add(w.slice(0, i) + b + w.slice(i + a.length));
    }
    for (let i = 0; i <= w.length; i += 1) variants.add(`${w.slice(0, i)}h${w.slice(i)}`); // falta una h
    for (let i = w.indexOf('h'); i >= 0; i = w.indexOf('h', i + 1)) variants.add(w.slice(0, i) + w.slice(i + 1)); // sobra una h
    for (const v of variants) if (v !== w && core.has(v) && fq(v) >= Math.max(20 * mine, 200)) return v;
    return null;
  }
  const has = (w) => core.has(w);
  const SUFFIXES = [
    'ecitos', 'ecitas', 'ecito', 'ecita', 'citos', 'citas', 'cito', 'cita', 'itos', 'itas', 'ito', 'ita',
    'cillos', 'cillas', 'cillo', 'cilla', 'illos', 'illas', 'illo', 'illa', 'icos', 'icas', 'ico', 'ica',
    'ines', 'inas', 'in', 'ina', 'etes', 'etas', 'ete', 'eta', 'otes', 'otas', 'ote', 'ota',
    'azos', 'azas', 'azo', 'aza', 'ones', 'onas', 'on', 'ona', 'uchos', 'uchas', 'ucho', 'ucha',
    'isimos', 'isimas', 'isimo', 'isima', 'errimo', 'errima', 'ucos', 'ucas', 'uco', 'uca', 'ejos', 'ejas', 'ejo', 'eja',
  ];
  const PREFIXES = ['requete', 'super', 'ultra', 'mega', 'hiper', 'archi', 'extra', 'contra', 'sobre', 'semi', 'mini', 'micro', 'macro',
    'multi', 'pseudo', 'anti', 'auto', 'post', 'pre', 'pos', 'des', 're', 'ex', 'neo', 'sub', 'tele', 'eco', 'bio', 'geo'];
  const CLITICS = ['me', 'te', 'se', 'nos', 'os', 'le', 'les', 'lo', 'la', 'los', 'las'];

  // Los pronombres se pegan solo a infinitivos, gerundios e imperativos/subjuntivos
  // (decirle, diciéndole, decile, dígale, díganle). Nunca a "mano" (yo mano) ni a un pasado.
  // "te" y "os" van con tú/vos/vosotros: la base tiene que ser infinitivo, gerundio o imperativo
  // de esa persona (cállate = calla + te, vestite = vesti + te), no un subjuntivo de usted ("cállete").
  // ¿r es un subjuntivo de un verbo en -ar? (calle ← callar, pague ← pagar): entonces es "usted" y no lleva "te".
  const arSubjunctive = (r) => {
    if (!r.endsWith('e')) return false;
    let x = r.slice(0, -1);
    if (x.endsWith('qu')) x = `${x.slice(0, -2)}c`;
    else if (x.endsWith('gu')) x = x.slice(0, -1);
    else if (x.endsWith('c')) x = `${x.slice(0, -1)}z`;
    return verbs.has(`${x}ar`);
  };
  const IRREGULAR_TU = /(pon|ten|ven|sal|haz|^di|^ve|^se|^he)$/; // ponte, tenlo, vente, hazlo, dime, vete
  // r en -a: imperativo de tú (piensa, cuenta) salvo que sea subjuntivo de -er/-ir (coma, viva → usted).
  const erIrSubjunctive = (r) => r.endsWith('a') && (verbs.has(`${r.slice(0, -1)}er`) || verbs.has(`${r.slice(0, -1)}ir`));
  const familiar = (r) => /(r|ndo|i)$/.test(r) || (r.endsWith('a') && verbForms.has(r) && !erIrSubjunctive(r))
    || (r.endsWith('e') && !arSubjunctive(r)) || (r.endsWith('d') && verbs.has(`${r.slice(0, -1)}r`)) || IRREGULAR_TU.test(r);
  const cliticBase = (w) => (verbForms.has(w) && /(r|ndo|[aei]|[ae]n|[aei]d)$/.test(w) && !/(aste|iste|ste)$/.test(w)) || (has(w) && IRREGULAR_TU.test(w));
  const cliticOk = (r, c) => cliticBase(r) && (!/^(te|os)/.test(c) || familiar(r));
  const isVerb = (w) => verbForms.has(w);
  /** Frecuencia de la palabra común más usada de la que podría salir w por sufijo apreciativo. */
  function baseFreq(w) {
    let best = 0;
    for (const s of SUFFIXES) {
      if (!w.endsWith(s)) continue;
      const r = w.slice(0, -s.length);
      for (const c of [`${r}o`, `${r}a`, `${r}e`, r, `${r.slice(0, -1)}o`, `${r.slice(0, -2)}co`, `${r.slice(0, -1)}z`]) if (has(c)) best = Math.max(best, fq(c));
    }
    return best;
  }

  /** @returns {false|'clitic'|'affix'} */
  function derivable(w) {
    // a) enclíticos sobre una FORMA VERBAL conocida: hagámoslo, permitime, imponerles
    for (const c1 of CLITICS) {
      if (!w.endsWith(c1)) continue;
      const r1 = w.slice(0, -c1.length);
      if (r1.length >= 3 && (cliticOk(r1, c1) || (c1 === 'nos' && r1.endsWith('mo') && has(`${r1}s`)))) return 'clitic';
      // nosotros: hagámoslo, digámosle (la s se mantiene delante de lo/la/le)
      if (/^(lo|la|le|los|las|les)$/.test(c1) && r1.endsWith('mos') && has(r1)) return 'clitic';
      for (const c2 of CLITICS) {
        if (!r1.endsWith(c2)) continue;
        const r2 = r1.slice(0, -c2.length);
        if (r2.length >= 3 && (cliticOk(r2, c2) || (['se', 'nos'].includes(c2) && r2.endsWith('mo') && has(`${r2}s`)))) return 'clitic';
      }
    }
    // b) apreciativos: diminutivos, aumentativos, despectivos, superlativos
    for (const s of SUFFIXES) {
      if (!w.endsWith(s) || w.length - s.length < 2) continue;
      const r = w.slice(0, -s.length);
      // La raíz sola solo vale con sufijos que se pegan a palabras terminadas en consonante
      // (amor → amorcito, fácil → facilísimo, papel → papelito), nunca a un plural.
      const bare = !r.endsWith('s') && (/^(e?cit|cill|isim|errim)/.test(s) || (/^it/.test(s) && /[lrnjdz]$/.test(r)));
      const cands = [`${r}o`, `${r}a`, `${r}e`];
      if (bare) cands.push(r);
      if (r.endsWith('qu')) cands.push(`${r.slice(0, -2)}co`, `${r.slice(0, -2)}ca`);
      if (r.endsWith('gu')) cands.push(`${r.slice(0, -1)}o`, `${r.slice(0, -1)}a`);
      if (r.endsWith('c')) cands.push(`${r.slice(0, -1)}z`);
      if (r.endsWith('bil')) cands.push(`${r.slice(0, -3)}ble`);
      const short = /^(in|ina|ines|inas|on|ona|ones|onas|ico|ica|icos|icas|uco|uca|ucos|ucas|ejo|eja|ejos|ejas|ete|eta|etes|etas)$/.test(s);
      if (short) continue; // -ín, -ón, -ete, -ico...: demasiado ambiguos para aceptarlos automáticamente
      // jorgito: diminutivo de un nombre propio (si el nombre se usa más que la palabra común)
      const commonBest = Math.max(0, ...cands.filter((c) => has(c)).map(fq));
      if (cands.some((c) => properOnly.has(c) && fq(c) >= commonBest)) continue;
      // La base tiene que ser sustantivo o adjetivo: existe con plural (cosa/cosas, amigo/amigos).
      if (cands.some((c) => c.length >= 3 && has(c) && (has(`${c}s`) || has(`${c}es`)))) return 'affix';
    }
    // c) adverbios en -mente sobre un adjetivo (femenino o invariable)
    if (w.endsWith('mente') && /([aelnrz])$/.test(w.slice(0, -5)) && has(w.slice(0, -5))) return 'affix';
    // d) prefijos productivos sobre una palabra conocida
    for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 4 && has(w.slice(p.length))) return 'affix';
    return false;
  }

  const debug = new Set((process.env.DEBUG_WORDS || '').split(',').filter(Boolean));
  for (const w of debug) console.log(`  [debug] ${w}: núcleo=${core.has(w)} nombre=${properOnly.has(w)} inglés=${english.has(w)} derivable=${derivable(w)}`);
  for (const line of freq) {
    const sp = line.lastIndexOf(' ');
    if (sp < 0) continue;
    const raw = line.slice(0, sp);
    const count = Number(line.slice(sp + 1));
    if (count < FREQ_MIN_COUNT) break; // la lista viene ordenada por frecuencia
    if (!/^[a-záéíóúüñ]+$/.test(raw)) continue;
    const w = normalizeWord(raw);
    if (w.length < 3 || vulgarPreterite(w, core) || core.has(w) || english.has(w) || blocked.has(w)) continue;
    const kind = derivable(w);
    // Si además es un nombre propio (Pueblito, Jorgito), vale solo si la palabra común de la que
    // sale se usa mucho más que ese nombre (pueblo ≫ Pueblito).
    if (properOnly.has(w) && !(kind === 'affix' && baseFreq(w) >= 10 * count)) continue;
    // Los apreciativos y prefijos se aceptan solo si se usan bastante (evita errores de tipeo).
    const enough = kind === 'clitic' ? count >= FREQ_MIN_COUNT : kind === 'affix' ? count >= FREQ_AFFIX_COUNT : kind === 'affix-short' ? count >= FREQ_AFFIX_COUNT * 3 : false;
    if (enough && guard(w, 'uso')) {
      const typo = probableTypo(w);
      if (typo) {
        const k = 'uso: probable error de tipeo';
        if (!rejected.has(k)) rejected.set(k, []);
        rejected.get(k).push(`${w}→${typo}`);
      } else uso.add(w);
    }
  }
  log(`formas atestiguadas por uso: +${uso.size}`);
} catch (err) {
  console.warn(`  ⚠ Sin lista de frecuencias (${err.message}): se genera solo el núcleo.`);
}

// ---------------------------------------------------------------- salida
const write = (file, set) => {
  const list = [...set].sort();
  fs.writeFileSync(file, `${list.join('\n')}\n`);
  log(`${path.relative(ROOT, file)}: ${list.length} palabras, ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
};
write(path.join(DATA, 'dictionary.es.txt'), core);
write(path.join(DATA, 'dictionary.es-uso.txt'), uso);
log(`TOTAL: ${core.size + uso.size} formas distintas`);
if (process.env.AUDIT) {
  const dir = path.join(SOURCES, 'audit');
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, set] of Object.entries(tiers)) fs.writeFileSync(path.join(dir, `${k}.txt`), [...set].sort().join('\n'));
  log(`auditoría en ${path.relative(ROOT, dir)}`);
}
for (const [k, list] of rejected) console.log(`  descartadas por ortografía (${k}): ${list.length} · ej: ${list.slice(0, 6).join(', ')}`);

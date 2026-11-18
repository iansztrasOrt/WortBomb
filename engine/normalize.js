// Normalización de palabras: la MISMA función se usa para construir el diccionario,
// validar lo que escriben los jugadores y registrar las palabras usadas.
//
//  · minúsculas y sin espacios alrededor
//  · sin tildes ni diéresis (á→a, ü→u), pero la ñ se conserva como letra distinta
//  · solo letras a-z y ñ: se rechazan espacios internos, números, guiones y símbolos

const COMBINING = /[̀-ͯ]/g;
const LETTERS = /^[a-zñ]+$/;

/** Devuelve la forma normalizada (puede quedar con caracteres inválidos: usar validateFormat). */
export function normalizeWord(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    // n + tilde combinada = ñ: se protege antes de borrar los diacríticos
    .replace(/ñ/g, '\u0001')
    .replace(COMBINING, '')
    .replace(/\u0001/g, 'ñ')
    .normalize('NFC');
}

/**
 * Valida el formato de lo que escribió un jugador.
 * @returns {{ ok: true, word: string } | { ok: false, reason: 'empty'|'chars'|'short'|'long', word: string }}
 */
export function validateFormat(input, { minLength = 3, maxLength = 40 } = {}) {
  const word = normalizeWord(input);
  if (!word) return { ok: false, reason: 'empty', word };
  if (!LETTERS.test(word)) return { ok: false, reason: 'chars', word };
  if (word.length < minLength) return { ok: false, reason: 'short', word };
  if (word.length > maxLength) return { ok: false, reason: 'long', word };
  return { ok: true, word };
}

export const isNormalizedWord = (w) => typeof w === 'string' && LETTERS.test(w);

/** Subcadenas distintas de largo 2 y 3 (para el banco de sílabas y el conteo de disponibles). */
export function syllablesOf(word, sizes = [2, 3]) {
  const out = new Set();
  for (const n of sizes) for (let i = 0; i + n <= word.length; i += 1) out.add(word.slice(i, i + n));
  return out;
}

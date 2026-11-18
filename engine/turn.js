// Validación de una palabra en el turno, en el orden exacto de las reglas:
//  (1) formato  (2) contiene la sílaba  (3) existe en el diccionario  (4) no fue usada
// El paso (4) y el alta en el Set de usadas son la MISMA operación (UsedWords.claim), síncrona.

import { validateFormat } from './normalize.js';

export const REASONS = Object.freeze({
  empty: 'Escribí una palabra.',
  chars: 'Solo letras: sin espacios, números ni símbolos.',
  short: 'Muy corta.',
  long: 'Demasiado larga.',
  syllable: 'No tiene la sílaba.',
  dictionary: 'No está en el diccionario.',
  used: 'Esa palabra ya se usó en esta partida.',
  late: 'Llegó tarde: la bomba ya había explotado.',
});

/**
 * Valida y, si todo está bien, reclama la palabra en el Set de usadas (atómico).
 * Una palabra rechazada NUNCA se agrega al Set.
 * @returns {{ ok: true, word, entry } | { ok: false, reason, word, entry? }}
 */
export function checkAndClaim({ text, syllable, dict, used, minLength = 3, by = null, name = '', at = Date.now() }) {
  const f = validateFormat(text, { minLength });
  if (!f.ok) return { ok: false, reason: f.reason, word: f.word };
  const { word } = f;
  if (!word.includes(syllable)) return { ok: false, reason: 'syllable', word };
  if (!dict.has(word)) return { ok: false, reason: 'dictionary', word };
  const claim = used.claim(word, { by, name, at });
  if (!claim.ok) return { ok: false, reason: 'used', word, entry: claim.entry };
  return { ok: true, word, entry: claim.entry };
}

// Bonus de alfabeto: cada palabra aceptada tacha las letras que contiene. Completar todas = +1 vida
// (si no estás en el máximo) y el panel vuelve a empezar.
import { ALPHABET } from './constants.js';

export function newAlphabet(letters = ALPHABET) {
  return new Set(letters);
}

/**
 * Aplica una palabra al panel (lo modifica). Una sola palabra puede tachar varias letras
 * y hasta completar el panel.
 * @returns {{ crossed: string[], completed: boolean, remaining: string[] }}
 */
export function applyWord(remaining, word, letters = ALPHABET) {
  const crossed = [];
  for (const ch of new Set(word)) {
    if (remaining.has(ch)) {
      remaining.delete(ch);
      crossed.push(ch);
    }
  }
  const completed = remaining.size === 0;
  if (completed) for (const l of letters) remaining.add(l);
  return { crossed, completed, remaining: [...remaining] };
}

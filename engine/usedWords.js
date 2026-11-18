// Palabras usadas en la partida. REGLA INQUEBRANTABLE: una palabra aceptada no se puede volver a usar
// en toda la partida, ni por el mismo jugador ni por otro. Solo se vacía al empezar una partida nueva.
//
// claim() es la única forma de agregar: comprueba y agrega en el mismo paso síncrono. Como Node
// procesa los mensajes de a uno, si dos jugadores mandan la misma palabra "a la vez", el primero
// que llega al servidor la reclama y el segundo recibe "ya usada".

import { syllablesOf } from './normalize.js';

export class UsedWords {
  constructor() {
    this.words = new Map(); // palabra normalizada → { word, by, name, at, n }
    this.subCount = new Map(); // sílaba → cuántas palabras usadas la contienen
    this.seq = 0;
  }

  get size() {
    return this.words.size;
  }

  has(word) {
    return this.words.has(word);
  }

  get(word) {
    return this.words.get(word) || null;
  }

  /**
   * Reclama una palabra (ya normalizada). Atómico: si nadie la usó, la registra y devuelve ok.
   * @returns {{ ok: true, entry } | { ok: false, entry }}
   */
  claim(word, { by = null, name = '', at = Date.now() } = {}) {
    const prev = this.words.get(word);
    if (prev) return { ok: false, entry: prev };
    const entry = { word, by, name, at, n: ++this.seq };
    this.words.set(word, entry);
    for (const s of syllablesOf(word)) this.subCount.set(s, (this.subCount.get(s) || 0) + 1);
    return { ok: true, entry };
  }

  /** Cuántas palabras usadas contienen esta sílaba (para saber cuántas quedan disponibles). */
  containing(syllable) {
    return this.subCount.get(syllable) || 0;
  }

  /** Historial, la más reciente primero. */
  list({ query = '', limit = Infinity } = {}) {
    const out = [];
    const all = [...this.words.values()];
    for (let i = all.length - 1; i >= 0 && out.length < limit; i -= 1) {
      if (!query || all[i].word.includes(query)) out.push(all[i]);
    }
    return out;
  }

  /** Solo al empezar una partida nueva (o revancha). */
  clear() {
    this.words.clear();
    this.subCount.clear();
    this.seq = 0;
  }

  toJSON() {
    return { seq: this.seq, words: [...this.words.values()] };
  }

  static fromJSON(data) {
    const u = new UsedWords();
    for (const e of data?.words || []) {
      u.words.set(e.word, e);
      for (const s of syllablesOf(e.word)) u.subCount.set(s, (u.subCount.get(s) || 0) + 1);
    }
    u.seq = data?.seq || u.words.size;
    return u;
  }
}

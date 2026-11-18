// Banco de sílabas y selección por dificultad.
//
// Cada sílaba trae n (palabras del diccionario que la contienen) y c[] (lo mismo según el largo
// mínimo de palabra). La dificultad sube con el tiempo de partida mezclando tramos cada vez menos
// frecuentes (TIER_SCHEDULE). Garantías:
//  · nunca sale una sílaba con menos de N palabras SIN USAR disponibles en la partida
//  · nunca sale la misma sílaba dos turnos seguidos

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYLLABLE_TIERS, TIER_SCHEDULE } from './constants.js';

export const SYLLABLES_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/syllables.json');
const EASY_MIN_FREQUENT = 40; // en el primer tramo, que aparezca en al menos 40 palabras de uso común

/** Pesos de cada tramo a los `minutes` de partida (interpolación lineal entre los puntos). */
export function tierWeightsAt(minutes, schedule = TIER_SCHEDULE) {
  if (minutes <= schedule[0].minutes) return [...schedule[0].weights];
  for (let i = 1; i < schedule.length; i += 1) {
    const a = schedule[i - 1];
    const b = schedule[i];
    if (minutes <= b.minutes) {
      const t = (minutes - a.minutes) / (b.minutes - a.minutes);
      return a.weights.map((w, k) => w + (b.weights[k] - w) * t);
    }
  }
  return [...schedule[schedule.length - 1].weights];
}

export class SyllableBank {
  /** @param {{s:string,n:number,f?:number,c?:number[]}[]} list */
  constructor(list, { tiers = SYLLABLE_TIERS, schedule = TIER_SCHEDULE } = {}) {
    this.tiers = tiers;
    this.schedule = schedule;
    this.entries = new Map(list.map((x) => [x.s, x]));
    this.byTier = new Map(); // minWordLength → [[sílabas del tramo 0], [tramo 1], ...]
  }

  static load(file = SYLLABLES_FILE) {
    return new SyllableBank(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  get size() {
    return this.entries.size;
  }

  /** Palabras del diccionario (con el largo mínimo de la sala) que contienen la sílaba. */
  total(s, minLength = 3) {
    const e = this.entries.get(s);
    if (!e) return 0;
    if (e.c) return e.c[Math.min(Math.max(minLength, 2), 8) - 2] ?? e.n;
    return e.n;
  }

  /** Palabras sin usar que todavía contienen la sílaba en esta partida. */
  available(s, used, minLength = 3) {
    return this.total(s, minLength) - (used ? used.containing(s) : 0);
  }

  tierLists(minLength = 3) {
    if (!this.byTier.has(minLength)) {
      const lists = this.tiers.map(() => []);
      for (const e of this.entries.values()) {
        const n = this.total(e.s, minLength);
        const t = this.tiers.findIndex((tier) => n >= tier.min && n < tier.max);
        if (t < 0) continue;
        if (t === 0 && e.f !== undefined && e.f < EASY_MIN_FREQUENT) {
          // muchas formas raras pero pocas palabras de uso común: va al tramo siguiente
          lists[1].push(e.s);
          continue;
        }
        lists[t].push(e.s);
      }
      this.byTier.set(minLength, lists);
    }
    return this.byTier.get(minLength);
  }

  /**
   * Elige la sílaba del turno.
   * @param {{ minutes:number, rng?:()=>number, used?:UsedWords, minAvailable?:number, avoid?:string|null, minLength?:number }} o
   * @returns {{ syllable:string, tier:number, available:number }}
   */
  pick({ minutes = 0, rng = Math.random, used = null, minAvailable = 5, avoid = null, minLength = 3 }) {
    const lists = this.tierLists(minLength);
    const weights = tierWeightsAt(minutes, this.schedule);
    const ok = (s) => s !== avoid && this.available(s, used, minLength) >= minAvailable;
    // 1) tramo al azar según los pesos
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let tier = 0;
    for (; tier < weights.length - 1; tier += 1) {
      if (r < weights[tier]) break;
      r -= weights[tier];
    }
    // 2) sílaba al azar del tramo; si el tramo no sirve, se prueba el siguiente más fácil
    const order = [tier, ...[0, 1, 2, 3].filter((t) => t !== tier && t < lists.length)];
    for (const t of order) {
      const list = lists[t];
      if (!list?.length) continue;
      for (let i = 0; i < 40; i += 1) {
        const s = list[Math.floor(rng() * list.length)];
        if (ok(s)) return { syllable: s, tier: t, available: this.available(s, used, minLength) };
      }
      const s = list.find(ok);
      if (s) return { syllable: s, tier: t, available: this.available(s, used, minLength) };
    }
    // 3) último recurso: la más frecuente que no sea la anterior
    const best = [...this.entries.keys()].find((s) => s !== avoid) || [...this.entries.keys()][0];
    return { syllable: best, tier: 0, available: this.available(best, used, minLength) };
  }
}

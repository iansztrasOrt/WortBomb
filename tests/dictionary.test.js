import { describe, it, expect, beforeAll } from 'vitest';
import { loadDictionary } from '../engine/dictionary.js';
import { SyllableBank } from '../engine/syllables.js';
import { checkAndClaim } from '../engine/turn.js';
import { UsedWords } from '../engine/usedWords.js';
import { normalizeWord } from '../engine/normalize.js';

let dict;
beforeAll(() => {
  dict = loadDictionary();
});
const has = (w) => dict.has(normalizeWord(w));

describe('diccionario real', () => {
  it('es grande (más de un millón de formas)', () => {
    expect(dict.size).toBeGreaterThan(1_000_000);
  });
  it('acepta plurales, femeninos y conjugaciones', () => {
    for (const w of ['casas', 'canciones', 'lápices', 'doctora', 'maestras', 'cantaríamos', 'hubiésemos', 'dijeron', 'condujo', 'yendo', 'cupiera']) expect(has(w), w).toBe(true);
  });
  it('acepta voseo y enclíticos', () => {
    for (const w of ['tenés', 'sos', 'querés', 'vení', 'decime', 'hacelo', 'dámelo', 'decímelo', 'hagámoslo', 'vámonos', 'andate']) expect(has(w), w).toBe(true);
  });
  it('acepta ñ y ü; la ñ no equivale a n', () => {
    expect(has('pingüino')).toBe(true);
    expect(has('pinguino')).toBe(true); // sin diéresis también (no hace falta escribir tildes)
    expect(has('montaña')).toBe(true);
    expect(has('montana')).toBe(true); // "montana" existe (adjetivo: de la montaña)
    expect(has('año')).toBe(true);
    expect(normalizeWord('año')).not.toBe(normalizeWord('ano'));
    expect(has('senor')).toBe(false); // "señor" sin ñ no es palabra
  });
  it('no hace falta escribir tildes', () => {
    for (const w of ['cancion', 'arbol', 'murcielago', 'telefono', 'esta', 'despues', 'dificil']) expect(has(w), w).toBe(true);
  });
  it('acepta regionalismos', () => {
    for (const w of ['pibe', 'laburar', 'bondi', 'chamba', 'chido', 'guagua', 'chévere', 'parcero', 'pollera', 'frutilla']) expect(has(w), w).toBe(true);
  });
  it('rechaza inexistentes, errores típicos, pretéritos con -s y entradas con símbolos', () => {
    for (const w of ['haigan', 'nadien', 'llendo', 'estubo', 'hicistes', 'dijistes', 'vistes', 'cantastes', 'xyzzy', 'asdf', 'casa1', 'ca-sa', 'izq', 'km']) expect(has(w), w).toBe(false);
  });
  it('en una partida real: "canción" y "cancion" son la misma palabra', () => {
    const used = new UsedWords();
    expect(checkAndClaim({ text: 'canción', syllable: 'cion', dict, used }).ok).toBe(true);
    expect(checkAndClaim({ text: 'cancion', syllable: 'cion', dict, used }).reason).toBe('used');
  });
  it('el banco de sílabas real tiene los cuatro tramos', () => {
    const bank = SyllableBank.load();
    expect(bank.size).toBeGreaterThan(3000);
    const tiers = bank.tierLists(3);
    for (const t of tiers) expect(t.length).toBeGreaterThan(50);
    const r = bank.pick({ minutes: 0, minAvailable: 5 });
    expect(bank.entries.get(r.syllable).f).toBeGreaterThanOrEqual(150);
    // las sílabas imposibles no salen nunca, ni al final de una partida larga
    for (let i = 0; i < 2000; i += 1) {
      const s = bank.pick({ minutes: 15, minAvailable: 5 }).syllable;
      expect(['uaq', 'cee']).not.toContain(s);
      expect(bank.entries.get(s).f).toBeGreaterThanOrEqual(15);
    }
  });
});

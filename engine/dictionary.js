// Diccionario en memoria. Se carga una sola vez al arrancar (Set: búsqueda O(1)).
// Los archivos ya vienen normalizados (ver scripts/build-dictionary.js).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWord } from './normalize.js';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
export const DICTIONARY_FILES = [path.join(DATA, 'dictionary.es.txt'), path.join(DATA, 'dictionary.es-uso.txt')];
export const EXTRA_FILE = path.join(DATA, 'extra-words.txt');
export const BLOCK_FILE = path.join(DATA, 'blocklist.txt');

export class Dictionary {
  constructor(words = []) {
    this.set = words instanceof Set ? words : new Set(words);
  }

  has(word) {
    return this.set.has(word);
  }

  get size() {
    return this.set.size;
  }

  words() {
    return this.set.values();
  }

  add(word) {
    const w = normalizeWord(word);
    if (w) this.set.add(w);
  }

  delete(word) {
    this.set.delete(normalizeWord(word));
  }
}

function readList(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
}

/**
 * Carga los archivos del diccionario + extra-words.txt − blocklist.txt.
 * (extra y blocklist se aplican también en caliente: no hace falta regenerar para probar cambios.)
 */
export function loadDictionary({ files = DICTIONARY_FILES, extraFile = EXTRA_FILE, blockFile = BLOCK_FILE } = {}) {
  const set = new Set();
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    let start = 0;
    while (start < text.length) {
      let end = text.indexOf('\n', start);
      if (end < 0) end = text.length;
      if (end > start) set.add(text.slice(start, end));
      start = end + 1;
    }
  }
  for (const w of readList(extraFile)) set.add(normalizeWord(w));
  for (const w of readList(blockFile)) set.delete(normalizeWord(w));
  return new Dictionary(set);
}

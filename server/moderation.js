// Moderación: limpieza de textos, apodos y chat, límites de tasa y anti-ráfagas.
// (El cliente siempre muestra texto con textContent, nunca como HTML: no hay XSS posible,
// y además acá se sacan caracteres de control y marcas invisibles.)

import { ROOM_LIMITS } from '../engine/constants.js';
import { normalizeWord } from '../engine/normalize.js';

const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;

export function cleanText(value, max = ROOM_LIMITS.chatMax) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(CONTROL, '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
}

// Insultos y términos de odio que no se permiten en apodos (y que el filtro opcional tapa en el chat).
// Se comparan normalizados (sin tildes) y también sin repetir letras ("putoooo").
const BLOCKED = [
  'puto', 'puta', 'putos', 'putas', 'pelotudo', 'pelotuda', 'boludo', 'boluda', 'forro', 'forra', 'concha', 'conchudo', 'conchuda',
  'pija', 'verga', 'chota', 'mierda', 'cagon', 'culiao', 'culiado', 'culero', 'pendejo', 'pendeja', 'cabron', 'cabrona', 'gilipollas',
  'hijodeputa', 'hdp', 'mogolico', 'mogolica', 'retrasado', 'retrasada', 'subnormal', 'maricon', 'marica', 'trolo', 'puton',
  'negro de mierda', 'sudaca', 'bolita', 'nazi', 'hitler', 'violador', 'violacion', 'pedofilo', 'zorra', 'perra', 'malparido',
  'mamaguevo', 'huevon', 'weon', 'chinga', 'chingada', 'pinche', 'coño', 'joder',
];
const squash = (s) => normalizeWord(s).replace(/[^a-zñ]/g, '').replace(/(.)\1+/g, '$1');
const BLOCKED_SQUASHED = BLOCKED.map(squash);

export function hasBlockedWord(text) {
  const words = normalizeWord(text).split(/[^a-zñ]+/).filter(Boolean).map((w) => w.replace(/(.)\1+/g, '$1'));
  const joined = squash(text);
  return BLOCKED_SQUASHED.some((b) => words.includes(b) || (b.length >= 5 && joined.includes(b)));
}

/** Apodo válido: 1–16 caracteres visibles y sin insultos. Devuelve null si no sirve. */
export function cleanName(value) {
  const name = cleanText(value, ROOM_LIMITS.nameMax);
  if (!name || !/[\p{L}\p{N}]/u.test(name)) return null;
  if (hasBlockedWord(name)) return null;
  return name;
}

/** Filtro opcional de chat: tapa los insultos con asteriscos. */
export function filterChat(text) {
  return text.replace(/[\p{L}]+/gu, (w) => (BLOCKED_SQUASHED.includes(squash(w)) ? '*'.repeat(w.length) : w));
}

// Avatar SVG propio: color de fondo, carita y accesorio (los dibuja el cliente).
export const AVATAR_OPTIONS = Object.freeze({
  colors: ['#ff5d5d', '#ff9f43', '#ffd23f', '#3ddc97', '#2ec4b6', '#4d96ff', '#9b5de5', '#f15bb5', '#8d6e63', '#5c6b73'],
  faces: ['feliz', 'canchero', 'sorprendido', 'picaro', 'dormido', 'enojado', 'nervioso', 'lengua'],
  accessories: ['nada', 'gorra', 'anteojos', 'corona', 'mono', 'auriculares', 'bigote', 'vincha'],
});

export function cleanAvatar(a) {
  const pick = (list, v, i = 0) => (list.includes(v) ? v : list[i]);
  return {
    color: pick(AVATAR_OPTIONS.colors, a?.color),
    face: pick(AVATAR_OPTIONS.faces, a?.face),
    accessory: pick(AVATAR_OPTIONS.accessories, a?.accessory),
  };
}

/** Límite de tasa simple: como mucho `max` eventos por ventana de `ms` milisegundos. */
export class RateLimiter {
  constructor(max, ms) {
    this.max = max;
    this.ms = ms;
    this.hits = new Map();
  }

  allow(key, now = Date.now()) {
    const list = (this.hits.get(key) || []).filter((t) => now - t < this.ms);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  sweep(now = Date.now()) {
    for (const [k, list] of this.hits) if (!list.some((t) => now - t < this.ms)) this.hits.delete(k);
  }
}

/** Frena ráfagas del mismo texto (el mismo envío repetido muchas veces en poco tiempo). */
export class BurstGuard {
  constructor(maxRepeats = 3, ms = 2000) {
    this.maxRepeats = maxRepeats;
    this.ms = ms;
    this.last = new Map();
  }

  allow(key, text, now = Date.now()) {
    const prev = this.last.get(key);
    if (prev && prev.text === text && now - prev.at < this.ms) {
      prev.count += 1;
      prev.at = now;
      return prev.count <= this.maxRepeats;
    }
    this.last.set(key, { text, at: now, count: 1 });
    return true;
  }
}

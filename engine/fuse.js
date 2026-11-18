// La mecha. Se acorta de DOS formas (las dos suaves) y tiene un modo final:
//  1. con el tiempo de partida:          × 0,95 por minuto
//  2. con cada vida perdida en la ronda:  × 0,97 por vida  (y × 0,95 extra por cada eliminado)
//  3. MUERTE SÚBITA: a la mitad, con piso de 2 s.
// duración base = max(MÍNIMO, INICIAL × 0,95^minutos × 0,97^vidasPerdidas × 0,95^eliminados)
// Todo configurable en constants.js (FUSE) y en los ajustes de la sala (inicial, mínimo).
import { FUSE, DANGER_LEVELS, DEFAULT_SETTINGS } from './constants.js';

/** Acepta minutos (número) o { minutes, livesLost, eliminations, sudden }. */
const pressureOf = (p) => (typeof p === 'number' ? { minutes: p } : p || {});

/** Segundos de mecha "base" (sin azar). Decrece con el tiempo y las vidas perdidas; nunca baja del mínimo. */
export function baseFuseSeconds(pressure, settings = DEFAULT_SETTINGS, fuse = FUSE) {
  const { minutes = 0, livesLost = 0, eliminations = 0, sudden = false } = pressureOf(pressure);
  const initial = settings.fuseInitial;
  const min = Math.min(settings.fuseMin, initial);
  const m = Math.max(0, minutes);
  let raw = fuse.curve === 'linear' ? initial - fuse.linearPerMinute * m : initial * fuse.factorPerMinute ** m;
  raw *= fuse.factorPerLife ** Math.max(0, livesLost) * fuse.factorPerElimination ** Math.max(0, eliminations);
  const normal = Math.max(min, raw);
  if (!sudden) return normal;
  return Math.max(Math.min(fuse.suddenMin, min), normal * fuse.suddenFactor);
}

/** Piso absoluto de la mecha (en muerte súbita es más bajo). */
export function fuseFloor(settings = DEFAULT_SETTINGS, sudden = false, fuse = FUSE) {
  const min = Math.min(settings.fuseMin, settings.fuseInitial);
  return sudden ? Math.min(fuse.suddenMin, min) : min;
}

/**
 * Duración real del turno en ms: base ± margen aleatorio (por defecto ±10 %),
 * sin bajar NUNCA del piso absoluto. rng() devuelve [0, 1).
 */
export function fuseDurationMs(pressure, settings = DEFAULT_SETTINGS, rng = Math.random, fuse = FUSE) {
  const p = pressureOf(pressure);
  const base = baseFuseSeconds(p, settings, fuse);
  const factor = 1 + (rng() * 2 - 1) * fuse.jitter;
  const seconds = Math.max(fuseFloor(settings, p.sudden, fuse), base * factor);
  return Math.round(seconds * 1000);
}

/** Nivel de peligro 1..10 según cuánto se acortó la mecha (muerte súbita = 10). */
export function dangerLevel(pressure, settings = DEFAULT_SETTINGS, fuse = FUSE) {
  const p = pressureOf(pressure);
  if (p.sudden) return DANGER_LEVELS;
  const initial = settings.fuseInitial;
  const min = Math.min(settings.fuseMin, initial);
  if (initial <= min) return DANGER_LEVELS;
  const frac = (initial - baseFuseSeconds(p, settings, fuse)) / (initial - min);
  return Math.max(1, Math.min(DANGER_LEVELS - 1, 1 + Math.round(frac * (DANGER_LEVELS - 2))));
}

/**
 * ¿Hay que anunciar que la mecha se acortó? Se anuncia cada vez que baja de un segundo entero
 * (12 → 11 → 10 ...). Devuelve los segundos a anunciar o null.
 */
export function fuseAnnouncement(prevBase, nextBase) {
  if (prevBase === null || prevBase === undefined) return null;
  const a = Math.ceil(prevBase - 1e-9);
  const b = Math.ceil(nextBase - 1e-9);
  return b < a ? b : null;
}

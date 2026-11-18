// Perfil local opcional (sin cuentas): apodo, avatar y estadísticas en este navegador.
import { store } from './ui.js';
import { randomAvatar } from './avatar.js';

const KEY = 'wortbomb.profile';
const STATS = 'wortbomb.stats';

export function loadProfile() {
  const p = store.get(KEY, null);
  return p && p.avatar ? p : { name: '', avatar: randomAvatar() };
}
export function saveProfile(p) {
  store.set(KEY, { name: p.name, avatar: p.avatar });
}

export function loadStats() {
  return { games: 0, wins: 0, streak: 0, bestStreak: 0, longest: '', words: 0, ...store.get(STATS, {}) };
}

/** Registra una partida terminada en la que jugó este navegador. */
export function recordGame({ won, words = 0, longest = '' }) {
  const s = loadStats();
  s.games += 1;
  s.words += words;
  if (won) {
    s.wins += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else s.streak = 0;
  if (longest.length > (s.longest || '').length) s.longest = longest;
  store.set(STATS, s);
  return s;
}

// Textos de la interfaz. Preparado para más idiomas: agregar otro objeto y elegirlo en LANG.
const ES = {
  tagline: 'Pasá la bomba escribiendo una palabra con la sílaba antes de que explote. El último que queda con vidas gana.',
  nick: 'Tu apodo',
  nickPh: 'Ej: Rayo Veloz',
  avatar: 'Tu avatar',
  quick: '⚡ Jugar rápido',
  create: 'Crear sala',
  join: 'Unirse',
  codePh: 'CÓDIGO',
  publicRooms: 'Salas públicas',
  noRooms: 'No hay salas públicas abiertas. ¡Creá una!',
  howTo: '¿Cómo se juega?',
  waiting: 'esperando',
  playing: 'en juego',
  results: 'resultados',
  players: 'Jugadores',
  ready: 'Listo',
  notReady: 'Todavía no',
  start: '¡Empezar!',
  rules: 'Reglas',
  settings: 'Ajustes de la sala',
  leave: 'Salir',
  copyLink: 'Copiar link',
  chat: 'Chat',
  words: 'Palabras',
  letters: 'Letras',
  chatPh: 'Escribí un mensaje…',
  deadChannel: 'Canal de eliminados y espectadores: los que juegan no lo ven.',
  searchWords: 'Buscar palabra…',
  noWords: 'Todavía no se usó ninguna palabra.',
  lettersNote: 'Completá todas las letras para ganar una vida (hasta {max}).',
  yourTurn: '¡Te toca! Escribí una palabra con',
  theirTurn: 'Le toca a {name}',
  spectating: 'Estás mirando: jugás desde la próxima partida.',
  eliminated: 'Quedaste eliminado. Mirá cómo termina y charlá en el canal de eliminados.',
  inputPh: 'escribí acá…',
  send: 'Enviar',
  report: '¿Falta una palabra? Reportala',
  danger: 'Peligro',
  rematch: '🔁 Jugar de nuevo',
  rematchReady: 'Listo para la revancha',
  backRoom: 'Volver a la sala',
  winner: '¡Ganó {name}!',
  byAbandon: '(por abandono)',
  duration: 'Duración',
  maxDanger: 'Peligro máximo',
  wordsUsed: 'Palabras usadas',
};
const LANG = { es: ES };
let current = 'es';

export function t(key, vars = {}) {
  const s = LANG[current][key] ?? LANG.es[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
export function setLang(lang) {
  if (LANG[lang]) current = lang;
}

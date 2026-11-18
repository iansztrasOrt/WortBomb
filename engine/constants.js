// Todo lo ajustable de wORTbomb en un solo lugar.

/** Ajustes de sala por defecto (el líder los puede cambiar dentro de SETTINGS_LIMITS). */
export const DEFAULT_SETTINGS = Object.freeze({
  startLives: 2, // vidas con las que empieza cada jugador (solo se pierden: no hay forma de recuperarlas)
  minWordLength: 3, // largo mínimo de palabra
  minSyllableWords: 5, // una sílaba solo sale si quedan al menos N palabras sin usar que la contienen
  fuseInitial: 12, // segundos de mecha al empezar la partida
  fuseMin: 3, // piso de la mecha (nunca baja de acá, ni con el margen aleatorio)
  suddenDeathMinutes: 5, // a los N minutos empieza la muerte súbita (0 = nunca)
});

export const SETTINGS_LIMITS = Object.freeze({
  startLives: [1, 10],
  minWordLength: [2, 8],
  minSyllableWords: [1, 50],
  fuseInitial: [4, 30],
  fuseMin: [2, 10],
  suddenDeathMinutes: [0, 30],
});

export const ROOM_LIMITS = Object.freeze({
  minPlayers: 2,
  maxPlayers: 16,
  defaultMaxPlayers: 8,
  nameMax: 16, // apodos
  roomNameMax: 28,
  passwordMax: 24,
  chatMax: 200,
  chatHistory: 60,
  wordMax: 40, // largo máximo de lo que se envía como palabra
  typingMax: 40,
  maxRooms: 500,
});

/**
 * Mecha. Se acorta de dos formas, las dos suaves:
 *   · con el TIEMPO DE PARTIDA (reloj global, no el del turno): × factorPerMinute por minuto
 *   · con cada VIDA PERDIDA en la ronda: × factorPerLife (y × factorPerElimination por cada eliminado)
 * duración = max(MÍNIMO, INICIAL × 0,95^minutos × 0,97^vidasPerdidas × 0,95^eliminados)
 * Alternativa lineal por tiempo (curve: 'linear'): INICIAL − linearPerMinute × minutos.
 * En MUERTE SÚBITA la mecha va a la mitad (suddenFactor) con piso suddenMin.
 */
export const FUSE = Object.freeze({
  curve: 'exp',
  factorPerMinute: 0.95,
  linearPerMinute: 0.6,
  factorPerLife: 0.97,
  factorPerElimination: 0.95,
  jitter: 0.1, // ±10 % al azar en cada turno
  suddenFactor: 0.5,
  suddenMin: 2,
});

/** Muerte súbita: cuenta regresiva visible antes de que empiece. */
export const SUDDEN_DEATH = Object.freeze({
  countdownMs: 60000,
});

/** Niveles de peligro que muestra la interfaz (1 = tranqui, 10 = mecha en el piso). */
export const DANGER_LEVELS = 10;

/**
 * Dificultad de las sílabas. Se mide por USO REAL: en cuántas de las 30.000 palabras más usadas
 * del español hablado aparece la sílaba (campo "f" de syllables.json). Así no salen sílabas que
 * solo están en formas rarísimas del diccionario (como "uaq" o "cee").
 * Los tramos se mezclan con pesos que cambian con el tiempo de partida (interpolados), de a poco.
 * Una sílaba que aparece en menos de MIN_COMMON palabras comunes no sale nunca.
 */
export const SYLLABLE_TIERS = Object.freeze([
  { name: 'común', min: 150, max: Infinity },
  { name: 'media', min: 60, max: 150 },
  { name: 'difícil', min: 25, max: 60 },
  { name: 'brava', min: 15, max: 25 },
]);
export const SYLLABLE_MIN_COMMON = 15;
export const TIER_SCHEDULE = Object.freeze([
  { minutes: 0, weights: [1, 0, 0, 0] },
  { minutes: 2, weights: [0.85, 0.15, 0, 0] },
  { minutes: 4, weights: [0.65, 0.28, 0.07, 0] },
  { minutes: 7, weights: [0.5, 0.33, 0.14, 0.03] },
  { minutes: 10, weights: [0.4, 0.35, 0.19, 0.06] },
]);

export const TIMING = Object.freeze({
  activeGraceMs: 5000, // si el jugador con la bomba se desconecta, tiene 5 s para volver
  eliminateAfterMs: 30000, // si no vuelve en 30 s, queda eliminado
  endToResultsMs: 1800, // pausa dramática antes de los resultados
  passAnimMs: 350, // la bomba vuela entre asientos
  voteMs: 60000, // duración de una votación para expulsar
  idleRoomMs: 30 * 60 * 1000, // sala sin actividad → se cierra
  emptyRoomMs: 60 * 1000, // sala sin nadie conectado → se cierra
});

export const RATE = Object.freeze({
  submitsPerSecond: 6,
  typingPerSecond: 25,
  chatPer5s: 5,
  roomsPerIpPerMinute: 4,
  reportsPerMinute: 6,
  sameTextBurst: 3, // el mismo texto más de 3 veces seguidas en 2 s se ignora
});

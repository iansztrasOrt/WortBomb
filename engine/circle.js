// Geometría de la "rondita". La usan el cliente (para dibujar) y los tests (para garantizar
// que NADA se tape: ni avatares entre sí, ni nombres y corazones, ni la bomba, ni el centro).
//
// · ángulo = (360° / jugadores vivos) × índice, empezando ARRIBA y en sentido horario
// · se rota la vista para que el jugador local quede ABAJO (siempre sabés dónde estás y la bomba
//   que viene hacia vos se ve venir)
// · radio y tamaño de avatar se adaptan a la cantidad de jugadores (2 a 16) y a la pantalla;
//   en pantallas muy altas o muy anchas la ronda es una elipse
// · con 2 jugadores es un cara a cara: uno arriba y otro abajo
//
// Cada asiento ocupa: el avatar (círculo de diámetro `size`) y debajo una etiqueta (nombre +
// corazones) de ancho LABEL_W × size y alto LABEL_H píxeles. Todo en píxeles, relativo al
// centro de la arena.

export const AVATAR = Object.freeze({ max: 104, min: 22 });
export const LABEL_H = 44; // etiqueta normal: nombre (22) + corazones (16) + separaciones
export const LABEL_W = 1.25; // ancho máximo del nombre, en avatares
/**
 * Alto de la etiqueta según el tamaño del avatar (el CSS usa las mismas medidas):
 *  · 'full'    (avatar ≥ 56 px): nombre + fila de corazones → 44 px
 *  · 'compact' (avatar ≥ 40 px): nombre y corazones más chicos → 30 px
 *  · 'mini'    (avatar < 40 px): solo el nombre; las vidas van en una insignia sobre el avatar → 16 px
 */
export function labelMode(size) {
  return size >= 56 ? 'full' : size >= 40 ? 'compact' : 'mini';
}
export function labelHeight(size) {
  return { full: LABEL_H, compact: 30, mini: 16 }[labelMode(size)];
}
const GAP = 6; // aire mínimo entre cosas

// ---------------------------------------------------------------- formas
/** Rectángulo de la etiqueta (nombre y corazones) de un asiento. */
export function labelRect(seat, size) {
  return { x0: seat.x - (size * LABEL_W) / 2, x1: seat.x + (size * LABEL_W) / 2, y0: seat.y + size / 2, y1: seat.y + size / 2 + labelHeight(size) };
}
/** Rectángulo total del asiento (avatar + etiqueta). */
export function seatRect(seat, size) {
  return { x0: seat.x - (size * LABEL_W) / 2, x1: seat.x + (size * LABEL_W) / 2, y0: seat.y - size / 2, y1: seat.y + size / 2 + labelHeight(size) };
}
const rectsOverlap = (a, b, pad = 0) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
function circleRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x0, Math.min(cx, rect.x1));
  const ny = Math.max(rect.y0, Math.min(cy, rect.y1));
  return Math.hypot(cx - nx, cy - ny) < r;
}

// ---------------------------------------------------------------- asientos
/**
 * @param {number} count jugadores vivos
 * @param {{ width:number, height:number, localIndex?:number, margin?:number, maxSize?:number }} box
 * @returns {{ seats:{x:number,y:number,angle:number}[], rx:number, ry:number, cy:number, size:number, ellipse:boolean, width:number, height:number }}
 */
export function seatLayout(count, { width, height, localIndex = -1, margin = Math.min(width, height) < 360 ? 4 : 10, maxSize = AVATAR.max } = {}) {
  const n = Math.max(1, count);
  const ellipse = height > width * 1.15 || width > height * 1.25;
  const half = Math.min(width, height) / 2;
  let size = Math.max(AVATAR.min, Math.min(maxSize, half * (n <= 4 ? 0.34 : n <= 8 ? 0.28 : 0.22)));
  const rot = localIndex >= 0 ? localIndex : 0;
  const angleOf = (i) => {
    const step = 360 / n;
    const base = -90 + step * i;
    return localIndex >= 0 ? base + 180 - step * rot : base;
  };
  let out = null;
  for (let iter = 0; iter < 60; iter += 1) {
    // Horizontal: el ancho del nombre. Vertical: medio avatar arriba; medio avatar + etiqueta abajo.
    // La ronda se corre LABEL_H/2 hacia arriba para que el bloque completo quede centrado.
    const lh = labelHeight(size);
    let rx = Math.max(0, width / 2 - margin - (size * LABEL_W) / 2);
    let ry = Math.max(0, (height - 2 * margin - size - lh) / 2);
    if (!ellipse) rx = ry = Math.min(rx, ry);
    const cy = -lh / 2;
    const seats = [];
    for (let i = 0; i < n; i += 1) {
      const a = (angleOf(i) * Math.PI) / 180;
      seats.push({ x: rx * Math.cos(a), y: cy + ry * Math.sin(a), angle: ((angleOf(i) % 360) + 360) % 360 });
    }
    out = { seats, rx, ry, cy, size, ellipse, width, height };
    if (n === 1 || size <= AVATAR.min) break;
    // ¿algún asiento pisa a otro? (avatar + nombre + corazones)
    let ok = true;
    const rects = seats.map((st) => seatRect(st, size));
    for (let i = 0; i < n && ok; i += 1) for (let j = i + 1; j < n && ok; j += 1) if (rectsOverlap(rects[i], rects[j], GAP)) ok = false;
    if (ok) break;
    size = Math.max(AVATAR.min, size * 0.93);
  }
  return out;
}

// ---------------------------------------------------------------- centro
/**
 * Recuadro libre más grande en el centro de la ronda (sílaba, mecha y lo que se escribe), sin pisar
 * ningún asiento. Centrado en (0, cy).
 * @returns {{ hw:number, hh:number, cy:number }} mitades de ancho y alto
 */
export function centerBox(layout, { maxHalfWidth = 260, maxHalfHeight = 150 } = {}) {
  const { seats, size, cy = 0, width = Infinity, height = Infinity } = layout;
  // nunca más ancho ni más alto que la arena
  maxHalfWidth = Math.min(maxHalfWidth, width / 2 - 8);
  maxHalfHeight = Math.min(maxHalfHeight, height / 2 - 8 - Math.abs(cy));
  const rects = seats.map((st) => seatRect(st, size));
  let best = { hw: 0, hh: 0, score: 0 };
  for (let hh = maxHalfHeight; hh >= 22; hh -= 2) {
    let hw = maxHalfWidth;
    for (const r of rects) {
      if (r.y1 + GAP <= cy - hh || r.y0 - GAP >= cy + hh) continue; // no comparte la franja vertical
      const free = r.x0 > 0 ? r.x0 - GAP : r.x1 < 0 ? -r.x1 - GAP : 0; // distancia libre desde x = 0
      hw = Math.min(hw, free);
    }
    if (hw < 44) continue;
    const w = Math.min(hw, hh * 2.6);
    const score = w * hh;
    if (score > best.score) best = { hw: Math.floor(w), hh, score };
  }
  return { hw: best.hw, hh: best.hh, cy };
}

/**
 * Ronda completa: asientos + recuadro central. Si el centro no alcanza para la sílaba, achica los
 * avatares hasta que entre.
 */
export function arenaLayout(count, box) {
  let layout = seatLayout(count, box);
  let center = centerBox(layout);
  for (let i = 0; i < 12 && (center.hw < 64 || center.hh < 30) && layout.size > AVATAR.min; i += 1) {
    layout = seatLayout(count, { ...box, maxSize: layout.size * 0.88 });
    center = centerBox(layout);
  }
  // Si en algún asiento la bomba no entra con un tamaño razonable, se le cede lugar del centro.
  const minBomb = () => Math.min(...layout.seats.map((_, i) => bombPlacement(layout, i, { center }).size));
  for (let i = 0; i < 6 && layout.seats.length > 1 && center.hw > 48 && minBomb() < Math.max(20, layout.size * 0.6); i += 1) {
    center = { ...center, hw: Math.max(44, Math.floor(center.hw * 0.86)), hh: Math.max(22, Math.floor(center.hh * 0.9)) };
  }
  return { ...layout, center };
}

// ---------------------------------------------------------------- bomba
/**
 * Dónde se apoya la bomba en el turno del asiento `index`: pegada a su avatar, del lado libre más
 * cercano a la dirección en la que va a pasar (sentido horario). Nunca toca a otros jugadores,
 * ni la etiqueta del propio, ni el centro, ni se sale de la arena. Si no entra, se achica.
 * @returns {{ x:number, y:number, size:number }}
 */
export function bombPlacement(layout, index, { bomb = layout.size * 0.85, center = null } = {}) {
  const { seats, size, width, height, rx = 1, ry = 1 } = layout;
  const seat = seats[index];
  if (!seat) return { x: 0, y: 0, size: bomb };
  const a = (seat.angle * Math.PI) / 180;
  let tx = -rx * Math.sin(a);
  let ty = ry * Math.cos(a);
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const others = seats.map((st, i) => (i === index ? null : st)).filter(Boolean);
  const cRect = center ? { x0: -center.hw, x1: center.hw, y0: center.cy - center.hh, y1: center.cy + center.hh } : null;
  const ownLabel = labelRect(seat, size);
  const valid = (x, y, r) => {
    if (Math.abs(x) + r > width / 2 - 2 || Math.abs(y) + r > height / 2 - 2) return false;
    if (Math.hypot(x - seat.x, y - seat.y) < size / 2 + r) return false;
    if (circleRect(x, y, r, ownLabel)) return false;
    for (const st of others) {
      if (Math.hypot(x - st.x, y - st.y) < size / 2 + r + GAP) return false;
      if (circleRect(x, y, r + GAP, labelRect(st, size))) return false;
    }
    if (cRect && circleRect(x, y, r + GAP, cRect)) return false;
    return true;
  };
  let b = bomb;
  for (let tries = 0; tries < 8; tries += 1) {
    const r = b / 2;
    const cands = [];
    for (let k = 0; k < 24; k += 1) {
      const t = (k / 24) * Math.PI * 2;
      const dx = Math.cos(t);
      const dy = Math.sin(t);
      const d = size / 2 + r + 1; // tocando el avatar, sin superponerse
      // preferencia: hacia el siguiente jugador (horario); a igualdad, hacia afuera
      const pref = dx * tx + dy * ty + 0.15 * ((dx * seat.x + dy * (seat.y - (layout.cy || 0))) / (Math.hypot(seat.x, seat.y - (layout.cy || 0)) || 1));
      cands.push({ x: seat.x + dx * d, y: seat.y + dy * d, pref });
    }
    cands.sort((p, q) => q.pref - p.pref);
    const hit = cands.find((c) => valid(c.x, c.y, r));
    if (hit) return { x: hit.x, y: hit.y, size: b };
    b *= 0.85;
  }
  return { x: seat.x + tx * (size / 2 + b / 2), y: seat.y + ty * (size / 2 + b / 2), size: b };
}

/** Compatibilidad: punto de la bomba (sin datos de pantalla). */
export function bombSpot(seat, size, { rx = null, ry = null, bomb = size * 0.8 } = {}) {
  const a = (seat.angle * Math.PI) / 180;
  const ex = rx ?? Math.hypot(seat.x, seat.y);
  const ey = ry ?? Math.hypot(seat.x, seat.y);
  let tx = -ex * Math.sin(a);
  let ty = ey * Math.cos(a);
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const d = Math.hypot(seat.x, seat.y) || 1;
  const off = size / 2 + bomb * 0.42;
  const inward = size * 0.18;
  return { x: seat.x + tx * off - (seat.x / d) * inward, y: seat.y + ty * off - (seat.y / d) * inward };
}

// ---------------------------------------------------------------- orden de paso
/**
 * Orden horario de paso: índice del siguiente jugador vivo después de `from`.
 * `alive` es un array de booleanos en el orden de los asientos. Devuelve -1 si no hay nadie.
 */
export function nextAlive(alive, from) {
  const n = alive.length;
  for (let k = 1; k <= n; k += 1) {
    const i = (from + k) % n;
    if (alive[i]) return i;
  }
  return -1;
}

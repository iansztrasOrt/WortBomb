import { describe, it, expect } from 'vitest';
import { seatLayout, nextAlive, arenaLayout, bombPlacement, seatRect, labelRect, LABEL_H } from '../engine/circle.js';

// Pantallas de prueba: compu, cuadrada, celular vertical (con y sin teclado abierto), apaisada, chiquita.
const SCREENS = [{ width: 900, height: 600 }, { width: 600, height: 600 }, { width: 370, height: 470 }, { width: 370, height: 300 },
  { width: 1400, height: 760 }, { width: 340, height: 420 }, { width: 780, height: 420 }];
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const circleHitsRect = (cx, cy, r, rc) => {
  const nx = Math.max(rc.x0, Math.min(cx, rc.x1));
  const ny = Math.max(rc.y0, Math.min(cy, rc.y1));
  return Math.hypot(cx - nx, cy - ny) < r;
};
const each = (fn) => {
  for (const box of SCREENS) for (let n = 2; n <= 16; n += 1) for (const localIndex of [0, n - 1]) fn(box, n, localIndex, `n=${n} ${box.width}x${box.height} local=${localIndex}`);
};

describe('rondita: nada tapa nada', () => {
  it('asientos (avatar + nombre + corazones) sin superponerse y dentro de la arena', () => {
    each((box, n, localIndex, tag) => {
      const L = arenaLayout(n, { ...box, localIndex });
      const rects = L.seats.map((s) => seatRect(s, L.size));
      for (let i = 0; i < n; i += 1) {
        const r = rects[i];
        expect(r.x0 >= -box.width / 2 && r.x1 <= box.width / 2 && r.y0 >= -box.height / 2 && r.y1 <= box.height / 2, `${tag} fuera`).toBe(true);
        for (let j = i + 1; j < n; j += 1) expect(overlap(r, rects[j]), `${tag} asientos ${i}/${j}`).toBe(false);
      }
    });
  });

  it('el centro (sílaba y mecha) tiene lugar y no pisa ningún asiento', () => {
    each((box, n, localIndex, tag) => {
      const L = arenaLayout(n, { ...box, localIndex });
      const c = L.center;
      expect(c.hw, `${tag} ancho`).toBeGreaterThanOrEqual(44);
      expect(c.hh, `${tag} alto`).toBeGreaterThanOrEqual(22);
      const cr = { x0: -c.hw, x1: c.hw, y0: c.cy - c.hh, y1: c.cy + c.hh };
      for (const s of L.seats) expect(overlap(cr, seatRect(s, L.size)), tag).toBe(false);
      expect(cr.x0 >= -box.width / 2 && cr.x1 <= box.width / 2 && cr.y0 >= -box.height / 2 && cr.y1 <= box.height / 2, `${tag} centro afuera`).toBe(true);
    });
  });

  it('la bomba, en el turno de cualquiera, no tapa a nadie, ni el centro, ni se sale', () => {
    each((box, n, localIndex, tag) => {
      const L = arenaLayout(n, { ...box, localIndex });
      const c = L.center;
      const cr = { x0: -c.hw, x1: c.hw, y0: c.cy - c.hh, y1: c.cy + c.hh };
      for (let i = 0; i < n; i += 1) {
        const b = bombPlacement(L, i, { center: c });
        const r = b.size / 2;
        expect(b.size, `${tag} bomba ${i} muy chica`).toBeGreaterThanOrEqual(16);
        expect(Math.abs(b.x) + r <= box.width / 2 && Math.abs(b.y) + r <= box.height / 2, `${tag} bomba ${i} afuera`).toBe(true);
        expect(circleHitsRect(b.x, b.y, r, cr), `${tag} bomba ${i} sobre el centro`).toBe(false);
        expect(circleHitsRect(b.x, b.y, r, labelRect(L.seats[i], L.size)), `${tag} bomba ${i} sobre su nombre`).toBe(false);
        L.seats.forEach((s, j) => {
          if (j === i) return;
          expect(Math.hypot(b.x - s.x, b.y - s.y) >= L.size / 2 + r, `${tag} bomba ${i} sobre avatar ${j}`).toBe(true);
          expect(circleHitsRect(b.x, b.y, r, labelRect(s, L.size)), `${tag} bomba ${i} sobre nombre ${j}`).toBe(false);
        });
        // y queda pegada a su jugador
        expect(Math.hypot(b.x - L.seats[i].x, b.y - L.seats[i].y)).toBeLessThan(L.size / 2 + r + 3);
      }
    });
  });
});

describe('rondita: orden y forma', () => {
  it('empieza arriba y gira en sentido horario; el jugador local queda abajo', () => {
    const { seats, cy } = seatLayout(4, { width: 800, height: 800 });
    expect(seats[0].y).toBeLessThan(cy);
    expect(Math.abs(seats[0].x)).toBeLessThan(1e-6);
    expect(seats[1].x).toBeGreaterThan(0);
    const local = seatLayout(5, { width: 800, height: 800, localIndex: 3 });
    expect(local.seats[3].y).toBeGreaterThan(local.cy);
    expect(Math.abs(local.seats[3].x)).toBeLessThan(1e-6);
  });

  it('con 2 jugadores es un cara a cara (asientos opuestos)', () => {
    const { seats, cy } = seatLayout(2, { width: 800, height: 600, localIndex: 0 });
    expect(seats[0].x).toBeCloseTo(-seats[1].x);
    expect(seats[0].y - cy).toBeCloseTo(-(seats[1].y - cy));
    expect(seats[0].y).toBeGreaterThan(cy);
  });

  it('en pantallas muy altas o muy anchas usa una elipse', () => {
    expect(seatLayout(8, { width: 380, height: 700 }).ellipse).toBe(true);
    expect(seatLayout(8, { width: 1400, height: 700 }).ellipse).toBe(true);
    expect(seatLayout(8, { width: 900, height: 800 }).ellipse).toBe(false);
  });

  it('al eliminar a alguien se reacomoda simétrico con los que quedan', () => {
    const b = seatLayout(5, { width: 800, height: 800 });
    const ang = b.seats.map((s) => s.angle);
    for (let i = 1; i < ang.length; i += 1) expect((ang[i] - ang[i - 1] + 360) % 360).toBeCloseTo(72);
  });

  it('la bomba pasa siempre al siguiente vivo', () => {
    expect(nextAlive([true, false, true, true], 0)).toBe(2);
    expect(nextAlive([true, false, false, true], 3)).toBe(0);
    expect(nextAlive([false, false, true, false], 2)).toBe(2);
    expect(nextAlive([false, false], 0)).toBe(-1);
  });

  it('la etiqueta mide lo que dice el CSS', () => {
    expect(LABEL_H).toBe(44);
  });
});

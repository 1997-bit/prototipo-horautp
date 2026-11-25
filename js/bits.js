// @ts-check
// Ocupación por día en celdas de 10 min desde las 0:00: 5 palabras de 32 bits
// (el día entero). Entran las dos rejillas de la UTP (50 y 60 min) sin choques
// falsos: los inicios caen en múltiplos de 10 y el fin se redondea hacia arriba.

const CELDA_MIN = 10;
export const PALABRAS = 5;
const CELDAS = PALABRAS * 32;

/** Popcount (SWAR). @param {number} x */
export function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Índice del bit más bajo encendido. @param {number} x */
export const bitBajo = (x) => 31 - Math.clz32(x & -x);

/** Bits lo..hi (0–31) encendidos. @param {number} lo @param {number} hi */
const tramo = (lo, hi) => (-1 >>> (31 - hi)) & (-1 << lo);

/** @param {number} min */
const celda = (min) => Math.min(CELDAS, Math.max(0, min / CELDA_MIN));

/**
 * Marca [ini, fin) del día d en masks (7 × PALABRAS).
 * @param {ArrayLike<number> & {[i: number]: number}} masks @param {number} d @param {number} ini @param {number} fin
 */
export function marcar(masks, d, ini, fin) {
  const a = Math.floor(celda(ini)), b = Math.ceil(celda(fin)) - 1;
  for (let w = Math.floor(a / 32); w <= Math.floor(b / 32) && w < PALABRAS; w++) {
    const lo = Math.max(a - w * 32, 0), hi = Math.min(b - w * 32, 31);
    if (lo <= hi) masks[d * PALABRAS + w] |= tramo(lo, hi);
  }
}

/**
 * Celdas libres entre la primera y la última ocupada del día, en `out`
 * (PALABRAS palabras). Devuelve cuántas son.
 * @param {ArrayLike<number>} masks @param {number} i0 primera palabra del día
 * @param {Int32Array | number[]} out
 */
export function huecosDia(masks, i0, out) {
  let primera = -1, ultima = -1;
  for (let w = 0; w < PALABRAS; w++) {
    const m = masks[i0 + w];
    if (!m) continue;
    if (primera < 0) primera = w * 32 + bitBajo(m);
    ultima = w * 32 + (31 - Math.clz32(m));
  }
  let n = 0;
  for (let w = 0; w < PALABRAS; w++) {
    const lo = Math.max(primera - w * 32, 0), hi = Math.min(ultima - w * 32, 31);
    const h = primera >= 0 && lo <= hi ? tramo(lo, hi) & ~masks[i0 + w] : 0;
    out[w] = h;
    n += popcount(h);
  }
  return n;
}

/** Tramos libres (no celdas) en los huecos del día. @param {ArrayLike<number>} h */
export function tramosLibres(h) {
  let n = 0, antes = 0;
  for (let w = 0; w < PALABRAS; w++) {
    n += popcount(h[w] & ~((h[w] << 1) | antes));
    antes = h[w] >>> 31;
  }
  return n;
}

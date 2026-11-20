// @ts-check
// Máscaras de 32 bits.

/** Popcount (SWAR). @param {number} x */
export function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Huecos entre la primera y la última clase. @param {number} mask */
export function mascaraHuecos(mask) {
  if (!mask) return 0;
  const primero = mask & -mask;
  const ultimo = 1 << (31 - Math.clz32(mask));
  return ((ultimo - primero) | ultimo) & ~mask;
}

/** @param {number} mask */
export const huecos = (mask) => popcount(mascaraHuecos(mask));

/** @param {number} k @param {number} n */
export const bitsPeriodos = (k, n) => ((1 << n) - 1) << k;

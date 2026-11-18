// @ts-check
// Operaciones sobre máscaras de 32 bits (un bit por período o por día).

/** @param {number} x */
export function popcount(x) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/**
 * Bits de los períodos libres entre la primera y la última clase de un día.
 * @param {number} mask
 */
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

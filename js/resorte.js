// @ts-check
// Resorte amortiguado. Subpasos de 4 ms: estable con esta rigidez.

/** @typedef {{x: number, v: number, meta: number, k: number, c: number}} Resorte */

export const FIRME = { k: 520, c: 38 };
const DT_MAX = 0.064; // s
const SUBPASO = 0.004; // s

/** Segundos entre dos cuadros, acotado. @param {number} antes @param {number} ahora ms */
export const dtEntre = (antes, ahora) => Math.min(DT_MAX, (ahora - antes) / 1000);

/** @param {Resorte} r @param {number} dt s */
export function avanzar(r, dt) {
  const n = Math.max(1, Math.ceil(dt / SUBPASO)), h = dt / n;
  for (let i = 0; i < n; i++) {
    r.v += (-r.k * (r.x - r.meta) - r.c * r.v) * h;
    r.x += r.v * h;
  }
}

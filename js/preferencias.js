// @ts-check
// Preferencias: lo descartado sale de la búsqueda; el resto suma penalidad.

import { PALABRAS, huecosDia, popcount } from "./bits.js";

/**
 * @typedef {{dias?: number, solo?: Record<string, string[]>, evitados?: string[],
 *            fijas?: number[], excluidas?: number[]}} Prefs
 * @typedef {import("./modelo.js").Seccion} Seccion
 */

export const PESOS = {
  // Por día de clase después del primero, según prefs.dias (0–3).
  dias: [0, 5, 20, 60],
  // Por celda de 10 min: un período libre (50 min) pesa 5.
  hueco: 1,
};

/** @param {Prefs} prefs */
export const pesoDias = (prefs) => PESOS.dias[prefs.dias ?? 0] ?? 0;

/**
 * Fórmula única de la penalidad; el solver la usa también para la cota.
 * @param {number} nDias @param {number} celdasHueco @param {number} porDia pesoDias(prefs)
 */
export const costo = (nDias, celdasHueco, porDia) => Math.max(0, nDias - 1) * porDia + celdasHueco * PESOS.hueco;

/** La misma que calcula el solver. @param {Seccion[]} secciones @param {Prefs} prefs */
export function penalidad(secciones, prefs) {
  const ocupado = new Int32Array(7 * PALABRAS);
  const tmp = new Int32Array(PALABRAS);
  let dias = 0;
  for (const s of secciones) {
    dias |= s.dias;
    s.masks.forEach((m, i) => { ocupado[i] |= m; });
  }
  let celdas = 0;
  for (let d = 0; d < 7; d++) celdas += huecosDia(ocupado, d * PALABRAS, tmp);
  return costo(popcount(dias), celdas, pesoDias(prefs));
}

/** @param {Seccion} s @param {Prefs} prefs */
export function descartada(s, prefs) {
  if (prefs.excluidas?.includes(s.codhora) || prefs.evitados?.includes(s.profesor)) return true;
  if (prefs.fijas?.includes(s.codhora)) return false;
  const solo = prefs.solo?.[s.codasig];
  return !!solo?.length && !solo.includes(s.profesor);
}

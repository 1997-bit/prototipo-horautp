// @ts-check
// Preferencias: lo descartado sale de la búsqueda; el resto suma penalidad.

import { huecos } from "./bits.js";
import { franjaDe } from "./periodos.js";

/**
 * @typedef {{horario?: string, soloTurno?: boolean, menosDias?: boolean,
 *            solo?: Record<string, string[]>, evitados?: string[],
 *            fijas?: number[], excluidas?: number[]}} Prefs
 * @typedef {import("./modelo.js").Seccion} Seccion
 */

export const PESOS = {
  horario: 10,
  dias: 20,
  hueco: 5,
};

/** @param {Seccion} s @param {string | undefined} franja */
export function cumpleHorario(s, franja) {
  if (!franja) return true;
  return s.bloques.every(([, k]) => franjaDe(k) === franja);
}

/** @param {Seccion} s @param {Prefs} prefs */
export const penalSeccion = (s, prefs) => (cumpleHorario(s, prefs.horario) ? 0 : PESOS.horario);

/** La misma que calcula el solver. @param {Seccion[]} secciones @param {Prefs} prefs */
export function penalidad(secciones, prefs) {
  const ocupado = [0, 0, 0, 0, 0, 0, 0];
  let p = 0;
  for (const s of secciones) {
    p += penalSeccion(s, prefs);
    s.masks.forEach((m, d) => { ocupado[d] |= m; });
  }
  const nDias = ocupado.filter(Boolean).length;
  const nHuecos = ocupado.reduce((t, m) => t + huecos(m), 0);
  if (prefs.menosDias && nDias) p += (nDias - 1) * PESOS.dias;
  return p + nHuecos * PESOS.hueco;
}

/** @param {Seccion} s @param {Prefs} prefs */
export function descartada(s, prefs) {
  if (prefs.excluidas?.includes(s.codhora) || prefs.evitados?.includes(s.profesor)) return true;
  if (prefs.fijas?.includes(s.codhora)) return false;
  const solo = prefs.solo?.[s.codasig];
  if (solo?.length && !solo.includes(s.profesor)) return true;
  return !!prefs.soloTurno && !cumpleHorario(s, prefs.horario);
}

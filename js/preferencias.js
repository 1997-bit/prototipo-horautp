// @ts-check
// Preferencias: lo descartado sale de la búsqueda; el resto suma penalidad.

import { PALABRAS, huecosDia } from "./bits.js";
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
  // Por celda de 10 min: un período libre (50 min) pesa 5.
  hueco: 1,
};

/** @param {Seccion} s @param {string | undefined} franja */
export function cumpleHorario(s, franja) {
  if (!franja) return true;
  return s.bloques.every(([, ini]) => franjaDe(ini) === franja);
}

/** @param {Seccion} s @param {Prefs} prefs */
export const penalSeccion = (s, prefs) => (cumpleHorario(s, prefs.horario) ? 0 : PESOS.horario);

/** La misma que calcula el solver. @param {Seccion[]} secciones @param {Prefs} prefs */
export function penalidad(secciones, prefs) {
  const ocupado = new Int32Array(7 * PALABRAS);
  const tmp = new Int32Array(PALABRAS);
  let p = 0, dias = 0;
  for (const s of secciones) {
    p += penalSeccion(s, prefs);
    dias |= s.dias;
    s.masks.forEach((m, i) => { ocupado[i] |= m; });
  }
  let nDias = 0, nHuecos = 0;
  for (let d = 0; d < 7; d++) {
    if (dias & (1 << d)) nDias++;
    nHuecos += huecosDia(ocupado, d * PALABRAS, tmp);
  }
  if (prefs.menosDias && nDias) p += (nDias - 1) * PESOS.dias;
  return p + nHuecos * PESOS.hueco;
}

/** Sin turno no hay "solo ese turno". @param {Prefs} prefs @param {string} turno "" = da igual */
export function ponerTurno(prefs, turno) {
  if (turno) {
    prefs.horario = turno;
    return;
  }
  delete prefs.horario;
  prefs.soloTurno = false;
}

/** @param {Seccion} s @param {Prefs} prefs */
export function descartada(s, prefs) {
  if (prefs.excluidas?.includes(s.codhora) || prefs.evitados?.includes(s.profesor)) return true;
  if (prefs.fijas?.includes(s.codhora)) return false;
  const solo = prefs.solo?.[s.codasig];
  if (solo?.length && !solo.includes(s.profesor)) return true;
  return !!prefs.soloTurno && !cumpleHorario(s, prefs.horario);
}

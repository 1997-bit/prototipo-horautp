// @ts-check
// Preferencias y penalización.
//
// La penalización de una combinación es la suma de:
//   - por sección: horario fuera de la franja pedida, profesor distinto
//   - global: días por encima de diasMax, huecos entre clases, grupos extra

import { franjaDe, normalizar } from "./periodos.js";

/**
 * @typedef {{horario?: string, profesor?: string}} PrefMateria
 * @typedef {{materias?: Record<string, PrefMateria>, diasMax?: number | null,
 *            evitarHuecos?: boolean, unGrupo?: boolean,
 *            pesos?: Partial<typeof PESOS>}} Prefs
 * @typedef {import("./modelo.js").Seccion} Seccion
 */

export const PESOS = {
  horario: 10, // sección fuera de la franja preferida
  profesor: 15, // profesor distinto al preferido
  dias: 20, // cada día por encima de diasMax
  hueco: 5, // cada período libre entre dos clases del mismo día
  grupo: 10, // cada grupo distinto después del primero
};

/**
 * Cumple si todos sus bloques arrancan en la franja pedida.
 * @param {Seccion} s @param {string | undefined} franja
 */
export function cumpleHorario(s, franja) {
  if (!franja) return true;
  return s.bloques.every(([, k]) => franjaDe(k) === franja);
}

/** @param {Seccion} s @param {string | undefined} profesor */
export function cumpleProfesor(s, profesor) {
  if (!profesor) return true;
  return normalizar(s.profesor).includes(normalizar(profesor));
}

/**
 * Para la tabla de validación: null si no hay preferencia.
 * @param {Seccion} s @param {PrefMateria} [pm]
 */
export function estadoSeccion(s, pm = {}) {
  return {
    horario: pm.horario ? cumpleHorario(s, pm.horario) : null,
    profesor: pm.profesor ? cumpleProfesor(s, pm.profesor) : null,
  };
}

/**
 * @param {Seccion} s @param {PrefMateria} pm @param {typeof PESOS} pesos
 */
export function penalSeccion(s, pm, pesos) {
  let p = 0;
  if (!cumpleHorario(s, pm.horario)) p += pesos.horario;
  if (!cumpleProfesor(s, pm.profesor)) p += pesos.profesor;
  return p;
}

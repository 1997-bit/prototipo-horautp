// @ts-check
// Grupos (tal como salen del portal) → secciones con máscaras por día.
//
// Una sección es una materia de un grupo y se identifica por su codhora.
// Clase y Lab de la misma materia comparten codhora, así que siempre se
// eligen juntos.

import { bitsPeriodos } from "./bits.js";

/**
 * [dia 0-6, k período inicial, n períodos, tipo "C" | "L" | "CL", aula]
 * @typedef {[number, number, number, string, string]} Bloque
 *
 * @typedef {{codasig: string, codhora: number, asignatura: string,
 *            profesor: string, email: string, bloques: Bloque[]}} Materia
 * @typedef {{grupo: string, periodo: string, sede?: string, materias: Materia[]}} Grupo
 *
 * @typedef {{id: number, grupo: string, codasig: string, codhora: number,
 *            asignatura: string, profesor: string, email: string,
 *            bloques: Bloque[], masks: number[], usos: number[], dias: number}} Seccion
 *   masks: períodos ocupados por día (7 entradas).
 *   usos: solo los días con clase, aplanado [d, mask, d, mask…]; el solver
 *         recorre esto en lugar de los 7 días.
 */

/** @type {Record<string, string>} */
const TIPOS = { C: "Clase", L: "Lab", CL: "Clase+Lab" };

/** @param {string} t */
export const nombreTipo = (t) => TIPOS[t] ?? t;

/**
 * @param {Grupo[]} grupos
 * @returns {Seccion[]}
 */
export function construirSecciones(grupos) {
  /** @type {Map<number, Seccion>} */
  const porCodhora = new Map();
  for (const g of grupos) {
    for (const m of g.materias) {
      const masks = [0, 0, 0, 0, 0, 0, 0];
      for (const [d, k, n] of m.bloques) masks[d] |= bitsPeriodos(k, n);
      let dias = 0;
      masks.forEach((mk, d) => { if (mk) dias |= 1 << d; });
      // Si el mismo grupo se cargó dos veces, gana el último.
      porCodhora.set(m.codhora, {
        id: 0,
        grupo: g.grupo,
        codasig: m.codasig,
        codhora: m.codhora,
        asignatura: m.asignatura,
        profesor: m.profesor,
        email: m.email,
        bloques: [...m.bloques].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        masks,
        usos: masks.flatMap((mk, d) => (mk ? [d, mk] : [])),
        dias,
      });
    }
  }
  const secciones = [...porCodhora.values()];
  secciones.forEach((s, i) => { s.id = i; });
  return secciones;
}

/**
 * Materias disponibles, con cuántas secciones tiene cada una.
 * @param {Seccion[]} secciones
 */
export function listarMaterias(secciones) {
  /** @type {Map<string, {codasig: string, asignatura: string, secciones: number}>} */
  const m = new Map();
  for (const s of secciones) {
    const e = m.get(s.codasig);
    if (e) e.secciones++;
    else m.set(s.codasig, { codasig: s.codasig, asignatura: s.asignatura, secciones: 1 });
  }
  return [...m.values()].sort((a, b) => a.asignatura.localeCompare(b.asignatura));
}

/** @param {Seccion} a @param {Seccion} b */
export function chocan(a, b) {
  for (let d = 0; d < 7; d++) if (a.masks[d] & b.masks[d]) return true;
  return false;
}

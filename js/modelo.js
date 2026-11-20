// @ts-check
// Grupos → secciones. Clase y Lab comparten codhora.

import { bitsPeriodos } from "./bits.js";

/**
 * [dia, k, n, tipo, aula]
 * @typedef {[number, number, number, string, string]} Bloque
 *
 * @typedef {{codasig: string, codhora: number, asignatura: string,
 *            profesor: string, email: string, bloques: Bloque[]}} Materia
 * @typedef {{grupo: string, periodo: string, sede?: string, manual?: boolean, materias: Materia[]}} Grupo
 *
 * @typedef {{id: number, grupo: string, codasig: string, codhora: number,
 *            asignatura: string, profesor: string, email: string,
 *            bloques: Bloque[], masks: number[], usos: number[], dias: number}} Seccion
 *   usos: [d, mask, …] solo días con clase.
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
      // Duplicado: gana el último.
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

/** @param {Seccion[]} secciones */
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

const RE_PALABRAS = /[\s.]+/;
const RE_NUMERO = /^([IVX]+|\d+)$/;
const CONECTORES = new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "E", "A", "AL", "EN", "PARA", "CON", "POR"]);

/** "REDES DE COMPUTADORAS" → "RC", "DES. SOFT. VIII" → "DS VIII". @param {string} asignatura */
export function sigla(asignatura) {
  const palabras = asignatura.toUpperCase().split(RE_PALABRAS).filter(Boolean);
  const num = palabras.length > 1 && RE_NUMERO.test(palabras.at(-1) ?? "") ? palabras.pop() : "";
  const utiles = palabras.filter((p) => !CONECTORES.has(p));
  const base = utiles.length > 1 ? utiles.slice(0, 4).map((p) => p[0]).join("") : (utiles[0] ?? palabras[0] ?? "").slice(0, 4);
  return num ? `${base} ${num}` : base;
}

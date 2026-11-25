// @ts-check
// Grupos → secciones. Clase y Lab comparten codhora.
// Subgrupos (A, B…): son del grupo entero (el A de una materia va con el A de
// las demás). Cada materia con subgrupos da una sección por letra del grupo:
// la teoría más lo de esa letra, aunque sea solo la teoría.

import { PALABRAS, marcar } from "./bits.js";

/**
 * [dia, inicio, fin, tipo, aula, subgrupo?] — horas en minutos desde las 0:00.
 * @typedef {[number, number, number, string, string] | [number, number, number, string, string, string]} Bloque
 *
 * @typedef {{codasig: string, codhora: number, asignatura: string,
 *            profesor: string, email: string, bloques: Bloque[]}} Materia
 * @typedef {{grupo: string, periodo: string, sede?: string, manual?: boolean, materias: Materia[]}} Grupo
 *
 * @typedef {{id: number, grupo: string, codasig: string, codhora: number, sub: string,
 *            asignatura: string, profesor: string, email: string,
 *            bloques: Bloque[], masks: number[], usos: number[], dias: number}} Seccion
 *   masks: 7 días × PALABRAS. usos: [palabra, mask, …] solo las no vacías.
 */

/** @type {Record<string, string>} */
const TIPOS = { C: "Clase", L: "Lab", CL: "Clase+Lab" };

/** Por día y hora de inicio. @param {Bloque} a @param {Bloque} b */
export const porHora = (a, b) => a[0] - b[0] || a[1] - b[1];

/** @param {string} t */
export const nombreTipo = (t) => TIPOS[t] ?? t;

/** @param {Bloque[]} bloques @param {string} sub */
function seccionDe(bloques, sub) {
  const masks = new Array(7 * PALABRAS).fill(0);
  let dias = 0;
  for (const [d, ini, fin] of bloques) {
    marcar(masks, d, ini, fin);
    dias |= 1 << d;
  }
  return {
    sub,
    bloques: [...bloques].sort(porHora),
    masks,
    usos: masks.flatMap((mk, i) => (mk ? [i, mk] : [])),
    dias,
  };
}

/** Letras de subgrupo del grupo, en orden. @param {Grupo} g */
function letrasDe(g) {
  const letras = g.materias.flatMap((m) => m.bloques.map((b) => b[5] ?? "")).filter(Boolean);
  return [...new Set(letras)].sort();
}

/**
 * @param {Grupo[]} grupos
 * @returns {Seccion[]}
 */
export function construirSecciones(grupos) {
  /** @type {Map<string, Seccion>} */
  const porClave = new Map();
  for (const g of grupos) {
    const letras = letrasDe(g);
    for (const m of g.materias) {
      const conSub = m.bloques.some((b) => b[5]);
      const variantes = conSub
        ? letras.map((x) => seccionDe(m.bloques.filter((b) => !b[5] || b[5] === x), x))
        : [seccionDe(m.bloques, "")];
      for (const v of variantes) {
        // Duplicado: gana el último.
        porClave.set(`${m.codhora}|${v.sub}`, {
          id: 0,
          grupo: g.grupo,
          codasig: m.codasig,
          codhora: m.codhora,
          asignatura: m.asignatura,
          profesor: m.profesor,
          email: m.email,
          ...v,
        });
      }
    }
  }
  const secciones = [...porClave.values()];
  secciones.forEach((s, i) => {
    s.id = i;
  });
  return secciones;
}

/** @param {Seccion[]} secciones */
export function listarMaterias(secciones) {
  /** @type {Map<string, {codasig: string, asignatura: string, secciones: number}>} */
  const m = new Map();
  const vistas = new Set();
  for (const s of secciones) {
    // Los subgrupos de un C.HORA cuentan como una sección.
    if (vistas.has(s.codhora)) continue;
    vistas.add(s.codhora);
    const e = m.get(s.codasig);
    if (e) e.secciones++;
    else m.set(s.codasig, { codasig: s.codasig, asignatura: s.asignatura, secciones: 1 });
  }
  return [...m.values()].sort((a, b) => a.asignatura.localeCompare(b.asignatura));
}

/** Del mismo grupo del portal (las agregadas a mano no cuentan). @param {Seccion} a @param {Seccion} b */
const mismoGrupo = (a, b) => a.codhora > 0 && b.codhora > 0 && !!a.grupo && a.grupo === b.grupo;

/**
 * Mismo grupo: subgrupos distintos siempre chocan. Dos bloques a la misma hora
 * en la misma aula son módulos de posgrado (2GP211) y no chocan; en aulas
 * distintas, sí.
 * @param {Seccion} a @param {Seccion} b
 */
export function chocan(a, b) {
  if (mismoGrupo(a, b)) {
    if (a.sub && b.sub && a.sub !== b.sub) return true;
    return a.bloques.some(([d1, i1, f1, , aula1]) => b.bloques.some(([d2, i2, f2, , aula2]) =>
      d1 === d2 && i1 < f2 && i2 < f1 && (!aula1 || aula1 !== aula2)));
  }
  for (let i = 0; i < a.masks.length; i++) {
    if (a.masks[i] & b.masks[i]) return true;
  }
  return false;
}

const RE_PALABRAS = /[\s.]+/;
const RE_NUMERO = /^([IVX]+|\d+)$/;
const CONECTORES = new Set([
  "DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "E", "A", "AL", "EN", "PARA", "CON", "POR",
]);

/** "REDES DE COMPUTADORAS" → "RC", "DES. SOFT. VIII" → "DS VIII". @param {string} asignatura */
export function sigla(asignatura) {
  const palabras = asignatura.toUpperCase().split(RE_PALABRAS).filter(Boolean);
  const num = palabras.length > 1 && RE_NUMERO.test(palabras.at(-1) ?? "") ? palabras.pop() : "";
  const utiles = palabras.filter((p) => !CONECTORES.has(p));
  const iniciales = utiles.length > 1
    ? utiles.slice(0, 4).map((p) => p[0]).join("")
    : (utiles[0] ?? palabras[0] ?? "").slice(0, 4);
  return num ? `${iniciales} ${num}` : iniciales;
}

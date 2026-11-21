// @ts-check
// Calendario semanal.

import { h } from "./dom.js";
import { nombreTipo, sigla } from "./modelo.js";
import { DIAS, DIAS_CORTO, formatoHora, inicioMin, rango } from "./periodos.js";

/**
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./modelo.js").Bloque} Bloque
 */

const RE_INICIAL = /(^|[\s,.'-])(\p{L})/gu;

/** "CALDERON, TOMAS" → "Calderon, Tomas". @param {string} t */
export const nombrePropio = (t) => t.toLowerCase().replace(RE_INICIAL, (_, a, b) => a + b.toUpperCase());

/** C.HORA (0761); las agregadas a mano no tienen. @param {Seccion} s */
export const codigo = (s) => (s.codhora > 0 ? String(s.codhora).padStart(4, "0") : "");

/** "Lab · 3-401", "Subgrupo B · 1-311". @param {Bloque} b */
const detalle = ([, , , tipo, aula, sub]) =>
  [sub ? `Subgrupo ${sub}` : nombreTipo(tipo), aula].filter(Boolean).join(" · ");

/** Color de la materia. @param {number | undefined} tono */
export const punto = (tono) => h("span", { class: "punto", style: `--h:${tono}`, "aria-hidden": "true" });

const BASE = inicioMin(0);

/**
 * Filas de la grilla: los períodos de cada bloque en su rejilla (50 min desde
 * las 7:00, u horas de 55 min), más los vacíos entre medio.
 * @param {Bloque[]} bloques
 * @returns {[number, number][]}
 */
function filasDe(bloques) {
  /** @type {Map<number, number>} */
  const filas = new Map();
  /** @type {Record<number, [number, number]>} paso → [primer, último] inicio */
  const usados = {};
  /** @param {number} ini @param {number} fin @param {number} paso @param {number} dura */
  const poner = (ini, fin, paso, dura) => {
    for (let t = ini; t < fin; t += paso) filas.set(t, Math.min(t + dura, fin));
    const u = (usados[paso] ??= [ini, ini]);
    u[0] = Math.min(u[0], ini);
    u[1] = Math.max(u[1], ini + Math.floor((fin - ini - 1) / paso) * paso);
  };
  for (const [, ini, fin] of bloques) {
    if (ini >= BASE && (ini - BASE) % 50 === 0) poner(ini, fin, 50, 45);
    else if (ini % 60 === 0) poner(ini, fin, 60, 55);
    else filas.set(ini, Math.max(filas.get(ini) ?? 0, fin));
  }
  for (const [paso, [a, z]] of Object.entries(usados)) {
    for (let t = a; t <= z; t += Number(paso)) if (!filas.has(t)) filas.set(t, t + Number(paso) - 5);
  }
  return [...filas].sort((x, y) => x[0] - y[0]);
}

/**
 * Celular: sigla y aula. La caja flota: no cambia el alto de la fila.
 * @param {Seccion} s @param {Bloque} b @param {number} filas que cubre @param {Map<string, number>} tono
 */
function celdaClase(s, b, filas, tono) {
  const aula = b[4];
  return h("td", {
    rowSpan: filas,
    class: filas === 1 ? "clase breve" : "clase",
    "data-codhora": s.codhora,
    style: `--h:${tono.get(s.codasig)}`,
    onclick: () => detalleClase(s, b, tono),
  },
  h("div", { class: "caja", title: s.asignatura },
    h("b", {},
      h("span", { class: "nombre" }, s.asignatura),
      h("span", { class: "sigla", "aria-hidden": "true" }, sigla(s.asignatura))),
    h("small", { class: "completo" }, detalle(b)),
    aula && h("small", { class: "corto", "aria-hidden": "true" }, aula)));
}

/** @param {number} desde @param {number} hasta */
const celdaHora = (desde, hasta) => h("th", { scope: "row" },
  formatoHora(desde),
  h("span", { class: "hasta" }, h("span", { class: "sr" }, "–"), formatoHora(hasta)));

/**
 * Tabla semanal: fila = período, celda con rowspan = períodos que cubre.
 * @param {Seccion[]} secciones @param {Map<string, number>} tono
 */
export function grilla(secciones, tono) {
  let diasUsados = 0;
  const filas = filasDe(secciones.flatMap((s) => s.bloques));
  /** @type {Map<string, [Seccion, Bloque, number]>} */
  const inicio = new Map();
  const tapada = new Set();
  for (const s of secciones) {
    for (const b of s.bloques) {
      const [d, ini, fin] = b;
      diasUsados |= 1 << d;
      const cubre = filas.filter(([t]) => t >= ini && t < fin);
      inicio.set(`${d},${ini}`, [s, b, cubre.length]);
      for (const [t] of cubre.slice(1)) tapada.add(`${d},${t}`);
    }
  }
  const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => d < 5 || diasUsados & (1 << d));
  /** @param {number} d @param {number} t */
  const celda = (d, t) => {
    if (tapada.has(`${d},${t}`)) return null;
    const c = inicio.get(`${d},${t}`);
    return c ? celdaClase(...c, tono) : h("td", {});
  };
  return h("div", { class: "grilla" },
    h("table", {},
      h("thead", {}, h("tr", {},
        h("th", { scope: "col" }, "Hora"),
        dias.map((d) => h("th", { scope: "col" }, DIAS_CORTO[d])))),
      h("tbody", {}, filas.map(([t, hasta]) => h("tr", {},
        celdaHora(t, hasta),
        dias.map((d) => celda(d, t)))))));
}

/** @type {HTMLElement | null} */
let hoja = null;
export const celular = matchMedia("(max-width: 47.99rem)");

/**
 * Solo en celular.
 * @param {Seccion} s @param {Bloque} b @param {Map<string, number>} tono
 */
function detalleClase(s, b, tono) {
  const [d, ini, fin] = b;
  if (!celular.matches) return;
  if (!hoja) {
    hoja = h("div", {
      popover: "auto",
      class: "hoja vidrio",
      role: "dialog",
      "aria-label": "Detalle de la clase",
    });
    document.body.append(hoja);
  }
  if (!("showPopover" in hoja)) return;
  hoja.replaceChildren(
    h("p", { class: "titulo" }, punto(tono.get(s.codasig)), s.asignatura),
    h("p", {}, h("b", {}, `${DIAS[d]} ${rango(ini, fin)}`), ` · ${detalle(b)}`),
    h("p", {}, [s.profesor, s.grupo && `Grupo ${s.grupo}`].filter(Boolean).join(" · ")));
  hoja.showPopover();
}

/**
 * Misma información por día, para pantallas angostas.
 * @param {Seccion[]} secciones @param {Map<string, number>} tono
 */
export function porDia(secciones, tono) {
  const dias = DIAS.map((nombre, d) => ({
    nombre,
    clases: secciones.flatMap((s) => s.bloques.filter((b) => b[0] === d).map((b) => ({ s, b })))
      .sort((x, y) => x.b[1] - y.b[1]),
  })).filter((x) => x.clases.length);
  /** @param {{s: Seccion, b: Bloque}} clase */
  const item = ({ s, b }) => h("li", { class: "clase", "data-codhora": s.codhora, style: `--h:${tono.get(s.codasig)}` },
    h("span", { class: "hora" }, rango(b[1], b[2])),
    h("b", {}, s.asignatura),
    h("small", {}, detalle(b)));
  return h("ol", { class: "por-dia" }, dias.map(({ nombre, clases }) => h("li", {},
    h("h3", {}, nombre),
    h("ul", {}, clases.map(item)))));
}

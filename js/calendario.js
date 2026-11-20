// @ts-check
// Calendario semanal: lo usan la app y analisis.html.

import { h } from "./dom.js";
import { nombreTipo, sigla } from "./modelo.js";
import { DIAS, DIAS_CORTO, finMin, formatoHora, inicioMin, rangoPeriodo } from "./periodos.js";

/** @typedef {import("./modelo.js").Seccion} Seccion */

const RE_INICIAL = /(^|[\s,.'-])(\p{L})/gu;

/** "CALDERON, TOMAS" → "Calderon, Tomas". @param {string} t */
export const nombrePropio = (t) => t.toLowerCase().replace(RE_INICIAL, (_, a, b) => a + b.toUpperCase());

/** C.HORA (0761); las agregadas a mano no tienen. @param {Seccion} s */
export const codigo = (s) => (s.codhora > 0 ? String(s.codhora).padStart(4, "0") : "");

/**
 * Tabla semanal: fila = período, celda con rowspan = n.
 * @param {Seccion[]} secciones @param {Map<string, number>} tono
 */
export function grilla(secciones, tono) {
  let kMin = Infinity, kMax = -1, diasUsados = 0;
  /** @type {Map<string, [Seccion, import("./modelo.js").Bloque]>} */
  const inicio = new Map();
  const tapada = new Set();
  for (const s of secciones) {
    for (const b of s.bloques) {
      const [d, k, n] = b;
      kMin = Math.min(kMin, k);
      kMax = Math.max(kMax, k + n - 1);
      diasUsados |= 1 << d;
      inicio.set(`${d},${k}`, [s, b]);
      for (let i = 1; i < n; i++) tapada.add(`${d},${k + i}`);
    }
  }
  const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => d < 5 || diasUsados & (1 << d));
  const filas = [];
  for (let k = kMin; k <= kMax; k++) {
    filas.push(h("tr", {},
      h("th", { scope: "row" }, formatoHora(inicioMin(k)), h("span", { class: "hasta" }, h("span", { class: "sr" }, "–"), formatoHora(finMin(k)))),
      dias.map((d) => {
        if (tapada.has(`${d},${k}`)) return null;
        const c = inicio.get(`${d},${k}`);
        if (!c) return h("td", {});
        const [s, b] = c;
        const [, , n, tipo, aula] = b;
        // Celular: sigla y aula
        return h("td", {
          rowSpan: n, class: n === 1 ? "clase breve" : "clase", "data-codhora": s.codhora, style: `--h:${tono.get(s.codasig)}`,
          onclick: () => detalleClase(s, b, tono),
        },
        // Flota: no cambia el alto de la fila
        h("div", { class: "caja", title: s.asignatura },
          h("b", {}, h("span", { class: "nombre" }, s.asignatura), h("span", { class: "sigla", "aria-hidden": "true" }, sigla(s.asignatura))),
          h("small", { class: "completo" }, [nombreTipo(tipo), aula].filter(Boolean).join(" · ")),
          aula && h("small", { class: "corto", "aria-hidden": "true" }, aula)));
      })));
  }
  return h("div", { class: "grilla" },
    h("table", {},
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Hora"), dias.map((d) => h("th", { scope: "col" }, DIAS_CORTO[d])))),
      h("tbody", {}, filas)));
}

/** @type {HTMLElement | null} */
let hoja = null;
export const celular = matchMedia("(max-width: 47.99rem)");

/**
 * Solo en celular.
 * @param {Seccion} s @param {import("./modelo.js").Bloque} b @param {Map<string, number>} tono
 */
function detalleClase(s, [d, k, n, tipo, aula], tono) {
  if (!celular.matches) return;
  if (!hoja) {
    hoja = h("div", { popover: "auto", class: "hoja vidrio", role: "dialog", "aria-label": "Detalle de la clase" });
    document.body.append(hoja);
  }
  if (!("showPopover" in hoja)) return;
  hoja.replaceChildren(
    h("p", { class: "titulo" }, h("span", { class: "punto", style: `--h:${tono.get(s.codasig)}`, "aria-hidden": "true" }), s.asignatura),
    h("p", {}, h("b", {}, `${DIAS[d]} ${rangoPeriodo(k, n)}`), [nombreTipo(tipo), aula].filter(Boolean).map((t) => ` · ${t}`)),
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
  return h("ol", { class: "por-dia" }, dias.map(({ nombre, clases }) => h("li", {},
    h("h3", {}, nombre),
    h("ul", {}, clases.map(({ s, b: [, k, n, tipo, aula] }) => h("li", { class: "clase", "data-codhora": s.codhora, style: `--h:${tono.get(s.codasig)}` },
      h("span", { class: "hora" }, rangoPeriodo(k, n)),
      h("b", {}, s.asignatura),
      h("small", {}, [nombreTipo(tipo), aula].filter(Boolean).join(" · "))))))));
}

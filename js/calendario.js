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
export const detalle = ([, , , tipo, aula, sub]) =>
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
 * @callback AlTocar
 * @param {Seccion} s @param {Bloque} b @param {HTMLElement} celda
 */

/**
 * Celular: sigla y aula. La caja flota: no cambia el alto de la fila.
 * @param {string} tag "td" o, dentro de un solape, "div"
 * @param {Seccion} s @param {Bloque} b @param {number} filas que cubre @param {Map<string, number>} tono
 * @param {AlTocar} [alTocar] sin él, el detalle solo sale en celular
 * @param {string} [estilo] posición dentro del solape
 */
function celdaClase(tag, s, b, filas, tono, alTocar, estilo = "") {
  const aula = b[4];
  /** @param {Event} e */
  const tocar = (e) => {
    const celda = /** @type {HTMLElement} */ (e.currentTarget);
    if (alTocar) alTocar(s, b, celda);
    else detalleClase(s, b, tono);
  };
  return h(tag, {
    rowSpan: tag === "td" ? filas : null,
    class: filas === 1 ? "clase breve" : "clase",
    "data-codhora": s.codhora,
    style: `--h:${tono.get(s.codasig)};${estilo}`,
    tabindex: alTocar ? 0 : null,
    role: tag === "div" && alTocar ? "button" : null,
    "aria-haspopup": alTocar ? "dialog" : null,
    onclick: tocar,
    onkeydown: alTocar && ((/** @type {KeyboardEvent} */ e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      tocar(e);
    }),
  },
  h("div", { class: "caja", title: s.asignatura },
    h("b", {},
      h("span", { class: "nombre" }, s.asignatura),
      h("span", { class: "sigla", "aria-hidden": "true" }, sigla(s.asignatura))),
    h("small", { class: "completo" }, detalle(b)),
    aula && h("small", { class: "corto", "aria-hidden": "true" }, aula)));
}

/**
 * Clases del mismo día que chocan (subgrupos, datos del portal): una celda
 * con columnas, cada clase a su altura.
 * @param {{s: Seccion, b: Bloque, desde: number, cubre: number}[]} grupo
 * @param {number} desde @param {number} total filas
 * @param {Map<string, number>} tono @param {AlTocar} [alTocar]
 */
function celdaSolape(grupo, desde, total, tono, alTocar) {
  /** @type {number[]} fila libre de cada columna */
  const libre = [];
  const carril = grupo.map((c) => {
    let i = libre.findIndex((f) => f <= c.desde);
    if (i < 0) i = libre.length;
    libre[i] = c.desde + c.cubre;
    return i;
  });
  const n = libre.length;
  const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(3)}%`;
  return h("td", { rowSpan: total, class: "solape" }, grupo.map(({ s, b, desde: d, cubre }, i) =>
    celdaClase("div", s, b, cubre, tono, alTocar,
      `top:${pct((d - desde) / total)};height:${pct(cubre / total)};left:${pct(carril[i] / n)};width:${pct(1 / n)}`)));
}

/** @param {number} desde @param {number} hasta */
const celdaHora = (desde, hasta) => h("th", { scope: "row" },
  formatoHora(desde),
  h("span", { class: "hasta" }, h("span", { class: "sr" }, "–"), formatoHora(hasta)));

/**
 * Tabla semanal: fila = período, celda con rowspan = períodos que cubre.
 * @param {Seccion[]} secciones @param {Map<string, number>} tono @param {AlTocar} [alTocar]
 */
export function grilla(secciones, tono, alTocar) {
  let diasUsados = 0;
  const filas = filasDe(secciones.flatMap((s) => s.bloques));
  /** @type {Map<string, HTMLElement>} */
  const inicio = new Map();
  const tapada = new Set();
  for (let d = 0; d < 7; d++) {
    const clases = secciones.flatMap((s) => s.bloques.filter((b) => b[0] === d).map((b) => {
      const desde = filas.findIndex(([t]) => t >= b[1]);
      const cubre = filas.filter(([t]) => t >= b[1] && t < b[2]).length;
      return { s, b, desde, cubre };
    })).sort((x, y) => x.desde - y.desde || y.cubre - x.cubre);
    if (clases.length) diasUsados |= 1 << d;
    // Grupos de clases que se tocan en alguna fila.
    for (let i = 0; i < clases.length;) {
      let hasta = clases[i].desde + clases[i].cubre, j = i + 1;
      while (j < clases.length && clases[j].desde < hasta) {
        hasta = Math.max(hasta, clases[j].desde + clases[j].cubre);
        j++;
      }
      const grupo = clases.slice(i, j), desde = clases[i].desde;
      const el = grupo.length === 1
        ? celdaClase("td", grupo[0].s, grupo[0].b, grupo[0].cubre, tono, alTocar)
        : celdaSolape(grupo, desde, hasta - desde, tono, alTocar);
      inicio.set(`${d},${filas[desde][0]}`, el);
      for (let f = desde + 1; f < hasta; f++) tapada.add(`${d},${filas[f][0]}`);
      i = j;
    }
  }
  const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => d < 5 || diasUsados & (1 << d));
  /** @param {number} d @param {number} t */
  const celda = (d, t) => {
    if (tapada.has(`${d},${t}`)) return null;
    return inicio.get(`${d},${t}`) ?? h("td", {});
  };
  return h("div", { class: "grilla" },
    h("table", {},
      h("thead", {}, h("tr", {},
        h("th", { scope: "col" }, "Hora"),
        dias.map((d) => h("th", { scope: "col", "data-d": d }, DIAS_CORTO[d])))),
      h("tbody", {}, filas.map(([t, hasta]) => h("tr", { "data-t": t, "data-hasta": hasta },
        celdaHora(t, hasta),
        dias.map((d) => celda(d, t)))))));
}

// ---------- Fantasma: otra sección encima de la grilla, sin recalcular ----------

/**
 * Píxel vertical de un minuto, interpolado entre filas.
 * @param {{t: number, hasta: number, arriba: number, alto: number}[]} filas @param {number} min
 */
function yDe(filas, min) {
  let i = filas.length - 1;
  while (i > 0 && filas[i].t > min) i--;
  const f = filas[i], sig = filas[i + 1];
  const fin = sig ? sig.t : f.hasta;
  const alto = sig ? sig.arriba - f.arriba : f.alto;
  const frac = Math.max(0, Math.min(1, (min - f.t) / (fin - f.t)));
  return f.arriba + frac * alto;
}

/** @param {Element} cont */
export function quitarFantasma(cont) {
  for (const el of cont.querySelectorAll(".fantasma-clase")) el.remove();
  for (const el of cont.querySelectorAll(".saliendo")) el.classList.remove("saliendo");
}

/**
 * Dibuja `nueva` sobre la grilla y atenúa la sección que sale.
 * Los bloques en días que la grilla no muestra no se dibujan.
 * @param {HTMLElement} cont .grilla @param {Seccion} nueva @param {number} sale codhora
 * @param {number | undefined} tono
 */
export function fantasma(cont, nueva, sale, tono) {
  quitarFantasma(cont);
  const base = cont.getBoundingClientRect();
  const dx = cont.scrollLeft - base.left, dy = cont.scrollTop - base.top;
  /** @type {Map<number, DOMRect>} */
  const cols = new Map([...cont.querySelectorAll("thead th[data-d]")].map((th) => [
    Number(/** @type {HTMLElement} */ (th).dataset.d), th.getBoundingClientRect()]));
  const filas = [...cont.querySelectorAll("tbody tr[data-t]")].map((tr) => {
    const r = tr.getBoundingClientRect();
    const { t, hasta } = /** @type {HTMLElement} */ (tr).dataset;
    return { t: Number(t), hasta: Number(hasta), arriba: r.top, alto: r.height };
  });
  if (!filas.length) return;
  for (const el of cont.querySelectorAll(`.clase[data-codhora="${sale}"]`)) el.classList.add("saliendo");
  for (const b of nueva.bloques) {
    const col = cols.get(b[0]);
    if (!col) continue;
    const arriba = yDe(filas, b[1]), abajo = yDe(filas, b[2]);
    cont.append(h("div", {
      class: "fantasma-clase",
      "aria-hidden": "true",
      style: `--h:${tono};left:${col.left + dx}px;top:${arriba + dy}px;width:${col.width}px;height:${Math.max(abajo - arriba, 12)}px`,
    }, h("b", {}, sigla(nueva.asignatura)), h("small", {}, rango(b[1], b[2]))));
  }
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

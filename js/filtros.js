// @ts-check
// Tarjeta "Ajustar" del horario y sus controles.

import { recalcular } from "./busqueda.js";
import { celular, nombrePropio } from "./calendario.js";
import { conDeshacer } from "./deshacer.js";
import { h, marcado } from "./dom.js";
import { dejarDeEvitar } from "./elecciones.js";
import { finMin, formatoHora, inicioMin } from "./periodos.js";
import { cumpleHorario, ponerTurno } from "./preferencias.js";
import { cambio } from "./ui.js";

/** @typedef {import("./ui.js").App} App */

/** @returns {[string, string, string][]} valor, nombre, horas */
const turnos = () => [
  ["manana", "Mañana", `${formatoHora(inicioMin(0))}–${formatoHora(finMin(6))}`],
  ["tarde", "Tarde", `${formatoHora(inicioMin(7))}–${formatoHora(finMin(11))}`],
  ["noche", "Noche", `${formatoHora(inicioMin(12))}+`],
];

let grupoSeg = 0;

/**
 * Radios por debajo.
 * @param {string} etiqueta @param {[string, string, string?, boolean?][]} opciones valor, texto, título, desactivada
 * @param {string} actual @param {(v: string) => void} alElegir @param {string} [clase]
 */
export function segmentado(etiqueta, opciones, actual, alElegir, clase = "") {
  const nombre = `seg-${++grupoSeg}`;
  return h("div", { class: `segmentado ${clase}`, role: "radiogroup", "aria-label": etiqueta },
    opciones.map(([v, texto, titulo, desactivada]) => h("label", { title: titulo },
      h("input", {
        type: "radio",
        name: nombre,
        value: v,
        checked: v === actual,
        disabled: desactivada,
        "data-foco": `${etiqueta}:${v}`,
        onchange: () => alElegir(v),
      }),
      h("span", {}, texto))));
}

/**
 * @param {string} texto @param {boolean} valor @param {(v: boolean) => void} alCambiar
 */
const conmutador = (texto, valor, alCambiar) => h("label", { class: "conmutador" },
  h("span", {}, texto),
  h("input", {
    type: "checkbox",
    role: "switch",
    class: "switch",
    checked: valor,
    "data-foco": texto,
    onchange: (/** @type {Event} */ e) => alCambiar(marcado(e)),
  }));

/** @param {App} app @param {() => void} hacer */
export function filtrar(app, hacer) {
  hacer();
  cambio(app);
  recalcular(app);
}

/** @param {number} n @param {string} uno @param {string} varios */
const contar = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Chips que quitan fijadas, excluidas y profesores evitados. @param {App} app */
function quitables(app) {
  const { prefs } = app.estado;
  /** @param {string} texto @param {() => void} quitar @param {string} hecho */
  const quitable = (texto, quitar, hecho) => h("button", {
    type: "button",
    class: "chip-quitar",
    "aria-label": `Quitar: ${texto}`,
    onclick: () => conDeshacer(app, hecho, () => filtrar(app, quitar)),
  }, texto, h("span", { "aria-hidden": "true" }, "×"));

  const { fijas, excluidas, evitados } = prefs;
  return [
    fijas.length > 0 && quitable(
      contar(fijas.length, "fijada", "fijadas"),
      () => { prefs.fijas = []; },
      "Secciones soltadas"),
    excluidas.length > 0 && quitable(
      contar(excluidas.length, "excluida", "excluidas"),
      () => { prefs.excluidas = []; },
      "Secciones de vuelta"),
    ...evitados.map((p) => quitable(
      `Sin ${nombrePropio(p)}`,
      () => dejarDeEvitar(app, p),
      `${nombrePropio(p)} de vuelta`)),
  ].filter((x) => x !== false);
}

let filtrosAbiertos = false;

/** @param {App} app */
export function filtros(app) {
  const { requeridas, prefs } = app.estado;
  const elegidas = app.secciones.filter((s) => requeridas.includes(s.codasig));
  const enUso = turnos().filter(([v]) => elegidas.some((s) => cumpleHorario(s, v)));
  const chips = quitables(app);
  const activos = (prefs.horario ? 1 : 0) + (prefs.menosDias ? 1 : 0) + chips.length;

  /** @type {[string, string, string?][]} */
  const opcionesTurno = [["", "Da igual"], ...enUso];
  const turno = enUso.length > 1 && h("div", { class: "filtro" },
    h("span", { class: "nombre-filtro" }, "Turno"),
    segmentado("Turno", opcionesTurno, prefs.horario ?? "", (v) => filtrar(app, () => ponerTurno(prefs, v))));

  return h("details", {
    class: "filtros tarjeta",
    open: !celular.matches || filtrosAbiertos,
    ontoggle: (/** @type {Event} */ e) => {
      if (celular.matches) filtrosAbiertos = /** @type {HTMLDetailsElement} */ (e.target).open;
    },
  },
  h("summary", {}, "Ajustar", activos > 0 && h("span", { class: "insignia" }, activos)),
  h("div", { class: "filtros-cuerpo" },
    turno,
    prefs.horario && conmutador("Solo ese turno", !!prefs.soloTurno, (v) => filtrar(app, () => {
      prefs.soloTurno = v;
    })),
    conmutador("Ir menos días", !!prefs.menosDias, (v) => filtrar(app, () => {
      prefs.menosDias = v;
    })),
    chips.length > 0 && h("div", { class: "filtro" }, chips)));
}

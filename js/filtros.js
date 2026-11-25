// @ts-check
// Tarjeta "Ajustar" del horario y sus controles.

import { recalcular } from "./busqueda.js";
import { celular, nombrePropio } from "./calendario.js";
import { conDeshacer } from "./deshacer.js";
import { contar, h, marcado } from "./dom.js";
import { dejarDeEvitar } from "./elecciones.js";
import { cambio } from "./ui.js";

/** @typedef {import("./ui.js").App} App */

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
function filtrar(app, hacer) {
  hacer();
  cambio(app);
  recalcular(app);
}

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
  const { prefs } = app.estado;
  const chips = quitables(app);
  const activos = (prefs.dias ? 1 : 0) + chips.length;

  return h("details", {
    class: "filtros tarjeta",
    open: !celular.matches || filtrosAbiertos,
    ontoggle: (/** @type {Event} */ e) => {
      if (celular.matches) filtrosAbiertos = /** @type {HTMLDetailsElement} */ (e.target).open;
    },
  },
  h("summary", {}, "Ajustar", activos > 0 && h("span", { class: "insignia" }, activos)),
  h("div", { class: "filtros-cuerpo" },
    conmutador("Ir menos días", !!prefs.dias, (v) => filtrar(app, () => {
      prefs.dias = v ? 2 : 0;
    })),
    chips.length > 0 && h("div", { class: "filtro" }, chips)));
}

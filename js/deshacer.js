// @ts-check
// Aviso con "Deshacer" tras quitar algo. Uno a la vez.

import { recalcular } from "./busqueda.js";
import { $, h, llenar } from "./dom.js";
import { cambio, repintar } from "./ui.js";

/** @typedef {import("./ui.js").App} App */

const ESPERA = 6000;

/** @type {(() => void) | null} */
let deshacer = null;
let plazo = 0;

export function cerrarAviso() {
  clearTimeout(plazo);
  deshacer = null;
  $("tostada").replaceChildren();
}

function correrPlazo() {
  clearTimeout(plazo);
  plazo = setTimeout(cerrarAviso, ESPERA);
}

/**
 * @param {App} app @param {string} texto qué pasó, en pasado @param {() => void} hacer
 */
export function conDeshacer(app, texto, hacer) {
  const antes = JSON.stringify(app.estado);
  hacer();
  deshacer = () => {
    Object.assign(app.estado, JSON.parse(antes));
    cambio(app);
    if (location.hash === "#opciones") recalcular(app);
    else repintar(app);
  };
  llenar("tostada", h("div", {},
    h("span", {}, texto),
    h("button", { type: "button", class: "chico", onclick: deshacerUltimo }, "Deshacer")));
  correrPlazo();
}

export const hayDeshacer = () => deshacer !== null;

export function deshacerUltimo() {
  const d = deshacer;
  cerrarAviso();
  d?.();
}

/** El aviso no se cierra mientras el puntero o el foco estén encima. */
export function iniciarTostada() {
  const tostada = $("tostada");
  /** @param {Node | null} destino */
  const seguir = (destino) => {
    if (deshacer && !tostada.contains(destino)) correrPlazo();
  };
  tostada.addEventListener("pointerenter", () => clearTimeout(plazo));
  tostada.addEventListener("focusin", () => clearTimeout(plazo));
  tostada.addEventListener("pointerleave", () => seguir(document.activeElement));
  tostada.addEventListener("focusout", (e) => seguir(/** @type {Node | null} */ (e.relatedTarget)));
}

// @ts-check
// Materia a mano. El formulario se arma una vez: no pierde lo escrito.

import { $, h, llenar } from "./dom.js";
import { grupoManual } from "./entrada.js";
import { agregarGrupos } from "./materias.js";
import { DIAS, finMin, formatoHora, inicioMin } from "./periodos.js";

/**
 * @typedef {import("./ui.js").App} App
 * @typedef {import("./modelo.js").Bloque} Bloque
 */

/** Último período del día: 9:10pm. */
const ULTIMO_K = 17;

/** @type {WeakMap<Element, () => Bloque>} */
const filasLeer = new WeakMap();

/** @param {number} k @param {(min: number) => number} minutos */
const opcionHora = (k, minutos) => h("option", { value: String(k) }, formatoHora(minutos(k)));

/** @param {number} desde */
const periodosDesde = (desde) => Array.from({ length: ULTIMO_K + 1 - desde }, (_, i) => desde + i);

/** @param {Record<string, any>} props @param {...any} opciones */
const select = (props, ...opciones) => /** @type {HTMLSelectElement} */ (h("select", props, ...opciones));

/** @param {number} [d] @param {number} [k] @param {number} [n] @param {string} [tipo] @param {string} [aula] */
function filaBloque(d = 0, k = 0, n = 2, tipo = "C", aula = "") {
  const dia = select({ "aria-label": "Día", value: String(d) },
    DIAS.map((t, i) => h("option", { value: String(i) }, t)));
  const desde = select({ "aria-label": "Desde", value: String(k) },
    periodosDesde(0).map((i) => opcionHora(i, inicioMin)));
  const hasta = select({ "aria-label": "Hasta" });
  const ponerHasta = (/** @type {number} */ fin) => {
    const k0 = Number(desde.value);
    hasta.replaceChildren(...periodosDesde(k0).map((i) => opcionHora(i, finMin)));
    hasta.value = String(Math.min(Math.max(fin, k0), ULTIMO_K));
  };
  ponerHasta(k + n - 1);
  desde.addEventListener("change", () => ponerHasta(Number(desde.value) + 1));

  const clase = select({ "aria-label": "Tipo", value: tipo },
    h("option", { value: "C" }, "Clase"),
    h("option", { value: "L" }, "Lab"));
  const salon = /** @type {HTMLInputElement} */ (h("input", {
    type: "text",
    placeholder: "Aula",
    "aria-label": "Aula (opcional)",
    value: aula,
    size: 6,
  }));
  const quitar = h("button", {
    type: "button",
    class: "quitar",
    "aria-label": "Quitar este día",
    onclick: () => {
      const lista = fila.parentElement;
      fila.remove();
      /** @type {HTMLElement | null | undefined} */ (lista?.querySelector("select"))?.focus();
    },
  }, "×");
  const fila = h("div", { class: "bloque-manual" },
    dia, desde, h("span", { "aria-hidden": "true" }, "–"), hasta, clase, salon, quitar);

  filasLeer.set(fila, () => [
    Number(dia.value),
    inicioMin(Number(desde.value)),
    finMin(Number(hasta.value)),
    clase.value,
    salon.value.trim(),
  ]);
  return fila;
}

/** @param {App} app @param {"asignatura" | "profesor"} campo */
function sugerencias(app, campo) {
  const valores = app.estado.grupos.flatMap((g) => g.materias.map((m) => m[campo])).filter(Boolean);
  return [...new Set(valores)].sort().map((v) => h("option", { value: v }));
}

/** @param {App} app */
export function actualizarSugerencias(app) {
  document.getElementById("sug-materias")?.replaceChildren(...sugerencias(app, "asignatura"));
  document.getElementById("sug-profes")?.replaceChildren(...sugerencias(app, "profesor"));
}

/** @param {string} etiqueta @param {Record<string, any>} props */
const campo = (etiqueta, props) => h("label", { class: "campo" },
  h("span", {}, etiqueta),
  h("input", { type: "text", autocomplete: "off", ...props }));

/** Día siguiente, misma hora. @param {HTMLElement} lista */
function otroDia(lista) {
  const ult = lista.lastElementChild && filasLeer.get(lista.lastElementChild)?.();
  const nueva = ult ? filaBloque(Math.min(ult[0] + 2, 6), ult[1], ult[2], ult[3], ult[4]) : filaBloque();
  lista.append(nueva);
  /** @type {HTMLElement} */ (nueva.querySelector("select")).focus();
}

/** @param {App} app @param {string} [aviso] */
export function formularioManual(app, aviso = "") {
  const lista = h("div", { class: "bloques-manual" }, filaBloque());
  const msg = h("p", { role: "status", class: aviso ? "ok" : "" }, aviso);

  /** @param {SubmitEvent} e */
  const enviar = (e) => {
    e.preventDefault();
    const f = /** @type {HTMLFormElement} */ (e.target);
    const v = (/** @type {string} */ n) => /** @type {HTMLInputElement} */ (f.elements.namedItem(n)).value;
    try {
      const datos = {
        asignatura: v("asignatura"),
        profesor: v("profesor"),
        grupo: v("grupo"),
        bloques: [...lista.children].map((fila) => /** @type {() => Bloque} */ (filasLeer.get(fila))()),
      };
      const g = grupoManual(datos, app.estado.grupos);
      agregarGrupos(app, [g]);
      formularioManual(app, `${g.materias[0].asignatura} agregada`);
      /** @type {HTMLElement | null} */ ($("a-mano").querySelector("input"))?.focus();
    } catch (err) {
      msg.textContent = /** @type {Error} */ (err).message;
      msg.className = "error";
    }
  };

  const form = h("form", { class: "form-manual", onsubmit: enviar },
    h("div", { class: "campos-manual" },
      campo("Materia", {
        name: "asignatura",
        required: true,
        list: "sug-materias",
        placeholder: "Sistemas operativos",
      }),
      campo("Profesor", { name: "profesor", list: "sug-profes", placeholder: "Opcional" }),
      campo("Grupo", { name: "grupo", placeholder: "Opcional", size: 8, class: "campo-corto" })),
    h("datalist", { id: "sug-materias" }, sugerencias(app, "asignatura")),
    h("datalist", { id: "sug-profes" }, sugerencias(app, "profesor")),
    lista,
    h("p", { class: "fila" },
      h("button", { type: "button", class: "secundario chico", onclick: () => otroDia(lista) }, "+ Otro día")),
    h("p", { class: "fila" }, h("button", { type: "submit" }, "Agregar materia")),
    msg);

  llenar("a-mano", h("p", { class: "titulo" }, "O agrégala a mano"), form);
}

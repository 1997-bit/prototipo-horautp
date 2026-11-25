// @ts-check
// Inspector de una clase del horario: su sección, fijar o excluir, y las otras
// secciones que caben sin mover nada. Pasar sobre una la dibuja en la grilla.

import { recalcular } from "./busqueda.js";
import { celular, codigo, detalle, fantasma, nombrePropio, punto, quitarFantasma } from "./calendario.js";
import { conDeshacer } from "./deshacer.js";
import { h } from "./dom.js";
import { alternarFija, excluir } from "./elecciones.js";
import { DIAS_CORTO, formatoHora, rango } from "./periodos.js";
import { reemplazos } from "./solver.js";

/**
 * @typedef {import("./ui.js").App} App
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./solver.js").Opcion} Opcion
 */

/** @type {HTMLElement | null} */
let panel = null;
/** @type {{celda: HTMLElement, grilla: HTMLElement} | null} */
let abierto = null;
/** Tocar la misma clase cierra: el cierre ligero llega antes que el click. */
let cerrado = { celda: /** @type {HTMLElement | null} */ (null), t: 0 };

function crearPanel() {
  const el = h("div", { popover: "auto", role: "dialog", "aria-label": "Sección" });
  el.addEventListener("toggle", (e) => {
    if (/** @type {ToggleEvent} */ (e).newState !== "closed" || !abierto) return;
    quitarFantasma(abierto.grilla);
    const { celda } = abierto;
    abierto = null;
    cerrado = { celda, t: performance.now() };
    if (celda.isConnected && el.contains(document.activeElement)) celda.focus({ preventScroll: true });
  });
  addEventListener("hashchange", cerrarInspector);
  document.body.append(el);
  return el;
}

export function cerrarInspector() {
  if (panel?.matches(":popover-open")) panel.hidePopover();
}

/** "C.Hora 0761 · Grupo 1GS231 · Zurita, Armando". @param {Seccion} s */
const quien = (s) => [codigo(s) && `C.Hora ${codigo(s)}`, s.grupo && `Grupo ${s.grupo}`, nombrePropio(s.profesor)]
  .filter(Boolean).join(" · ");

/** "Lun 7:00am, Mié 8:40am". @param {Seccion} s */
const cuando = (s) => s.bloques.map(([d, ini]) => `${DIAS_CORTO[d]} ${formatoHora(ini)}`).join(", ");

/** Junto a la clase; si no cabe a la derecha, a la izquierda. @param {HTMLElement} el @param {HTMLElement} celda */
function colocar(el, celda) {
  const r = celda.getBoundingClientRect();
  const m = 8, w = el.offsetWidth, alto = el.offsetHeight;
  let x = r.right + m;
  if (x + w > innerWidth - m) x = r.left - m - w;
  x = Math.max(m, Math.min(x, innerWidth - m - w));
  const y = Math.max(m, Math.min(r.top, innerHeight - m - alto));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

/**
 * @param {App} app @param {Opcion} o @param {Seccion} s @param {HTMLElement} celda
 * @param {Map<string, number>} tono
 */
export function inspeccionar(app, o, s, celda, tono) {
  panel ??= crearPanel();
  if (!("showPopover" in panel)) return;
  const grilla = /** @type {HTMLElement} */ (celda.closest(".grilla"));
  if (cerrado.celda === celda && performance.now() - cerrado.t < 400) return;
  cerrarInspector();

  const { prefs } = app.estado;
  const fija = prefs.fijas.includes(s.codhora);
  const otras = reemplazos(app.secciones, o.secciones, prefs).get(s.codhora) ?? [];
  const hecho = () => panel?.hidePopover();

  const fijar = h("button", {
    type: "button",
    class: `chico ${fija ? "" : "secundario"}`,
    "aria-pressed": String(fija),
    onclick: () => {
      hecho();
      const previo = fija ? null : app.resultado;
      alternarFija(app, s);
      recalcular(app, previo);
    },
  }, fija ? "Fijada" : "Fijar");
  const quitar = h("button", {
    type: "button",
    class: "chico fantasma",
    onclick: () => {
      hecho();
      conDeshacer(app, `${[s.asignatura, s.grupo].filter(Boolean).join(" · ")} excluida`, () => {
        const previo = app.resultado;
        excluir(app, s);
        recalcular(app, previo);
      });
    },
  }, "Excluir");

  /** @param {Seccion} x */
  const alternativa = (x) => {
    const ver = () => fantasma(grilla, x, s.codhora, tono.get(s.codasig));
    const dejar = () => quitarFantasma(grilla);
    return h("li", {}, h("button", {
      type: "button",
      class: "alternativa",
      onpointerenter: (/** @type {PointerEvent} */ e) => { if (e.pointerType === "mouse") ver(); },
      onpointerleave: dejar,
      onfocus: ver,
      onblur: dejar,
      onclick: () => {
        hecho();
        conDeshacer(app, `${s.asignatura}: ${codigo(x) || x.grupo}`, () => {
          const previo = app.resultado;
          alternarFija(app, x);
          recalcular(app, previo);
        });
      },
    },
    h("span", {}, h("b", {}, codigo(x) || x.grupo || "—"), " ", nombrePropio(x.profesor)),
    h("small", {}, cuando(x))));
  };

  panel.className = celular.matches ? "hoja inspector vidrio" : "inspector flotante vidrio";
  panel.replaceChildren(
    h("p", { class: "titulo" }, punto(tono.get(s.codasig)), s.asignatura),
    h("p", { class: "quien" }, quien(s)),
    h("ul", { class: "bloques", role: "list" },
      s.bloques.map((b) => h("li", {}, h("b", {}, `${DIAS_CORTO[b[0]]} ${rango(b[1], b[2])}`), " ", detalle(b)))),
    h("p", { class: "fila" }, fijar, quitar),
    ...(otras.length ? [
      h("h3", {}, "Cambiar por"),
      h("ul", { class: "alternativas", role: "list" }, otras.map(alternativa)),
    ] : []));
  abierto = { celda, grilla };
  panel.showPopover();
  if (!celular.matches) colocar(panel, celda);
  /** @type {HTMLElement | null} */ (panel.querySelector("button"))?.focus({ preventScroll: true });
}

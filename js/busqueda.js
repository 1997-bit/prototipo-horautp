// @ts-check
// Problemas chicos en el hilo principal; grandes, en el Worker.

import { quieto } from "./ajustes.js";
import { $ } from "./dom.js";
import { renderOpciones } from "./horario.js";
import { candidatas, resolver } from "./solver.js";

/**
 * @typedef {import("./ui.js").App} App
 * @typedef {import("./solver.js").Resultado} Resultado
 */

/** Combinaciones posibles a partir de las que va al Worker. */
const UMBRAL = 1e6;

/** @type {Worker | null} */
let worker = null;
let trabajando = false;

export function cortarWorker() {
  if (!trabajando) return;
  worker?.terminate();
  worker = null;
  trabajando = false;
}

/** @param {App} app */
const tamano = (app) => [...candidatas(app.secciones, app.estado.requeridas, app.estado.prefs).values()]
  .reduce((t, l) => t * l.length, 1);

/**
 * Nombres de View Transition, numerados por bloque.
 * @param {boolean} poner
 */
function nombrar(poner) {
  /** @type {Map<string, number>} */
  const vistos = new Map();
  const clases = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("#contenido-opciones .clase"));
  for (const el of clases) {
    el.style.viewTransitionName = "";
    if (!poner || !el.closest(".actual") || !el.checkVisibility?.()) continue;
    const c = el.dataset.codhora ?? "";
    const i = vistos.get(c) ?? 0;
    vistos.set(c, i + 1);
    el.style.viewTransitionName = `clase-${c}-${i}`;
  }
  for (const [sel, nombre] of [[".carrusel", "carrusel"], [".materias-opcion", "materias-opcion"]]) {
    const el = /** @type {HTMLElement | null} */ (document.querySelector(`#contenido-opciones ${sel}`));
    if (el) el.style.viewTransitionName = poner ? nombre : "";
  }
}

const nombrarClases = () => nombrar(true);
const borrarNombres = () => nombrar(false);

/**
 * Con `animar`, cada clase viaja a su lugar.
 * @param {App} app @param {boolean} animar
 */
function pintarResultado(app, animar) {
  if (location.hash !== "#opciones") return;
  if (!animar || !document.startViewTransition || quieto()) {
    renderOpciones(app);
    return;
  }
  nombrarClases();
  document.startViewTransition(() => {
    renderOpciones(app);
    nombrarClases();
  }).finished.finally(borrarNombres);
}

/**
 * Chico: deja app.resultado y devuelve true sin pintar. Grande: Worker.
 * @param {App} app
 */
export function buscar(app) {
  const id = ++app.pedido;
  const { requeridas, prefs } = app.estado;
  if (tamano(app) <= UMBRAL) {
    const r = resolver(app.secciones, requeridas, prefs);
    cortarWorker();
    app.enCurso = 0;
    app.resultado = r;
    app.opcion = 0;
    return true;
  }

  app.enCurso = id;
  const listo = (/** @type {Resultado} */ r) => {
    if (app.enCurso !== id) return;
    app.enCurso = 0;
    // Con vista previa, se completa sin moverse de la opción.
    const previa = app.resultado !== null;
    app.resultado = r;
    if (!previa) app.opcion = 0;
    const atenuada = $("contenido-opciones").getAttribute("aria-busy") === "true";
    pintarResultado(app, !previa && atenuada);
  };
  const enHilo = () => listo(resolver(app.secciones, requeridas, prefs));
  try {
    cortarWorker();
    worker ??= new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    trabajando = true;
    worker.onmessage = (e) => {
      trabajando = false;
      listo(e.data.resultado);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker?.terminate();
      worker = null;
      trabajando = false;
      enHilo();
    };
    worker.postMessage({ id, secciones: app.secciones, requeridas, prefs });
  } catch {
    enHilo();
  }
  return false;
}

/**
 * Deja la opción atenuada hasta la nueva búsqueda.
 * Si solo se achican las combinaciones, `previo` adelanta las que siguen valiendo.
 * @param {App} app @param {Resultado | null} [previo]
 */
export function recalcular(app, previo = null) {
  $("contenido-opciones").setAttribute("aria-busy", "true");
  const listo = buscar(app);
  if (!listo && previo?.estado === "OK") adelantar(app, previo);
  if (app.resultado) pintarResultado(app, true);
}

/** @param {App} app @param {Extract<Resultado, {estado: "OK"}>} previo */
function adelantar(app, previo) {
  const { requeridas, prefs } = app.estado;
  // Por codhora: las secciones se reconstruyen en cada cambio
  const validas = new Set([...candidatas(app.secciones, requeridas, prefs).values()].flat().map((c) => c.s.codhora));
  const quedan = previo.opciones.filter((o) => o.secciones.every((s) => validas.has(s.codhora)));
  if (!quedan.length) return;
  app.resultado = { estado: "OK", opciones: quedan, parcial: previo.parcial };
  app.opcion = 0;
}

// @ts-check
// Estado de la app y pantallas. Todo cambio de app.estado pasa por cambio().

import { cortarWorker } from "./busqueda.js";
import { cerrarAviso } from "./deshacer.js";
import { guardar } from "./estado.js";
import { renderOpciones } from "./horario.js";
import { cerrarInspector } from "./inspector.js";
import { renderMaterias } from "./materias.js";
import { construirSecciones } from "./modelo.js";
import { podar } from "./preferencias.js";

/**
 * @typedef {import("./estado.js").Estado} Estado
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./modelo.js").Grupo} Grupo
 * @typedef {import("./solver.js").Resultado} Resultado
 * @typedef {{estado: Estado, secciones: Seccion[], resultado: Resultado | null, opcion: number,
 *            pedido: number, enCurso: number, mostradas: Set<number> | null}} App
 */

/** Render de cada paso, en orden. @type {Record<string, (app: App) => void>} */
export const PASOS = { materias: renderMaterias, opciones: renderOpciones };

export const pasoActual = () => {
  const id = location.hash.slice(1);
  return id in PASOS ? id : "materias";
};

/** @param {App} app */
export const repintar = (app) => PASOS[pasoActual()](app);

/**
 * Lo calculado ya no vale; el deshacer viejo pisaría lo nuevo.
 * Lo que apunta a secciones quitadas sale aquí, antes de guardar.
 * @param {App} app
 */
export function descartar(app) {
  cortarWorker(app);
  cerrarAviso();
  cerrarInspector();
  app.secciones = construirSecciones(app.estado.grupos);
  podar(app.estado, app.secciones);
  app.resultado = null;
  app.opcion = 0;
  app.enCurso = 0;
}

/** @param {App} app */
export function cambio(app) {
  descartar(app);
  guardar(app.estado);
}

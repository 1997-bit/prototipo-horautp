// @ts-check

import { guardarLocal, leerLocal } from "./dom.js";

/**
 * Prefs con las listas siempre presentes.
 * @typedef {import("./preferencias.js").Prefs & {solo: Record<string, string[]>,
 *            fijas: number[], excluidas: number[], evitados: string[]}} PrefsEstado
 * @typedef {{grupos: import("./modelo.js").Grupo[], requeridas: string[], prefs: PrefsEstado}} Estado
 */

const CLAVE = "horautp:v1";

/** @returns {Estado} */
const vacio = () => ({
  grupos: [],
  requeridas: [],
  prefs: { solo: {}, dias: 0, fijas: [], excluidas: [], evitados: [] },
});

/** @returns {Estado} */
export function cargar() {
  const base = vacio();
  try {
    const e = JSON.parse(leerLocal(CLAVE) ?? "null");
    if (!e || !Array.isArray(e.grupos)) return base;
    return { ...base, ...e, prefs: { ...base.prefs, ...e.prefs } };
  } catch {
    return base; // corrupto
  }
}

// Safari borra a los 7 días sin visita. Firefox pide permiso y no borra: se omite.
const FIREFOX = /Firefox\//.test(navigator.userAgent);
let persistencia = false;
function pedirPersistencia() {
  persistencia = true;
  if (FIREFOX) return;
  navigator.storage?.persisted?.().then((ya) => ya || navigator.storage.persist()).catch(() => {});
}

/** @param {() => void} alCambiar */
export function escucharOtrasPestanas(alCambiar) {
  addEventListener("storage", (ev) => {
    if (ev.key === CLAVE) alCambiar();
  });
}

/** @param {Estado} e */
export function guardar(e) {
  guardarLocal(CLAVE, JSON.stringify(e));
  if (!persistencia && e.grupos.length) pedirPersistencia();
}

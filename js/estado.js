// @ts-check

import { migrarGrupos } from "./modelo.js";

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
  prefs: { solo: {}, soloTurno: false, menosDias: false, fijas: [], excluidas: [], evitados: [] },
});

/** Prefs de versiones anteriores. @param {Record<string, any>} viejas */
export function migrar(viejas) {
  const { materias = {}, diasMax, unGrupo, evitarHuecos, pesos, ...prefs } = viejas;
  prefs.solo ??= {};
  for (const [c, pm] of Object.entries(materias)) {
    const solo = [...new Set([...(pm.solo ?? []), ...(pm.profesor ? [pm.profesor] : [])])];
    if (solo.length) prefs.solo[c] = solo;
    if (pm.horario) prefs.horario ??= pm.horario;
  }
  if (diasMax) prefs.menosDias = true;
  return prefs;
}

/** @returns {Estado} */
export function cargar() {
  const base = vacio();
  try {
    const e = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    if (!e || !Array.isArray(e.grupos)) return base;
    return {
      ...base,
      ...e,
      grupos: migrarGrupos(e.grupos),
      prefs: { ...base.prefs, ...migrar(e.prefs ?? {}) },
    };
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
  try {
    localStorage.setItem(CLAVE, JSON.stringify(e));
    if (!persistencia && e.grupos.length) pedirPersistencia();
  } catch {
    // modo privado o sin espacio
  }
}

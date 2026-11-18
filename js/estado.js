// @ts-check
// Estado persistente en localStorage. Nada sale del navegador.

/**
 * @typedef {{grupos: import("./modelo.js").Grupo[], requeridas: string[],
 *            prefs: import("./preferencias.js").Prefs & {materias: Record<string, import("./preferencias.js").PrefMateria>,
 *                                                          fijas: number[], excluidas: number[]},
 *            inicio: string, semanas: number}} Estado
 */

const CLAVE = "horautp:v1";

/** @returns {Estado} */
const vacio = () => ({
  grupos: [],
  requeridas: [],
  prefs: { materias: {}, diasMax: null, evitarHuecos: false, unGrupo: false, fijas: [], excluidas: [] },
  inicio: "",
  semanas: 16,
});

/** @returns {Estado} */
export function cargar() {
  try {
    const e = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    if (e && Array.isArray(e.grupos)) {
      const base = vacio();
      return { ...base, ...e, prefs: { ...base.prefs, ...e.prefs } };
    }
  } catch {
    // estado corrupto: empezar de cero
  }
  return vacio();
}

/** @param {Estado} e */
export function guardar(e) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(e));
  } catch {
    // modo privado o sin espacio: la app sigue funcionando sin persistir
  }
}

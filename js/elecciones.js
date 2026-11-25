// @ts-check
// Lo que el usuario pide de secciones y profesores, sobre app.estado.prefs.

import { cambio } from "./ui.js";

/**
 * @typedef {import("./ui.js").App} App
 * @typedef {import("./modelo.js").Seccion} Seccion
 */

/** @param {App} app @param {string} codasig */
export const profesoresDe = (app, codasig) =>
  [...new Set(app.secciones.filter((s) => s.codasig === codasig).map((s) => s.profesor))].sort();

/** @param {App} app @param {string} codasig @param {string[]} solo */
function ponerSolo(app, codasig, solo) {
  const p = app.estado.prefs;
  if (solo.length) p.solo[codasig] = solo;
  else delete p.solo[codasig];
}

/** Evitado: fuera de sus fijas y de todo "lo quiero". @param {App} app @param {string} profesor */
function evitar(app, profesor) {
  const p = app.estado.prefs;
  p.evitados = [...p.evitados, profesor];
  const suyas = new Set(app.secciones.filter((s) => s.profesor === profesor).map((s) => s.codhora));
  p.fijas = p.fijas.filter((c) => !suyas.has(c));
  for (const [c, solo] of Object.entries(p.solo)) {
    if (solo.includes(profesor)) ponerSolo(app, c, solo.filter((x) => x !== profesor));
  }
}

/** @param {App} app @param {string} profesor */
export function dejarDeEvitar(app, profesor) {
  const p = app.estado.prefs;
  p.evitados = p.evitados.filter((x) => x !== profesor);
}

/**
 * "quiero", "no" o "" para un profesor en una materia.
 * @param {App} app @param {string} codasig @param {string} profesor
 */
export function estadoProfe(app, codasig, profesor) {
  const p = app.estado.prefs;
  if (p.evitados.includes(profesor)) return "no";
  return p.solo[codasig]?.includes(profesor) ? "quiero" : "";
}

/**
 * Lo quiero: solo sus secciones en esta materia. No: fuera en todas.
 * @param {App} app @param {string} codasig @param {string} profesor @param {string} estado
 */
export function ponerEnMateria(app, codasig, profesor, estado) {
  const solo = (app.estado.prefs.solo[codasig] ?? []).filter((x) => x !== profesor);
  ponerSolo(app, codasig, estado === "quiero" ? [...solo, profesor] : solo);
  if (estado === "no") evitar(app, profesor);
  else if (app.estado.prefs.evitados.includes(profesor)) dejarDeEvitar(app, profesor);
}

/**
 * Si descartarlo deja sin profesores a alguna materia elegida.
 * @param {App} app @param {string} profesor
 */
export function sinSalida(app, profesor) {
  const { prefs, requeridas } = app.estado;
  return requeridas.some((c) => {
    const ps = profesoresDe(app, c);
    const solo = (prefs.solo[c] ?? []).filter((x) => x !== profesor);
    const descartado = (/** @type {string} */ q) =>
      prefs.evitados.includes(q) || (solo.length > 0 && !solo.includes(q));
    return ps.includes(profesor) && ps.every((q) => q === profesor || descartado(q));
  });
}

/**
 * Reemplaza otra fija de la misma materia.
 * @param {App} app @param {Seccion} s
 */
export function alternarFija(app, s) {
  const p = app.estado.prefs;
  const misma = new Set(app.secciones.filter((x) => x.codasig === s.codasig).map((x) => x.codhora));
  p.fijas = p.fijas.includes(s.codhora)
    ? p.fijas.filter((c) => c !== s.codhora)
    : [...p.fijas.filter((c) => !misma.has(c)), s.codhora];
  cambio(app);
}

/** @param {App} app @param {Seccion} s */
export function excluir(app, s) {
  const p = app.estado.prefs;
  if (!p.excluidas.includes(s.codhora)) p.excluidas = [...p.excluidas, s.codhora];
  p.fijas = p.fijas.filter((c) => c !== s.codhora);
  cambio(app);
}

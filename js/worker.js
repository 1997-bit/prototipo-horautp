// @ts-check
// Solver fuera del hilo principal.

import { resolver } from "./solver.js";

onmessage = (e) => {
  const { id, secciones, requeridas, prefs } = e.data;
  postMessage({ id, resultado: resolver(secciones, requeridas, prefs) });
};

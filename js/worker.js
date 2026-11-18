// @ts-check
// Corre el solver fuera del hilo principal para que la página no se congele.

import { resolver } from "./solver.js";

onmessage = (e) => {
  const { id, secciones, requeridas, prefs } = e.data;
  postMessage({ id, resultado: resolver(secciones, requeridas, prefs) });
};

import { test } from "node:test";
import assert from "node:assert/strict";

import { construirSecciones } from "../js/modelo.js";
import { resolver } from "../js/solver.js";
import { sinteticos, sinteticosUtp } from "./bruta.js";

// Casos que con la primera versión del solver tardaban más de 20 s.
// Tienen que terminar de forma exacta (sin llegar al límite de tiempo).
const requeridas = (M) => Array.from({ length: M }, (_, m) => `M${m}`);
const todas = (M) => ({
  diasMax: 4, evitarHuecos: true, unGrupo: true,
  materias: Object.fromEntries(requeridas(M).map((c, m) => [c, { horario: ["manana", "tarde", "noche"][m % 3], profesor: "P1" }])),
});

for (const [nombre, datos, M, G, prefs] of [
  ["azar 7×20, huecos", sinteticos, 7, 20, { evitarHuecos: true }],
  ["UTP 7×20, todas las preferencias", sinteticosUtp, 7, 20, todas(7)],
  ["UTP 8×30, huecos", sinteticosUtp, 8, 30, { evitarHuecos: true }],
]) {
  test(`rendimiento: ${nombre}`, () => {
    const secciones = construirSecciones(datos(M, G, nombre.startsWith("azar") ? 1 : 7));
    const t = performance.now();
    const r = resolver(secciones, requeridas(M), prefs);
    const ms = performance.now() - t;
    assert.equal(r.estado, "OK");
    assert.equal(r.parcial, false, `llegó al límite de tiempo (${ms.toFixed(0)} ms)`);
  });
}

import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { construirSecciones, listarMaterias } from "../js/modelo.js";
import { resolver } from "../js/solver.js";
import { sinteticos, sinteticosUtp } from "./bruta.js";

// Antes tardaban >20 s; deben terminar sin llegar al límite.
const requeridas = (M) => Array.from({ length: M }, (_, m) => `M${m}`);
const todas = { dias: 2 };

for (const [nombre, datos, M, G, prefs] of [
  ["azar 7×20, huecos", sinteticos, 7, 20, {}],
  ["UTP 7×20, todas las preferencias", sinteticosUtp, 7, 20, todas],
  ["UTP 8×30, huecos", sinteticosUtp, 8, 30, {}],
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

test("rendimiento: ejemplo real, 12 grupos y 4 atrasadas", () => {
  const grupos = JSON.parse(readFileSync(new URL("../data/ejemplo.json", import.meta.url), "utf8"));
  const secciones = construirSecciones(grupos);
  const materias = listarMaterias(secciones).map((m) => m.codasig);
  for (const prefs of [{}, { dias: 1 }, { dias: 3 }]) {
    const r = resolver(secciones, materias, prefs);
    assert.equal(r.estado, "OK");
    assert.equal(r.parcial, false);
  }
});

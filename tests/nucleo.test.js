import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { huecos } from "../js/bits.js";
import { construirSecciones, listarMaterias } from "../js/modelo.js";
import { franjaDe, finMin, formatoHora, inicioMin, minDesdeTexto, periodoDesdeMin } from "../js/periodos.js";
import { PESOS, penalSeccion } from "../js/preferencias.js";
import { resolver } from "../js/solver.js";

const grupos = JSON.parse(readFileSync(new URL("../data/ejemplo.json", import.meta.url), "utf8"));
const secciones = construirSecciones(grupos);
const todas = listarMaterias(secciones).map((m) => m.codasig);

test("grilla de períodos", () => {
  assert.equal(minDesdeTexto("7:00-7:45A.M."), 420);
  assert.equal(minDesdeTexto("12:00-12:45P.M."), 720);
  assert.equal(minDesdeTexto("05:50:00 PM"), 1070);
  assert.equal(periodoDesdeMin(minDesdeTexto("9:10:00 PM")), 17);
  assert.equal(periodoDesdeMin(minDesdeTexto("6:00 PM")), -1);
  assert.equal(formatoHora(finMin(13, 2)), "7:25pm");
  assert.deepEqual([0, 6, 7, 11, 12, 19].map(franjaDe), ["manana", "manana", "tarde", "tarde", "noche", "noche"]);
});

test("huecos", () => {
  assert.equal(huecos(0), 0);
  assert.equal(huecos(0b1011), 1);
  assert.equal(huecos(0b100001 << 13), 4);
});

// ---------- fuerza bruta independiente (minutos, sin máscaras) ----------

function bruta(requeridas, prefs) {
  const pesos = { ...PESOS, ...prefs.pesos };
  const listas = requeridas.map((c) => secciones.filter((s) => s.codasig === c));
  const choque = (a, b) => a.bloques.some(([d1, k1, n1]) => b.bloques.some(([d2, k2, n2]) =>
    d1 === d2 && inicioMin(k1) < finMin(k2, n2) && inicioMin(k2) < finMin(k1, n1)));
  const out = [];
  const rec = (i, combo) => {
    if (i === listas.length) {
      let p = combo.reduce((t, s) => t + penalSeccion(s, prefs.materias?.[s.codasig] ?? {}, pesos), 0);
      const dias = new Set(combo.flatMap((s) => s.bloques.map((b) => b[0])));
      p += Math.max(0, dias.size - (prefs.diasMax ?? Infinity)) * pesos.dias;
      if (prefs.unGrupo) p += (new Set(combo.map((s) => s.grupo)).size - 1) * pesos.grupo;
      if (prefs.evitarHuecos) {
        for (const d of dias) {
          const ps = combo.flatMap((s) => s.bloques.filter((b) => b[0] === d)
            .flatMap(([, k, n]) => Array.from({ length: n }, (_, j) => k + j)));
          p += (Math.max(...ps) - Math.min(...ps) + 1 - ps.length) * pesos.hueco;
        }
      }
      out.push(p);
      return;
    }
    for (const s of listas[i]) if (!combo.some((c) => choque(c, s))) rec(i + 1, [...combo, s]);
  };
  rec(0, []);
  return out.sort((a, b) => a - b);
}

const casos = [
  ["sin preferencias", {}],
  ["franja y profesor", { materias: { 1474: { horario: "noche" }, 8408: { profesor: "calderón" }, 1481: { horario: "tarde" } } }],
  ["días máximos", { diasMax: 3 }],
  ["huecos y un grupo", { evitarHuecos: true, unGrupo: true }],
  ["todo", { diasMax: 4, evitarHuecos: true, unGrupo: true, materias: { 1482: { profesor: "DIAZ" }, 8410: { horario: "tarde" } } }],
];

for (const [nombre, prefs] of casos) {
  for (const K of [1, 3, 1000]) {
    test(`solver = fuerza bruta: ${nombre}, K=${K}`, () => {
      const esperado = bruta(todas, prefs);
      const r = resolver(secciones, todas, prefs, K);
      assert.equal(r.estado, esperado.length ? "OK" : "SIN_SOLUCION");
      assert.deepEqual(r.opciones.map((o) => o.penalidad), esperado.slice(0, K));
    });
  }
}

test("las opciones no tienen choques y cubren todas las materias", () => {
  const r = resolver(secciones, todas, {}, 1000);
  for (const o of r.opciones) {
    assert.deepEqual(o.secciones.map((s) => s.codasig).sort(), [...todas].sort());
    const ocupado = [0, 0, 0, 0, 0, 0, 0];
    for (const s of o.secciones) {
      s.masks.forEach((m, d) => {
        assert.equal(ocupado[d] & m, 0);
        ocupado[d] |= m;
      });
    }
  }
});

test("materia sin secciones", () => {
  const r = resolver(secciones, ["1474", "9999"]);
  assert.equal(r.estado, "FALTAN");
  assert.deepEqual(r.faltan, ["9999"]);
});

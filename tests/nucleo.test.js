import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { huecos } from "../js/bits.js";
import { construirSecciones, listarMaterias } from "../js/modelo.js";
import { franjaDe, finMin, formatoHora, minDesdeTexto, periodoDesdeMin } from "../js/periodos.js";
import { resolver } from "../js/solver.js";
import { bruta, sinteticos } from "./bruta.js";

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
      const esperado = bruta(secciones, todas, prefs);
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

test("fijas y excluidas", () => {
  const prefs = { fijas: [2682], excluidas: [2600] };
  const r = resolver(secciones, todas, prefs, 1000);
  assert.deepEqual(r.opciones.map((o) => o.penalidad), bruta(secciones, todas, prefs));
  for (const o of r.opciones) {
    assert.ok(o.secciones.some((s) => s.codhora === 2682));
    assert.ok(!o.secciones.some((s) => s.codhora === 2600));
  }
});

test("sin solución explica qué materias chocan", () => {
  // Solo Fund. Mat. II de 1GS212 (jueves 8:20pm) y Sist. Operativos de 1GS232 (jueves 8:20pm)
  const r = resolver(secciones, ["1474", "1481"], { fijas: [2606, 2682] });
  assert.equal(r.estado, "SIN_SOLUCION");
  assert.deepEqual(r.choques, [["1474", "1481"]]);
});

// Instancias aleatorias chicas: el solver tiene que dar exactamente las K
// mejores penalidades que da la fuerza bruta.
const PREFS_AZAR = [
  {},
  { evitarHuecos: true },
  { unGrupo: true },
  { diasMax: 2 },
  { diasMax: 3, evitarHuecos: true, unGrupo: true },
  { evitarHuecos: true, materias: { M0: { horario: "noche" }, M1: { profesor: "P1" }, M2: { horario: "manana" } } },
];
test("solver = fuerza bruta en 300 instancias aleatorias", () => {
  let casos = 0;
  for (let semilla = 1; semilla <= 50; semilla++) {
    const sec = construirSecciones(sinteticos(4 + (semilla % 2), 3 + (semilla % 3), semilla));
    const req = listarMaterias(sec).map((m) => m.codasig);
    for (const prefs of PREFS_AZAR) {
      const K = [1, 5, 1e6][semilla % 3];
      const esperado = bruta(sec, req, prefs);
      const r = resolver(sec, req, prefs, K);
      assert.deepEqual(r.opciones.map((o) => o.penalidad), esperado.slice(0, K), `semilla ${semilla} ${JSON.stringify(prefs)} K=${K}`);
      casos++;
    }
  }
  assert.equal(casos, 300);
});

test("materia sin secciones", () => {
  const r = resolver(secciones, ["1474", "9999"]);
  assert.equal(r.estado, "FALTAN");
  assert.deepEqual(r.faltan, ["9999"]);
});

test("el service worker precachea todos los archivos de la app", async () => {
  const { readdirSync } = await import("node:fs");
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const lista = JSON.parse(sw.slice(sw.indexOf("[", sw.indexOf("ARCHIVOS")), sw.indexOf("];") + 1).replace(/,\s*]/, "]"));
  const js = readdirSync(new URL("../js/", import.meta.url)).map((f) => `js/${f}`);
  for (const f of js) assert.ok(lista.includes(f), `${f} falta en sw.js`);
  for (const f of lista.filter((x) => x !== "./")) assert.ok(readFileSync(new URL(`../${f}`, import.meta.url)), f);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { huecos } from "../js/bits.js";
import { construirSecciones, listarMaterias, sigla } from "../js/modelo.js";
import { franjaDe, finMin, formatoHora, minDesdeTexto, periodoDesdeMin, usar24 } from "../js/periodos.js";
import { resolver } from "../js/solver.js";
import { descartada } from "../js/preferencias.js";
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
  usar24(true);
  assert.equal(formatoHora(finMin(13, 2)), "19:25");
  assert.equal(formatoHora(420), "7:00");
  usar24(false);
  assert.deepEqual([0, 6, 7, 11, 12, 19].map(franjaDe), ["manana", "manana", "tarde", "tarde", "noche", "noche"]);
});

test("huecos", () => {
  assert.equal(huecos(0), 0);
  assert.equal(huecos(0b1011), 1);
  assert.equal(huecos(0b100001 << 13), 4);
});

const casos = [
  ["sin preferencias", {}],
  ["turno", { horario: "noche" }],
  ["menos días", { menosDias: true }],
  ["todo", { menosDias: true, horario: "tarde" }],
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

test("profesores evitados", () => {
  const profesor = secciones.find((s) => todas.includes(s.codasig)).profesor;
  const prefs = { evitados: [profesor] };
  const r = resolver(secciones, todas, prefs, 1000);
  assert.deepEqual(r.opciones.map((o) => o.penalidad), bruta(secciones, todas, prefs));
  for (const o of r.opciones) assert.ok(!o.secciones.some((s) => s.profesor === profesor));
});

test("sin solución explica qué materias chocan", () => {
  // Choque: jueves 8:20pm
  const r = resolver(secciones, ["1474", "1481"], { fijas: [2606, 2682] });
  assert.equal(r.estado, "SIN_SOLUCION");
  assert.deepEqual(r.choques, [["1474", "1481"]]);
});

// Mismas K mejores penalidades que la fuerza bruta.
const PREFS_AZAR = [
  {},
  {},
  { menosDias: true },
  { horario: "noche" },
  { horario: "manana", menosDias: true },
  { solo: { M0: ["P1"], M1: ["P2", "P3"] }, evitados: ["P0"] },
  { horario: "tarde", soloTurno: true, menosDias: true },
];
test("solver = fuerza bruta en 350 instancias aleatorias", () => {
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
  assert.equal(casos, 350);
});

test("solo un turno: descarta las demás franjas, salvo las fijas", () => {
  const prefs = { horario: "noche", soloTurno: true };
  const r = resolver(secciones, todas, prefs, 1000);
  const fuera = secciones.filter((s) => todas.includes(s.codasig) && descartada(s, prefs));
  assert.ok(fuera.length > 0);
  for (const o of r.opciones) for (const s of o.secciones) assert.ok(!descartada(s, prefs));
  const fija = fuera[0];
  assert.equal(descartada(fija, { ...prefs, fijas: [fija.codhora] }), false);
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

test("sigla para la grilla compacta", () => {
  assert.equal(sigla("REDES DE COMPUTADORAS"), "RC");
  assert.equal(sigla("DES. SOFT. VIII"), "DS VIII");
  assert.equal(sigla("ING. DE SOFT. APLICADA III"), "ISA III");
  assert.equal(sigla("LEG. LAB. E INFORMATICA"), "LLI");
  assert.equal(sigla("Física"), "FÍSI");
  assert.equal(sigla("Cálculo II"), "CÁLC II");
});

test("lo quiero: solo ese profesor en esa materia; una fija igual entra", () => {
  const sec = (codhora, codasig, profesor) => ({ codhora, codasig, profesor, bloques: [] });
  const prefs = { solo: { A: ["ZURITA"] }, fijas: [3] };
  assert.equal(descartada(/** @type {any} */ (sec(1, "A", "ZURITA")), prefs), false);
  assert.equal(descartada(/** @type {any} */ (sec(2, "A", "PEREZ")), prefs), true);
  assert.equal(descartada(/** @type {any} */ (sec(3, "A", "PEREZ")), prefs), false);
  assert.equal(descartada(/** @type {any} */ (sec(4, "B", "PEREZ")), prefs), false);
});

test("preferencias guardadas por versiones anteriores", async () => {
  const { migrar } = await import("../js/estado.js");
  assert.deepEqual(migrar({
    materias: { A: { profesor: "PEREZ", solo: ["ZURITA"] }, B: { horario: "noche" } },
    diasMax: 3, unGrupo: true, evitarHuecos: true, pesos: { hueco: 1 }, fijas: [1],
  }), { solo: { A: ["ZURITA", "PEREZ"] }, horario: "noche", menosDias: true, fijas: [1] });
  assert.deepEqual(migrar({ horario: "tarde", solo: { A: ["X"] } }), { horario: "tarde", solo: { A: ["X"] } });
});

test("penalidad() da lo mismo que el solver", async () => {
  const { penalidad } = await import("../js/preferencias.js");
  for (const prefs of [{}, { horario: "noche", menosDias: true }]) {
    for (const o of resolver(secciones, todas, prefs, 200).opciones) assert.equal(penalidad(o.secciones, prefs), o.penalidad);
  }
});

test("plan B: reemplazos que encajan sin mover nada más, de mejor a peor", async () => {
  const { reemplazos } = await import("../js/solver.js");
  const { penalidad } = await import("../js/preferencias.js");
  const prefs = { horario: "noche", excluidas: [2600] };
  const [o] = resolver(secciones, todas, prefs).opciones;
  const planes = reemplazos(secciones, structuredClone(o.secciones), prefs);
  assert.equal(planes.size, o.secciones.length);
  let alguno = false;
  for (const s of o.secciones) {
    const resto = o.secciones.filter((x) => x !== s);
    const lista = /** @type {any[]} */ (planes.get(s.codhora));
    const costos = lista.map((x) => penalidad([...resto, x], prefs));
    assert.deepEqual(costos, [...costos].sort((a, b) => a - b));
    for (const x of lista) {
      alguno = true;
      assert.equal(x.codasig, s.codasig);
      assert.notEqual(x.codhora, 2600);
      assert.notEqual(x.codhora, s.codhora);
      assert.ok(!resto.some((y) => y.masks.some((m, d) => m & x.masks[d])));
    }
  }
  assert.ok(alguno);
});

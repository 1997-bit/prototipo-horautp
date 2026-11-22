import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PALABRAS, huecosDia, marcar, tramosLibres } from "../js/bits.js";
import { chocan, construirSecciones, listarMaterias, sigla } from "../js/modelo.js";
import { finMin, formatoHora, inicioMin, minDesdeTexto, rangoDesdeTexto, usar24 } from "../js/periodos.js";
import { resolver } from "../js/solver.js";
import { descartada } from "../js/preferencias.js";
import { bruta, sinteticos, sinteticosMixtos } from "./bruta.js";

const grupos = JSON.parse(readFileSync(new URL("datos.json", import.meta.url), "utf8"));
const secciones = construirSecciones(grupos);
const todas = listarMaterias(secciones).map((m) => m.codasig);

test("horas del portal", () => {
  assert.equal(minDesdeTexto("7:00-7:45A.M."), 420);
  assert.equal(minDesdeTexto("12:00-12:45P.M."), 720);
  assert.equal(minDesdeTexto("05:50:00 PM"), 1070);
  assert.deepEqual(rangoDesdeTexto("7:00-7:45A.M."), [420, 465]);
  assert.deepEqual(rangoDesdeTexto("12:50-1:35P.M."), [770, 815]);
  assert.deepEqual(rangoDesdeTexto("6:00-6:55P.M."), [1080, 1135]);
  assert.deepEqual(rangoDesdeTexto("10:00-10:45P.M."), [1320, 1365]);
  assert.deepEqual(rangoDesdeTexto("11:30-12:15P.M."), [690, 735]);
  assert.deepEqual(rangoDesdeTexto("05:50:00 PM"), [1070, 1115]);
  assert.equal(rangoDesdeTexto("HORA"), null);
  assert.equal(formatoHora(finMin(13, 2)), "7:25pm");
  usar24(true);
  assert.equal(formatoHora(finMin(13, 2)), "19:25");
  assert.equal(formatoHora(420), "7:00");
  usar24(false);
});

test("celdas de 10 min: las dos rejillas encajan sin choques falsos", () => {
  const dia = (/** @type {[number, number][]} */ ...rangos) => {
    const m = new Int32Array(7 * PALABRAS);
    for (const [a, b] of rangos) marcar(m, 0, a, b);
    return m;
  };
  const choca = (/** @type {Int32Array} */ a, /** @type {Int32Array} */ b) => a.some((x, i) => x & b[i]);
  // 7:00–7:45 y 7:50–8:35: seguidas, sin hueco ni choque
  assert.equal(choca(dia([420, 465]), dia([470, 515])), false);
  // 6:00–6:55pm y 7:00–7:55pm (horas de 55)
  assert.equal(choca(dia([1080, 1135]), dia([1140, 1195])), false);
  // 6:00–6:55pm choca con 5:50–6:35pm y con 6:40–7:25pm
  assert.equal(choca(dia([1080, 1135]), dia([1070, 1115])), true);
  assert.equal(choca(dia([1080, 1135]), dia([1120, 1165])), true);
  // 10:00–10:45pm entra (última celda de la tercera palabra)
  assert.ok(dia([1320, 1365]).some(Boolean));
  const h = new Int32Array(PALABRAS);
  assert.equal(huecosDia(dia([420, 465], [470, 515]), 0, h), 0);
  // Un período libre = 5 celdas, un tramo
  assert.equal(huecosDia(dia([420, 465], [520, 565]), 0, h), 5);
  assert.equal(tramosLibres(h), 1);
  // Mañana y noche: hueco que cruza palabras
  assert.equal(huecosDia(dia([420, 465], [1320, 1365]), 0, h), (1320 - 470) / 10);
  assert.equal(tramosLibres(h), 1);
  assert.equal(huecosDia(dia([420, 465], [520, 565], [1320, 1365]), 0, h), 5 + (1320 - 570) / 10);
  assert.equal(tramosLibres(h), 2);
});

test("clases antes de las 7:00 y después de las 23:00 chocan", () => {
  const m = (g, codhora, ini, fin) => ({ grupo: g, periodo: "", materias: [{ codasig: g, codhora, asignatura: g, profesor: "", email: "", bloques: [[5, ini, fin, "C", ""]] }] });
  const secs = construirSecciones([m("A", 1, 360, 415), m("B", 2, 360, 415), m("C", 3, 1380, 1435), m("D", 4, 1380, 1435)]);
  assert.equal(chocan(secs[0], secs[1]), true);
  assert.equal(chocan(secs[2], secs[3]), true);
});

test("subgrupos: una sección por subgrupo, con la teoría", () => {
  const secs = construirSecciones([{ grupo: "1AA122", periodo: "", materias: [{ codasig: "MN", codhora: 50, asignatura: "MÉTODOS", profesor: "", email: "",
    bloques: [[0, 420, 515, "C", "1-307"], [2, 520, 565, "C", "1-312", "A"], [3, 720, 765, "C", "1-311", "B"]] }] }]);
  assert.deepEqual(secs.map((s) => [s.codhora, s.sub, s.bloques.length]), [[50, "A", 2], [50, "B", 2]]);
  assert.equal(chocan(secs[0], secs[1]), true);
  assert.deepEqual(listarMaterias(secs), [{ codasig: "MN", asignatura: "MÉTODOS", secciones: 1 }]);
  const r = resolver(secs, ["MN"], {}, 10);
  assert.equal(r.opciones.length, 2);
});

const casos = [
  ["sin preferencias", {}],
  ["algo menos días", { dias: 1 }],
  ["menos días", { dias: 2 }],
  ["todo", { dias: 3, excluidas: [2600] }],
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
    for (const a of o.secciones) for (const b of o.secciones) if (a !== b) assert.equal(chocan(a, b), false);
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
  { dias: 2 },
  { dias: 1 },
  { dias: 2, evitados: ["P1"] },
  { dias: 3 },
  { solo: { M0: ["P1"], M1: ["P2", "P3"] }, evitados: ["P0"] },
  { solo: { M2: ["P0"] }, dias: 3 },
];
test("solver = fuerza bruta en 400 instancias aleatorias", () => {
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
  assert.equal(casos, 400);
});

test("solver = fuerza bruta con horas de 55 min y subgrupos (240 instancias)", () => {
  let casos = 0;
  for (let semilla = 1; semilla <= 30; semilla++) {
    const sec = construirSecciones(sinteticosMixtos(4 + (semilla % 2), 3 + (semilla % 3), semilla));
    const req = listarMaterias(sec).map((m) => m.codasig);
    for (const prefs of PREFS_AZAR) {
      const K = [1, 5, 1e6][semilla % 3];
      const esperado = bruta(sec, req, prefs);
      const r = resolver(sec, req, prefs, K);
      assert.deepEqual(r.opciones.map((o) => o.penalidad), esperado.slice(0, K), `semilla ${semilla} ${JSON.stringify(prefs)} K=${K}`);
      for (const o of r.opciones) assert.equal(new Set(o.secciones.map((s) => s.codasig)).size, req.length);
      casos++;
    }
  }
  assert.equal(casos, 240);
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
  const js = readdirSync(new URL("../js/", import.meta.url), { recursive: true })
    .filter((f) => String(f).endsWith(".js")).map((f) => `js/${f}`);
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

test("penalidad() da lo mismo que el solver", async () => {
  const { penalidad } = await import("../js/preferencias.js");
  for (const prefs of [{}, { dias: 2, excluidas: [2600] }, { dias: 1 }, { dias: 3 }]) {
    for (const o of resolver(secciones, todas, prefs, 200).opciones) assert.equal(penalidad(o.secciones, prefs), o.penalidad);
  }
});

test("plan B: reemplazos que encajan sin mover nada más, de mejor a peor", async () => {
  const { reemplazos } = await import("../js/solver.js");
  const { penalidad } = await import("../js/preferencias.js");
  const prefs = { dias: 2, excluidas: [2600] };
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
      assert.ok(!resto.some((y) => chocan(x, y)));
    }
  }
  assert.ok(alguno);
});

test("subgrupos del grupo: la misma letra en todas sus materias", () => {
  // 1TB221: el lunes B va a Microcontroladores y A a Óptica, a la vez.
  const m = (codasig, codhora, bloques) => ({ codasig, codhora, asignatura: codasig, profesor: "", email: "", bloques });
  const secs = construirSecciones([{ grupo: "1TB221", periodo: "", materias: [
    m("MICRO", 355, [[3, 1290, 1365, "C", "1-207"], [0, 1020, 1165, "C", "1-214", "B"]]),
    m("OPTICA", 357, [[2, 1070, 1165, "C", "1-207"], [0, 1020, 1165, "C", "1-220", "A"]]),
  ] }]);
  assert.deepEqual(secs.map((s) => `${s.codasig}${s.sub}:${s.bloques.length}`), ["MICROA:1", "MICROB:2", "OPTICAA:2", "OPTICAB:1"]);
  const r = resolver(secs, ["MICRO", "OPTICA"], {}, 10);
  assert.equal(r.estado, "OK");
  assert.deepEqual(r.opciones.map((o) => o.secciones.map((s) => s.sub).join("")).sort(), ["AA", "BB"]);
});

test("en el mismo grupo lo que se pisa en el horario oficial no choca", () => {
  // 2GP211: dos módulos de maestría a la misma hora y aula.
  const m = (codasig, codhora) => ({ codasig, codhora, asignatura: codasig, profesor: "", email: "", bloques: [[0, 1080, 1315, "C", "MAE7"]] });
  const propio = construirSecciones([{ grupo: "2GP211", periodo: "", materias: [m("GE", 9352), m("IP", 9351)] }]);
  assert.equal(resolver(propio, ["GE", "IP"]).estado, "OK");
  const mezclado = construirSecciones([{ grupo: "A", periodo: "", materias: [m("GE", 1)] }, { grupo: "B", periodo: "", materias: [m("IP", 2)] }]);
  assert.equal(resolver(mezclado, ["GE", "IP"]).estado, "SIN_SOLUCION");
});

test("en el mismo grupo, misma hora en aulas distintas choca", () => {
  // 1GS134: SO Lab y Redes Clase el martes a las 3:20.
  const m = (codasig, codhora, aula) => ({ codasig, codhora, asignatura: codasig, profesor: "", email: "", bloques: [[1, 920, 1015, "L", aula]] });
  const secs = construirSecciones([{ grupo: "1GS134", periodo: "", materias: [m("SO", 2672, "3-408"), m("RC", 2670, "3-315")] }]);
  assert.equal(chocan(secs[0], secs[1]), true);
  assert.equal(resolver(secs, ["SO", "RC"]).estado, "SIN_SOLUCION");
});

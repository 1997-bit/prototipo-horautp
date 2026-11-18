// @ts-check
// Convierte el CSV del prototipo (data/horarios.csv) al formato de grupos.
// Uso: node tools/csv-a-json.js data/horarios.csv > data/ejemplo.json

import { readFileSync } from "node:fs";
import { diaIndex, minDesdeTexto, periodoDesdeMin, periodosDesdeDuracion } from "../js/periodos.js";

/** @type {Record<string, string>} */
const TIPO = { Clase: "C", Lab: "L", "Clase+Lab": "CL" };

/** CSV con campos entre comillas. @param {string} texto */
function leerCsv(texto) {
  const filas = [];
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const campos = [];
    let actual = "", comillas = false;
    for (const c of linea) {
      if (c === '"') comillas = !comillas;
      else if (c === "," && !comillas) { campos.push(actual); actual = ""; }
      else actual += c;
    }
    campos.push(actual);
    filas.push(campos);
  }
  const [cab, ...resto] = filas;
  return resto.map((f) => Object.fromEntries(cab.map((c, i) => [c, f[i].trim()])));
}

const filas = leerCsv(readFileSync(process.argv[2] ?? "data/horarios.csv", "utf8"));

/** @type {Map<string, import("../js/modelo.js").Grupo>} */
const grupos = new Map();
for (const f of filas) {
  const ini = minDesdeTexto(f.hora_inicio);
  const k = periodoDesdeMin(ini);
  const n = periodosDesdeDuracion(minDesdeTexto(f.hora_fin) - ini);
  const d = diaIndex(f.dia);
  if (k < 0 || n < 0 || d < 0) throw new Error(`fila fuera de la grilla: ${JSON.stringify(f)}`);

  let g = grupos.get(f.grupo);
  if (!g) grupos.set(f.grupo, (g = { grupo: f.grupo, periodo: f.periodo, materias: [] }));
  const codhora = Number(f.codhora);
  let m = g.materias.find((x) => x.codhora === codhora);
  if (!m) {
    m = { codasig: f.codasig, codhora, asignatura: f.asignatura, profesor: f.profesor, email: f.email, bloques: [] };
    g.materias.push(m);
  }
  m.bloques.push([d, k, n, TIPO[f.tipo] ?? "C", f.aula]);
}

for (const g of grupos.values()) {
  g.materias.sort((a, b) => a.codhora - b.codhora);
  for (const m of g.materias) m.bloques.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// Una materia por línea: legible y con diffs chicos.
const lineas = [...grupos.values()].map((g) =>
  `  {"grupo": ${JSON.stringify(g.grupo)}, "periodo": ${JSON.stringify(g.periodo)}, "materias": [\n` +
  g.materias.map((m) => `    ${JSON.stringify(m)}`).join(",\n") +
  "\n  ]}");
process.stdout.write(`[\n${lineas.join(",\n")}\n]\n`);

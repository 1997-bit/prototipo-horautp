import { test } from "node:test";
import assert from "node:assert/strict";

import { grupoDesdeCrudo, leerCelda } from "../js/entrada.js";

// Reconstruido a mano del "Horario del Grupo" 4GS111 (Veraguas) del portal.
const C = (nombre, aula = "4C1") => `${nombre}\naula ${aula}`;
const TRAB = C("TRAB. EN EQUIPO"), FM = C("FUND. MAT. II"), FML = C("FUND. MAT. II(L )");
const DS = C("DES. DE SOFT.II"), DSL = C("DES. DE SOFT.II(L )", "4fis");
const ED = C("ESTRUCT.DATOS I"), EDL = C("ESTRUCT.DATOS I(L )", "4fis");
const ING = C("INGLÉS II"), INGL = C("INGLÉS II(L )");
const BD = C("BASE DE DATOS I"), BDL = C("BASE DE DATOS I(L )", "4fis");

const crudo = {
  texto: "Matrícula UTP Periodo: II-2026 Horario del Grupo UNIVERSIDAD TECNOLÓGICA DE PANAMÁ "
    + "FACULTAD DE INGENIERÍA DE SISTEMAS COMPUTACIONALES HORARIO DE CLASE VERAGUAS - 4GS111 HORA LUNES",
  tablas: [
    [
      ["HORA", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"],
      ["7:00-7:45A.M.", TRAB, "", FM, "", TRAB, "", ""],
      ["7:50-8:35A.M.", TRAB, DS, FM, DS, ED, "", ""],
      ["8:40-9:25A.M.", ED, DSL, ING, DS, ED, "", ""],
      ["9:30-10:15A.M.", EDL, DSL, ING, FM, INGL, "", ""],
      ["10:20-11:05A.M.", EDL, BD, "", FML, BDL, "", ""],
      ["11:10-11:55A.M.", "", BD, "", FML, BDL, "", ""],
      ["12:00-12:45P.M.", "", BD, "", "", "", "", ""],
    ],
    [
      ["ASIGNATURA", "CODASIG", "CODHORA", "PROFESOR", "EMAIL", "SEDE *"],
      ["TRAB. EN EQUIPO", "0599", "3718", "GONZALEZ, SERAFINA", "serafina.gonzalez@utp.ac.pa", ""],
      ["FUND. MAT. II", "1474", "3719", "AGRAZAL, ARGELIA DE", "argelia.pinilla@utp.ac.pa", ""],
      ["INGLÉS II", "1489", "3720", "JUAREZ, EDWIN", "edwin.juarez@utp.ac.pa", ""],
      ["ESTRUCT.DATOS I", "8362", "3715", "VELEZ, PRISCILA", "priscila.velez@utp.ac.pa", ""],
      ["DES. DE SOFT.II", "8393", "3716", "CAMARENA, SONIA", "sonia.camarena@utp.ac.pa", ""],
      ["BASE DE DATOS I", "8398", "3717", "PEREZ, ERIC", "eric.perez@utp.ac.pa", ""],
    ],
  ],
};

test("celda del portal y del PDF", () => {
  assert.deepEqual(leerCelda("ESTRUCT.DATOS I(L )\naula 4fis"), { nombre: "ESTRUCT.DATOS I", tipo: "L", aula: "4fis" });
  assert.deepEqual(leerCelda("BASE DE\nDATOS I(L )\nAULA: 3-N04"), { nombre: "BASE DE DATOS I", tipo: "L", aula: "3-N04" });
  assert.deepEqual(leerCelda("INGLÉS II\nAULA: 3-302"), { nombre: "INGLÉS II", tipo: "C", aula: "3-302" });
});

test("grupo 4GS111 completo", () => {
  const g = grupoDesdeCrudo(crudo);
  assert.equal(g.grupo, "4GS111");
  assert.equal(g.periodo, "II-2026");
  assert.equal(g.sede, "VERAGUAS");
  const bloques = Object.fromEntries(g.materias.map((m) => [m.codasig, m.bloques]));
  assert.deepEqual(bloques, {
    "0599": [[0, 0, 2, "C", "4C1"], [4, 0, 1, "C", "4C1"]],
    1474: [[2, 0, 2, "C", "4C1"], [3, 3, 1, "C", "4C1"], [3, 4, 2, "L", "4C1"]],
    1489: [[2, 2, 2, "C", "4C1"], [4, 3, 1, "L", "4C1"]],
    8362: [[0, 2, 1, "C", "4C1"], [0, 3, 2, "L", "4fis"], [4, 1, 2, "C", "4C1"]],
    8393: [[1, 1, 1, "C", "4C1"], [1, 2, 2, "L", "4fis"], [3, 1, 2, "C", "4C1"]],
    8398: [[1, 4, 3, "C", "4C1"], [4, 4, 2, "L", "4fis"]],
  });
  assert.equal(g.materias.find((m) => m.codasig === "1474").codhora, 3719);
});

test("celda que no está en la leyenda", () => {
  const malo = structuredClone(crudo);
  malo.tablas[0][1][1] = C("QUIMICA");
  assert.throws(() => grupoDesdeCrudo(malo), /QUIMICA/);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { grupoDesdeCrudo, grupoManual, leerCelda, leerCeldas } from "../js/entrada.js";
import { finMin, inicioMin } from "../js/periodos.js";

/** Período k de 50 min, n seguidos → bloque en minutos. */
const P = (d, k, n, tipo, aula) => [d, inicioMin(k), finMin(k, n), tipo, aula];

// "Horario del Grupo" 4GS111 del portal.
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
    "0599": [P(0, 0, 2, "C", "4C1"), P(4, 0, 1, "C", "4C1")],
    1474: [P(2, 0, 2, "C", "4C1"), P(3, 3, 1, "C", "4C1"), P(3, 4, 2, "L", "4C1")],
    1489: [P(2, 2, 2, "C", "4C1"), P(4, 3, 1, "L", "4C1")],
    8362: [P(0, 2, 1, "C", "4C1"), P(0, 3, 2, "L", "4fis"), P(4, 1, 2, "C", "4C1")],
    8393: [P(1, 1, 1, "C", "4C1"), P(1, 2, 2, "L", "4fis"), P(3, 1, 2, "C", "4C1")],
    8398: [P(1, 4, 3, "C", "4C1"), P(4, 4, 2, "L", "4fis")],
  });
  assert.equal(g.materias.find((m) => m.codasig === "1474").codhora, 3719);
});

test("celda que no está en la leyenda", () => {
  const malo = structuredClone(crudo);
  malo.tablas[0][1][1] = C("QUIMICA");
  assert.throws(() => grupoDesdeCrudo(malo), /QUIMICA/);
});

// "Horarios de Grupos" 1LB421: con botones de grupos antes del horario.
const LAB = (n, aula = "TD-4") => `${n}(L )\naula ${aula}`;
const nocturno = {
  texto: "Matrícula UTP Periodo: II-2026 Horarios de Grupos Grupos 1LB111 1LB112 1LB113 1LB421 "
    + "UNIVERSIDAD TECNOLÓGICA DE PANAMÁ FACULTAD DE INGENIERÍA MECÁNICA SEDE PANAMÁ HORARIO DE CLASE "
    + "GRUPO: 1LB421 CARRERA: LIC. EN MECANICA AUTOMOTRIZ NIVEL: II AÑO TURNO: NOCTURNO HORA LUNES",
  tablas: [
    [
      ["HORA", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"],
      ...["8:20-9:05P.M.", "9:10-9:55P.M.", "10:00-10:45P.M."].map((h) => [
        h, LAB("LAB.AIRE ACOND."), LAB("LAB. MOT.DIESEL"), "", LAB("LAB.ELECT.APLIC", "1-216"), LAB("LAB. MOT.GAS.I"), "", "",
      ]),
    ],
    [
      ["ASIGNATURA", "CODASIG", "CODHORA", "PROFESOR", "EMAIL", "SEDE *"],
      ["LAB.AIRE ACOND.", "4482", "1894", "QUINTERO, EZEQUIEL", "ezequiel.quintero@utp.ac.pa", ""],
      ["LAB. MOT.GAS.I", "4484", "1895", "PEREZ, ADRIAN", "adrian.perez@utp.ac.pa", ""],
      ["LAB.ELECT.APLIC", "4486", "1896", "ACOSTA, ISAAC", "isaac.acosta@utp.ac.pa", ""],
      ["LAB. MOT.DIESEL", "4490", "1897", "FRANCO, JORGE", "jorge.franco@utp.ac.pa", ""],
    ],
  ],
};

test("Horarios de Grupos: el código es el del horario, no el primer botón", () => {
  const g = grupoDesdeCrudo(nocturno);
  assert.equal(g.grupo, "1LB421");
  assert.equal(g.periodo, "II-2026");
  assert.deepEqual(g.materias.find((m) => m.codasig === "4482").bloques, [P(0, 16, 3, "L", "TD-4")]);
});

test("materia a mano: se une a la del portal por nombre", () => {
  const portal = grupoDesdeCrudo(structuredClone(crudo));
  const g = grupoManual({
    asignatura: " base de  datos i ", profesor: "Pérez,  Eric", grupo: "1gs 221",
    bloques: [P(3, 2, 2, "C", ""), P(1, 0, 2, "L", "4fis")],
  }, [portal]);
  assert.equal(g.grupo, "1GS221");
  assert.equal(g.manual, true);
  const [m] = g.materias;
  assert.equal(m.codasig, "8398");
  assert.equal(m.codhora, -1);
  assert.equal(m.profesor, "Pérez, Eric");
  assert.deepEqual(m.bloques, [P(1, 0, 2, "L", "4fis"), P(3, 2, 2, "C", "")]);

  const otra = grupoManual({ asignatura: "Redes", profesor: "", grupo: "", bloques: [P(0, 0, 1, "C", "")] }, [portal, g]);
  assert.equal(otra.materias[0].codhora, -2);
  assert.equal(otra.materias[0].codasig, "M-REDES");
});

test("materia a mano: errores", () => {
  const base = { asignatura: "Redes", profesor: "", grupo: "" };
  assert.throws(() => grupoManual({ ...base, asignatura: " ", bloques: [P(0, 0, 1, "C", "")] }, []), /nombre/);
  assert.throws(() => grupoManual({ ...base, bloques: [] }, []), /al menos/);
  assert.throws(() => grupoManual({ ...base, bloques: [P(0, 0, 2, "C", ""), P(0, 1, 1, "L", "")] }, []), /lunes se pisan/);
  assert.doesNotThrow(() => grupoManual({ ...base, bloques: [P(0, 0, 1, "C", ""), P(0, 1, 1, "L", "")] }, []));
});

test("celda con varias clases: separador del DOM o un 'aula' tras otro", () => {
  const esperado = [
    { nombre: "MÉTODOS NUMÉRIC", tipo: "C", aula: "1-312", sub: "A" },
    { nombre: "MÉTODOS NUMÉRIC", tipo: "C", aula: "1-311", sub: "B" },
  ];
  assert.deepEqual(leerCeldas("MÉTODOS NUMÉRIC(A )\naula 1-312\n¶\nMÉTODOS NUMÉRIC(B )\naula 1-311"), esperado);
  assert.deepEqual(leerCeldas("MÉTODOS NUMÉRIC(A )\naula 1-312\nMÉTODOS NUMÉRIC(B )\naula 1-311"), esperado);
  assert.deepEqual(leerCeldas("TEORIA DE CONTR\naula 1-328\n¶\nCIEN.MATER.(A )\naula 1-328").map((c) => c.nombre), ["TEORIA DE CONTR", "CIEN.MATER."]);
  assert.deepEqual(leerCeldas("BASE DE\nDATOS I(L )\nAULA: 3-N04"), [{ nombre: "BASE DE DATOS I", tipo: "L", aula: "3-N04" }]);
});

// Portal: maestría nocturna en horas de 55 min, código con dos dígitos.
const maestria = {
  texto: "Matrícula UTP Periodo: II-2026 Horarios de Grupos Grupos 11D234 FACULTAD DE INGENIERÍA INDUSTRIAL "
    + "SEDE PANAMÁ HORARIO DE CLASE 11D234 MAEST.SIST.LOG. Y OPER. ESP.PL III AÑO NOCTURNO HORA LUNES",
  tablas: [
    [
      ["HORA", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"],
      ...["6:00-6:55P.M.", "7:00-7:55P.M.", "8:00-8:55P.M.", "9:00-9:55P.M."].map((h) => [
        h, "", "", C("PLANIF. FINANC.", "P307"), "", C("PLANIF. FINANC.", "P307"), "", "",
      ]),
    ],
    [
      ["ASIGNATURA", "CODASIG", "CODHORA", "PROFESOR", "EMAIL", "SEDE *"],
      ["GER. DE TRANSP.", "9576", "0181", "FLORES, TAYRA", "tayra.flores@utp.ac.pa", ""],
      ["PLANIF. FINANC.", "9579", "0180", "PEÑA, JORGE", "jorge.pena@utp.ac.pa", ""],
    ],
  ],
};

test("horas de 55 min, código 11D234 y 'SEDE PANAMÁ'", () => {
  const g = grupoDesdeCrudo(maestria);
  assert.equal(g.grupo, "11D234");
  assert.equal(g.sede, "PANAMA");
  const pf = g.materias.find((m) => m.codasig === "9579");
  assert.deepEqual(pf.bloques, [[2, 1080, 1315, "C", "P307"], [4, 1080, 1315, "C", "P307"]]);
  assert.deepEqual(g.materias.find((m) => m.codasig === "9576").bloques, []);
});

test("subgrupos y otra materia en la misma celda; código de 4 dígitos; centro regional", () => {
  const sub = (s, aula) => C(`MÉTODOS NUMÉRIC(${s} )`, aula);
  const g = grupoDesdeCrudo({
    texto: "Periodo: II-2026 Grupos 1EG1010 1EG1011 CENTRO REGIONAL DE COCLÉ HORARIO DE CLASE GRUPO: 1EG1011 HORA LUNES",
    tablas: [
      [
        ["HORA", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"],
        ["7:00-7:45A.M.", C("MÉTODOS NUMÉRIC"), "", `${sub("A", "1-312")}\n¶\n${sub("B", "1-311")}`, "", "", "", ""],
        ["7:50-8:35A.M.", C("MÉTODOS NUMÉRIC"), "", `${sub("A", "1-312")}\n¶\n${C("CIEN.MATER.", "1-328")}`, "", "", "", ""],
      ],
      [
        ["ASIGNATURA", "CODASIG", "CODHORA", "PROFESOR", "EMAIL", "SEDE *"],
        ["MÉTODOS NUMÉRIC", "1549", "0300", "RUIZ, ANA", "", ""],
        ["CIEN.MATER.", "1550", "0301", "", "", ""],
      ],
    ],
  });
  assert.equal(g.grupo, "1EG1011");
  assert.equal(g.sede, "COCLE");
  const [mn, cm] = g.materias;
  assert.deepEqual(mn.bloques, [
    P(0, 0, 2, "C", "4C1"),
    [...P(2, 0, 2, "C", "1-312"), "A"],
    [...P(2, 0, 1, "C", "1-311"), "B"],
  ]);
  assert.deepEqual(cm.bloques, [P(2, 1, 1, "C", "1-328")]);
});

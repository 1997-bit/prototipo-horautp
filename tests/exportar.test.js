import { test } from "node:test";
import assert from "node:assert/strict";

import { aCsv, aIcs } from "../js/exportar.js";

const sec = {
  grupo: "1GS232", codasig: "1481", codhora: 2682, asignatura: "SISTEMAS OPERATIVOS",
  profesor: "ZURITA, ARMANDO", email: "", bloques: [[0, 13, 2, "L", "3-401"], [3, 16, 2, "C", "3-404"]],
};

test("ics válido", () => {
  // Miércoles 12 de agosto de 2026
  const ics = aIcs([sec], { inicio: new Date(2026, 7, 12), ahora: new Date(Date.UTC(2026, 7, 1, 12)) });
  const lineas = ics.split("\r\n");
  assert.ok(lineas.every((l) => new TextEncoder().encode(l).length <= 75));
  assert.ok(ics.includes("DTSTAMP:20260801T120000Z"));
  // Lunes → primer lunes después del miércoles 12: 17 de agosto
  assert.ok(ics.includes("DTSTART;TZID=America/Panama:20260817T175000"));
  assert.ok(ics.includes("DTEND;TZID=America/Panama:20260817T192500"));
  // Jueves → 13 de agosto
  assert.ok(ics.includes("DTSTART;TZID=America/Panama:20260813T202000"));
  assert.ok(ics.includes("ZURITA\\, ARMANDO"));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
});

test("csv", () => {
  const csv = aCsv([sec]).split("\r\n");
  assert.equal(csv[1], 'Lunes,17:50,19:25,SISTEMAS OPERATIVOS,Lab,"ZURITA, ARMANDO",3-401,1GS232,1481,2682');
});

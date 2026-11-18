// @ts-check
// Opción elegida → .ics (RFC 5545) o CSV.

import { DIAS, finMin, inicioMin } from "./periodos.js";
import { nombreTipo } from "./modelo.js";

/** @typedef {import("./modelo.js").Seccion} Seccion */

const pad = (/** @type {number} */ n, w = 2) => String(n).padStart(w, "0");

/** @param {string} s */
const escIcs = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/**
 * Corta líneas a 75 octetos (RFC 5545 §3.1).
 * @param {string} linea
 */
function plegar(linea) {
  const enc = new TextEncoder();
  const partes = [];
  let actual = "", bytes = 0;
  for (const c of linea) {
    const b = enc.encode(c).length;
    if (bytes + b > (partes.length ? 74 : 75)) {
      partes.push(actual);
      actual = "";
      bytes = 0;
    }
    actual += c;
    bytes += b;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

/** @param {Date} f */
const fecha = (f) => `${f.getFullYear()}${pad(f.getMonth() + 1)}${pad(f.getDate())}`;

/** @param {number} min */
const hora = (min) => `${pad(Math.floor(min / 60))}${pad(min % 60)}00`;

/**
 * @param {Seccion[]} secciones
 * @param {{inicio: Date, semanas?: number, ahora?: Date}} opciones
 *   inicio: primer día de clases; semanas: repeticiones (16 por defecto)
 */
export function aIcs(secciones, { inicio, semanas = 16, ahora = new Date() }) {
  const stamp = ahora.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//horautp//ES",
    "CALSCALE:GREGORIAN",
    // Panamá no tiene horario de verano: UTC−5 todo el año.
    "BEGIN:VTIMEZONE",
    "TZID:America/Panama",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const s of secciones) {
    for (const [d, k, n, tipo, aula] of s.bloques) {
      // Primer día de la semana d en o después del inicio. getDay(): 0 = domingo.
      const f = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
      f.setDate(f.getDate() + ((d - ((f.getDay() + 6) % 7) + 7) % 7));
      L.push(
        "BEGIN:VEVENT",
        `UID:${s.codhora}-${d}-${k}@horautp`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=America/Panama:${fecha(f)}T${hora(inicioMin(k))}`,
        `DTEND;TZID=America/Panama:${fecha(f)}T${hora(finMin(k, n))}`,
        `RRULE:FREQ=WEEKLY;COUNT=${semanas}`,
        `SUMMARY:${escIcs(`${s.asignatura} (${nombreTipo(tipo)})`)}`,
        `DESCRIPTION:${escIcs(`Profesor: ${s.profesor}\nGrupo: ${s.grupo}\nCodhora: ${s.codhora}`)}`,
        `LOCATION:${escIcs(aula)}`,
        "END:VEVENT",
      );
    }
  }
  L.push("END:VCALENDAR");
  return L.map(plegar).join("\r\n") + "\r\n";
}

/** @param {string} s */
const escCsv = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** @param {number} min */
const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** @param {Seccion[]} secciones */
export function aCsv(secciones) {
  const filas = [["dia", "hora_inicio", "hora_fin", "asignatura", "tipo", "profesor", "aula", "grupo", "codasig", "codhora"]];
  for (const s of secciones) {
    for (const [d, k, n, tipo, aula] of s.bloques) {
      filas.push([
        DIAS[d], hhmm(inicioMin(k)), hhmm(finMin(k, n)), s.asignatura,
        nombreTipo(tipo), s.profesor, aula, s.grupo, s.codasig, String(s.codhora),
      ]);
    }
  }
  return filas.map((f) => f.map(escCsv).join(",")).join("\r\n") + "\r\n";
}

// @ts-check
// Horas en minutos desde las 0:00. La UTP usa dos rejillas: períodos de
// 45 min cada 50 desde las 7:00 y, en algunos posgrados, horas de 55 min.

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DIAS_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const PRIMER_INICIO = 7 * 60;
const PASO = 50;
const DURACION = 45;

const RE_HORA = /(\d{1,2}):(\d{2})/;
const RE_AMPM = /([AP])\.?\s*M/i;
const RE_TILDES = /[\u0300-\u036f]/g;
const RE_ESPACIOS = /\s+/g;
const RE_NO_CLAVE = /[^A-Z0-9]/g;

/** @param {number} k */
export const inicioMin = (k) => PRIMER_INICIO + PASO * k;

/** @param {number} k @param {number} [n] */
export const finMin = (k, n = 1) => inicioMin(k + n - 1) + DURACION;

/** "7:00-7:45A.M.", "05:50:00 PM", "17:50" → minutos, o NaN. @param {string} texto */
export function minDesdeTexto(texto) {
  const m = RE_HORA.exec(texto);
  if (!m) return NaN;
  let h = Number(m[1]);
  const ampm = RE_AMPM.exec(texto)?.[1].toUpperCase();
  if (ampm === "P" && h < 12) h += 12;
  if (ampm === "A" && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

let en24 = false;
/** @param {boolean} si */
export const usar24 = (si) => { en24 = si; };

/** @param {number} min */
export function formatoHora(min) {
  const h24 = Math.floor(min / 60);
  const mm = String(min % 60).padStart(2, "0");
  if (en24) return `${h24}:${mm}`;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${mm}${h24 < 12 ? "am" : "pm"}`;
}

/** @param {number} ini @param {number} fin */
export const rango = (ini, fin) => `${formatoHora(ini)}–${formatoHora(fin)}`;

/**
 * Fila de la grilla del portal → [inicio, fin] en minutos, o null.
 * "12:50-1:35P.M.": el AM/PM del final vale para las dos horas.
 * Sin hora final ("05:50:00 PM", PDF): un período.
 * @param {string} texto
 * @returns {[number, number] | null}
 */
export function rangoDesdeTexto(texto) {
  let ini = minDesdeTexto(texto);
  if (Number.isNaN(ini)) return null;
  const guion = texto.search(/[-–]/);
  const fin = guion < 0 ? NaN : minDesdeTexto(texto.slice(guion + 1));
  if (Number.isNaN(fin)) return [ini, ini + DURACION];
  if (ini > fin && ini >= 12 * 60) ini -= 12 * 60;
  return ini < fin ? [ini, fin] : null;
}

/** @param {string} s */
export const limpio = (s) => s.replace(RE_ESPACIOS, " ").trim();

/** Mayúsculas, sin tildes. @param {string} s */
export function normalizar(s) {
  return limpio(s.normalize("NFD").replace(RE_TILDES, "").toUpperCase());
}

/** Solo letras y dígitos: "DES. DE SOFT.II" → "DESDESOFTII". @param {string} s */
export const clave = (s) => normalizar(s).replace(RE_NO_CLAVE, "");

const DIAS_NORM = DIAS.map(normalizar);

/** @param {string} nombre */
export const diaIndex = (nombre) => DIAS_NORM.indexOf(normalizar(nombre));

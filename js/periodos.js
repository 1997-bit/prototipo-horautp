// @ts-check
// Grilla de períodos de la UTP: cada período dura 45 min y arranca cada
// 50 min desde las 7:00. inicio(k) = 7:00 + 50·k. Un bloque de clase son
// n períodos seguidos, así que dura 50·n − 5 minutos.

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DIAS_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const PRIMER_INICIO = 7 * 60;
const PASO = 50;
const DURACION = 45;

export const FRANJAS = ["manana", "tarde", "noche"];

/** @param {number} k */
export const inicioMin = (k) => PRIMER_INICIO + PASO * k;

/** @param {number} k @param {number} [n] */
export const finMin = (k, n = 1) => inicioMin(k + n - 1) + DURACION;

/**
 * Minutos desde medianoche → índice de período, o -1 si no cae en la grilla.
 * @param {number} min
 */
export function periodoDesdeMin(min) {
  const d = min - PRIMER_INICIO;
  return d >= 0 && d % PASO === 0 ? d / PASO : -1;
}

/**
 * Duración en minutos → cantidad de períodos, o -1 si no encaja.
 * @param {number} min
 */
export function periodosDesdeDuracion(min) {
  const n = (min + PASO - DURACION) / PASO;
  return Number.isInteger(n) && n > 0 ? n : -1;
}

/**
 * "7:00-7:45A.M.", "05:50:00 PM", "17:50" → minutos desde medianoche, o NaN.
 * Toma la primera hora del texto.
 * @param {string} texto
 */
export function minDesdeTexto(texto) {
  const m = /(\d{1,2}):(\d{2})/.exec(texto);
  if (!m) return NaN;
  let h = Number(m[1]);
  // En "7:00-7:45A.M." el AM/PM está al final del rango.
  const ampm = /([AP])\.?\s*M/i.exec(texto)?.[1].toUpperCase();
  if (ampm === "P" && h < 12) h += 12;
  if (ampm === "A" && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

/** @param {number} min */
export function formatoHora(min) {
  const h24 = Math.floor(min / 60);
  const mm = String(min % 60).padStart(2, "0");
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${mm}${h24 < 12 ? "am" : "pm"}`;
}

/** @param {number} k @param {number} [n] */
export const rangoPeriodo = (k, n = 1) => `${formatoHora(inicioMin(k))}–${formatoHora(finMin(k, n))}`;

/**
 * Mañana: 7:00–12:45 (k 0–6). Tarde: 12:50–4:55 (k 7–11). Noche: 5:00 en adelante.
 * @param {number} k
 */
export function franjaDe(k) {
  if (k <= 6) return "manana";
  if (k <= 11) return "tarde";
  return "noche";
}

/**
 * Mayúsculas, sin tildes, espacios colapsados.
 * @param {string} s
 */
export function normalizar(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** @param {string} nombre @returns {number} índice 0-6 o -1 */
export function diaIndex(nombre) {
  const n = normalizar(nombre);
  return DIAS.findIndex((d) => normalizar(d) === n);
}

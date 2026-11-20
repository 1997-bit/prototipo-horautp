// @ts-check
// Períodos de 45 min cada 50 min desde las 7:00.

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DIAS_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const PRIMER_INICIO = 7 * 60;
const PASO = 50;
const DURACION = 45;

export const FRANJAS = ["manana", "tarde", "noche"];

const RE_HORA = /(\d{1,2}):(\d{2})/;
const RE_AMPM = /([AP])\.?\s*M/i;
const RE_TILDES = /[\u0300-\u036f]/g;
const RE_ESPACIOS = /\s+/g;

/** @param {number} k */
export const inicioMin = (k) => PRIMER_INICIO + PASO * k;

/** @param {number} k @param {number} [n] */
export const finMin = (k, n = 1) => inicioMin(k + n - 1) + DURACION;

/** Minutos → período, o -1. @param {number} min */
export function periodoDesdeMin(min) {
  const d = min - PRIMER_INICIO;
  return d >= 0 && d % PASO === 0 ? d / PASO : -1;
}

/** Duración → n períodos, o -1. @param {number} min */
export function periodosDesdeDuracion(min) {
  const n = (min + PASO - DURACION) / PASO;
  return Number.isInteger(n) && n > 0 ? n : -1;
}

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

/** @param {number} k @param {number} [n] */
export const rangoPeriodo = (k, n = 1) => `${formatoHora(inicioMin(k))}–${formatoHora(finMin(k, n))}`;

/** @param {number} k */
export function franjaDe(k) {
  if (k <= 6) return "manana";
  if (k <= 11) return "tarde";
  return "noche";
}

/** @param {string} s */
export const limpio = (s) => s.replace(RE_ESPACIOS, " ").trim();

/** Mayúsculas, sin tildes. @param {string} s */
export function normalizar(s) {
  return limpio(s.normalize("NFD").replace(RE_TILDES, "").toUpperCase());
}

const DIAS_NORM = DIAS.map(normalizar);

/** @param {string} nombre */
export const diaIndex = (nombre) => DIAS_NORM.indexOf(normalizar(nombre));

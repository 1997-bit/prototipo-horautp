// Referencia: fuerza bruta, sin máscaras ni poda. Celdas de 10 min desde las 7:00.

import { finMin, franjaDe, inicioMin } from "../js/periodos.js";

/** Celdas de 10 min que toca [ini, fin). @param {number} ini @param {number} fin */
const celdas = (ini, fin) => {
  const a = Math.floor((ini - 420) / 10), b = Math.ceil((fin - 420) / 10);
  return Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
};
import { PESOS } from "../js/preferencias.js";

/**
 * @param {import("../js/modelo.js").Seccion[]} secciones
 * @param {string[]} requeridas
 * @param {import("../js/preferencias.js").Prefs} prefs
 * @returns {number[]}
 */
export function bruta(secciones, requeridas, prefs) {
  const excluidas = new Set(prefs.excluidas ?? []);
  const fijas = new Set(prefs.fijas ?? []);
  const evitados = new Set(prefs.evitados ?? []);
  const listas = requeridas.map((c) => {
    const enTurno = (s) => !prefs.soloTurno || !prefs.horario || fijas.has(s.codhora) || s.bloques.every(([, ini]) => franjaDe(ini) === prefs.horario);
    const solo = prefs.solo?.[c] ?? [];
    const quiero = (s) => fijas.has(s.codhora) || !solo.length || solo.includes(s.profesor);
    const l = secciones.filter((s) => s.codasig === c && !excluidas.has(s.codhora) && !evitados.has(s.profesor) && enTurno(s) && quiero(s));
    const f = l.filter((s) => fijas.has(s.codhora));
    return f.length ? f : l;
  });
  // Mismo grupo: vale su horario oficial; solo chocan subgrupos distintos.
  const choque = (a, b) => (a.grupo === b.grupo && a.codhora > 0 && b.codhora > 0
    ? !!a.sub && !!b.sub && a.sub !== b.sub
    : a.bloques.some(([d1, i1, f1]) => b.bloques.some(([d2, i2, f2]) =>
      d1 === d2 && celdas(i1, f1).some((c) => celdas(i2, f2).includes(c)))));
  const out = [];
  const rec = (i, combo) => {
    if (i === listas.length) {
      const fuera = combo.filter((s) => prefs.horario && s.bloques.some(([, ini]) => franjaDe(ini) !== prefs.horario));
      let p = fuera.length * PESOS.horario;
      const dias = new Set(combo.flatMap((s) => s.bloques.map((b) => b[0])));
      if (prefs.menosDias) p += (dias.size - 1) * PESOS.dias;
      for (const d of dias) {
        const ps = combo.flatMap((s) => s.bloques.filter((b) => b[0] === d)
          .flatMap(([, ini, fin]) => celdas(ini, fin)));
        p += (Math.max(...ps) - Math.min(...ps) + 1 - new Set(ps).size) * PESOS.hueco;
      }
      out.push(p);
      return;
    }
    for (const s of listas[i]) if (!combo.some((c) => choque(c, s))) rec(i + 1, [...combo, s]);
  };
  rec(0, []);
  return out.sort((a, b) => a - b);
}

/** Período k de 50 min, n seguidos. @param {number} d @param {number} k @param {number} n @param {string} tipo */
const bloque = (d, k, n, tipo) => [d, inicioMin(k), finMin(k, n), tipo, ""];

/**
 * @param {number} M @param {number} G @param {number} semilla
 */
export function sinteticos(M, G, semilla) {
  let x = semilla;
  const r = (/** @type {number} */ n) => ((x = (x * 1103515245 + 12345) % 2147483648), x % n);
  return Array.from({ length: G }, (_, g) => ({
    grupo: `G${g}`,
    periodo: "",
    materias: Array.from({ length: M }, (_, m) => ({
      codasig: `M${m}`,
      codhora: g * 100 + m,
      asignatura: `M${m}`,
      profesor: `P${r(4)}`,
      email: "",
      bloques: [bloque(r(5), r(18), 1 + r(2), "C"), bloque(r(5), r(18), 1 + r(2), "L")],
    })),
  }));
}

/**
 * Como la UTP: un turno por grupo, sin choques internos.
 * @param {number} M @param {number} G @param {number} semilla
 */
export function sinteticosUtp(M, G, semilla) {
  let x = semilla;
  const r = (/** @type {number} */ n) => ((x = (x * 1103515245 + 12345) % 2147483648), x % n);
  const turnos = [[0, 6], [7, 11], [13, 19]];
  return Array.from({ length: G }, (_, g) => {
    const [a, b] = turnos[r(3)];
    const ocupado = Array.from({ length: 5 }, () => new Set());
    return {
      grupo: `G${g}`,
      periodo: "",
      materias: Array.from({ length: M }, (_, m) => {
        const bloques = [];
        for (let i = 0, intento = 0; i < 2 + r(2) && intento < 200; intento++) {
          const d = r(5), n = 1 + r(3), k = a + r(b - a + 2 - n);
          const periodos = Array.from({ length: n }, (_, j) => k + j);
          if (k + n - 1 > b || periodos.some((p) => ocupado[d].has(p))) continue;
          periodos.forEach((p) => ocupado[d].add(p));
          bloques.push(bloque(d, k, n, i ? "L" : "C"));
          i++;
        }
        return { codasig: `M${m}`, codhora: g * 100 + m, asignatura: `M${m}`, profesor: `P${r(4)}`, email: "", bloques };
      }),
    };
  });
}

/**
 * Mezcla períodos de 50 min, horas de 55 min y subgrupos A/B.
 * @param {number} M @param {number} G @param {number} semilla
 */
export function sinteticosMixtos(M, G, semilla) {
  let x = semilla;
  const r = (/** @type {number} */ n) => ((x = (x * 1103515245 + 12345) % 2147483648), x % n);
  const hora = (/** @type {number} */ d, /** @type {number} */ h, /** @type {number} */ n, /** @type {string} */ tipo) =>
    [d, h * 60, h * 60 + 60 * n - 5, tipo, ""];
  return Array.from({ length: G }, (_, g) => ({
    grupo: `G${g}`,
    periodo: "",
    materias: Array.from({ length: M }, (_, m) => {
      const b = () => (r(2) ? bloque(r(5), r(18), 1 + r(2), "C") : hora(r(5), 7 + r(15), 1 + r(2), "C"));
      const bloques = [b(), b()];
      if (r(3) === 0) bloques.push([...b().slice(0, 5), "A"], [...b().slice(0, 5), "B"]);
      return { codasig: `M${m}`, codhora: g * 100 + m, asignatura: `M${m}`, profesor: `P${r(4)}`, email: "", bloques };
    }),
  }));
}

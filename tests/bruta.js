// Referencia para los tests: enumera todas las combinaciones sin choques y
// calcula la penalidad por definición (minutos, sets), sin máscaras ni poda.

import { finMin, inicioMin } from "../js/periodos.js";
import { PESOS, penalSeccion } from "../js/preferencias.js";

/**
 * @param {import("../js/modelo.js").Seccion[]} secciones
 * @param {string[]} requeridas
 * @param {import("../js/preferencias.js").Prefs} prefs
 * @returns {number[]} penalidades de todas las combinaciones, ordenadas
 */
export function bruta(secciones, requeridas, prefs) {
  const pesos = { ...PESOS, ...prefs.pesos };
  const excluidas = new Set(prefs.excluidas ?? []);
  const fijas = new Set(prefs.fijas ?? []);
  const listas = requeridas.map((c) => {
    const l = secciones.filter((s) => s.codasig === c && !excluidas.has(s.codhora));
    const f = l.filter((s) => fijas.has(s.codhora));
    return f.length ? f : l;
  });
  const choque = (a, b) => a.bloques.some(([d1, k1, n1]) => b.bloques.some(([d2, k2, n2]) =>
    d1 === d2 && inicioMin(k1) < finMin(k2, n2) && inicioMin(k2) < finMin(k1, n1)));
  const out = [];
  const rec = (i, combo) => {
    if (i === listas.length) {
      let p = combo.reduce((t, s) => t + penalSeccion(s, prefs.materias?.[s.codasig] ?? {}, pesos), 0);
      const dias = new Set(combo.flatMap((s) => s.bloques.map((b) => b[0])));
      p += Math.max(0, dias.size - (prefs.diasMax ?? Infinity)) * pesos.dias;
      if (prefs.unGrupo) p += Math.max(0, new Set(combo.map((s) => s.grupo)).size - 1) * pesos.grupo;
      if (prefs.evitarHuecos) {
        for (const d of dias) {
          const ps = combo.flatMap((s) => s.bloques.filter((b) => b[0] === d)
            .flatMap(([, k, n]) => Array.from({ length: n }, (_, j) => k + j)));
          p += (Math.max(...ps) - Math.min(...ps) + 1 - new Set(ps).size) * pesos.hueco;
        }
      }
      out.push(p);
      return;
    }
    for (const s of listas[i]) if (!combo.some((c) => choque(c, s))) rec(i + 1, [...combo, s]);
  };
  rec(0, []);
  return out.sort((a, b) => a - b);
}

/**
 * Datos sintéticos reproducibles: G grupos que dan M materias cada uno, con
 * dos bloques al azar por materia.
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
      bloques: [[r(5), r(18), 1 + r(2), "C", ""], [r(5), r(18), 1 + r(2), "L", ""]],
    })),
  }));
}

/**
 * Datos parecidos a los de la UTP: cada grupo tiene un turno (mañana k0–6,
 * tarde k7–11, noche k13–19) y sus materias encajan sin choques dentro de él.
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
          bloques.push([d, k, n, i ? "L" : "C", ""]);
          i++;
        }
        return { codasig: `M${m}`, codhora: g * 100 + m, asignatura: `M${m}`, profesor: `P${r(4)}`, email: "", bloques };
      }),
    };
  });
}

// @ts-check
// Búsqueda en profundidad con poda (branch & bound) que devuelve las K
// combinaciones de menor penalización, de forma exacta.
//
// - Restricción dura 1: una sección por materia (una por nivel del árbol).
// - Restricción dura 2: sin choques. Cada sección tiene una máscara de
//   períodos por día; `ocupado[d] & s.masks[d]` dice si choca.
// - Orden: materias con menos secciones primero (los callejones sin salida
//   aparecen arriba, donde podar sale barato) y, dentro de cada materia,
//   secciones de menor penalización primero (las buenas aparecen pronto).
// - Cota: penalización acumulada + mínimo posible de lo que falta. Los días
//   y grupos usados solo pueden crecer, así que su penalización actual
//   también es cota. Los huecos no (agregar una clase puede llenar uno), por
//   eso se suman recién al final.

import { huecos, popcount } from "./bits.js";
import { PESOS, penalSeccion } from "./preferencias.js";

/**
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./preferencias.js").Prefs} Prefs
 * @typedef {{secciones: Seccion[], penalidad: number,
 *            detalle: {secciones: number, dias: number, huecos: number, grupos: number}}} Opcion
 * @typedef {{estado: "OK", opciones: Opcion[]}
 *         | {estado: "FALTAN", faltan: string[], opciones: []}
 *         | {estado: "SIN_SOLUCION", opciones: []}} Resultado
 */

export const K_POR_DEFECTO = 50;

/**
 * @param {Seccion[]} secciones
 * @param {string[]} requeridas codasig de las materias a inscribir
 * @param {Prefs} [prefs]
 * @param {number} [K]
 * @returns {Resultado}
 */
export function resolver(secciones, requeridas, prefs = {}, K = K_POR_DEFECTO) {
  const pesos = { ...PESOS, ...prefs.pesos };
  const diasMax = prefs.diasMax ?? Infinity;
  const pesoHueco = prefs.evitarHuecos ? pesos.hueco : 0;
  const pesoGrupo = prefs.unGrupo ? pesos.grupo : 0;

  /** @type {Map<string, {s: Seccion, p: number}[]>} */
  const porMateria = new Map(requeridas.map((c) => [c, []]));
  for (const s of secciones) {
    const lista = porMateria.get(s.codasig);
    if (lista) lista.push({ s, p: penalSeccion(s, prefs.materias?.[s.codasig] ?? {}, pesos) });
  }
  const faltan = requeridas.filter((c) => porMateria.get(c)?.length === 0);
  if (faltan.length) return { estado: "FALTAN", faltan, opciones: [] };

  const niveles = [...porMateria.values()]
    .map((l) => l.sort((a, b) => a.p - b.p))
    .sort((a, b) => a.length - b.length);

  // minResto[i] = mejor penalización posible de las materias i..fin
  const minResto = new Array(niveles.length + 1).fill(0);
  for (let i = niveles.length - 1; i >= 0; i--) minResto[i] = minResto[i + 1] + niveles[i][0].p;

  const ocupado = [0, 0, 0, 0, 0, 0, 0];
  /** @type {Map<string, number>} */
  const usoGrupo = new Map();
  /** @type {Seccion[]} */
  const elegidas = [];
  /** @type {Opcion[]} */
  const mejores = [];
  const peor = () => (mejores.length === K ? mejores[K - 1].penalidad : Infinity);

  /** @param {number} i @param {number} pen @param {number} dias */
  function dfs(i, pen, dias) {
    const nDias = popcount(dias);
    const nGrupos = usoGrupo.size;
    const fijo = pen
      + Math.max(0, nDias - diasMax) * pesos.dias
      + Math.max(0, nGrupos - 1) * pesoGrupo;
    if (fijo + minResto[i] >= peor()) return;

    if (i === niveles.length) {
      const nHuecos = ocupado.reduce((t, m) => t + huecos(m), 0);
      const total = fijo + nHuecos * pesoHueco;
      if (total >= peor()) return;
      let j = mejores.length;
      while (j > 0 && mejores[j - 1].penalidad > total) j--;
      mejores.splice(j, 0, {
        secciones: [...elegidas].sort((a, b) => a.asignatura.localeCompare(b.asignatura)),
        penalidad: total,
        detalle: { secciones: pen, dias: nDias, huecos: nHuecos, grupos: nGrupos },
      });
      if (mejores.length > K) mejores.pop();
      return;
    }

    for (const { s, p } of niveles[i]) {
      let choca = false;
      for (let d = 0; d < 7; d++) if (ocupado[d] & s.masks[d]) { choca = true; break; }
      if (choca) continue;

      for (let d = 0; d < 7; d++) ocupado[d] |= s.masks[d];
      usoGrupo.set(s.grupo, (usoGrupo.get(s.grupo) ?? 0) + 1);
      elegidas.push(s);

      dfs(i + 1, pen + p, dias | s.dias);

      elegidas.pop();
      const n = /** @type {number} */ (usoGrupo.get(s.grupo)) - 1;
      if (n) usoGrupo.set(s.grupo, n);
      else usoGrupo.delete(s.grupo);
      for (let d = 0; d < 7; d++) ocupado[d] &= ~s.masks[d];
    }
  }

  dfs(0, 0, 0);
  return mejores.length ? { estado: "OK", opciones: mejores } : { estado: "SIN_SOLUCION", opciones: [] };
}

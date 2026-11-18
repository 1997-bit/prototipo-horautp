// @ts-check
// Búsqueda en profundidad con poda (branch & bound) que devuelve las K
// combinaciones de menor penalización, de forma exacta.
//
// - Restricción dura 1: una sección por materia (una materia por nivel).
// - Restricción dura 2: sin choques. Cada sección tiene una máscara de
//   períodos por día; `ocupado[d] & s.masks[d]` dice si choca.
//
// En cada nodo se revisa, para cada materia pendiente, qué secciones todavía
// caben (forward checking). Con eso:
// - si alguna materia se quedó sin secciones, la rama se corta ahí;
// - se ramifica por la materia con menos secciones que caben;
// - la cota suma lo mínimo que todavía puede costar cada componente:
//     secciones: mejor penalización que cabe en cada materia pendiente
//     días:      días actuales + los que alguna materia obliga a agregar
//     grupos:    +1 si alguna materia no cabe en ningún grupo ya usado
//     huecos:    huecos actuales que ninguna sección pendiente puede llenar
//   Si la cota no mejora a la peor del top-K, la rama se poda.
//
// Un límite de tiempo evita que un caso extremo haga esperar de más: si se
// agota, se devuelve lo mejor encontrado con `parcial: true`.

import { mascaraHuecos, popcount } from "./bits.js";
import { PESOS, penalSeccion } from "./preferencias.js";

/**
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./preferencias.js").Prefs} Prefs
 * @typedef {{secciones: Seccion[], penalidad: number,
 *            detalle: {secciones: number, dias: number, huecos: number, grupos: number}}} Opcion
 * @typedef {{estado: "OK", opciones: Opcion[], parcial: boolean}
 *         | {estado: "FALTAN", faltan: string[], opciones: [], parcial: false}
 *         | {estado: "SIN_SOLUCION", opciones: [], parcial: boolean, choques: [string, string][]}} Resultado
 * @typedef {{s: Seccion, p: number}} Candidata
 */

export const K_POR_DEFECTO = 50;
export const MS_MAX = 1500;

/**
 * Secciones posibles por materia (sin excluidas; solo las fijas si hay),
 * ordenadas de menor a mayor penalización.
 * @param {Seccion[]} secciones @param {string[]} requeridas @param {Prefs} prefs @param {typeof PESOS} pesos
 * @returns {Map<string, Candidata[]>}
 */
function candidatas(secciones, requeridas, prefs, pesos) {
  const excluidas = new Set(prefs.excluidas ?? []);
  const fijas = new Set(prefs.fijas ?? []);
  /** @type {Map<string, Candidata[]>} */
  const m = new Map(requeridas.map((c) => [c, []]));
  for (const s of secciones) {
    const l = m.get(s.codasig);
    if (l && !excluidas.has(s.codhora)) l.push({ s, p: penalSeccion(s, prefs.materias?.[s.codasig] ?? {}, pesos) });
  }
  for (const [c, l] of m) {
    const f = l.filter((x) => fijas.has(x.s.codhora));
    m.set(c, (f.length ? f : l).sort((a, b) => a.p - b.p));
  }
  return m;
}

/** @param {Seccion} a @param {Seccion} b */
const chocan = (a, b) => a.masks.some((m, d) => m & b.masks[d]);

/**
 * Pares de materias en que toda sección de una choca con toda sección de la
 * otra: la explicación más directa de por qué no hay solución.
 * @param {Map<string, Candidata[]>} cand
 * @returns {[string, string][]}
 */
function paresImposibles(cand) {
  const l = [...cand.entries()];
  /** @type {[string, string][]} */
  const pares = [];
  for (let i = 0; i < l.length; i++) {
    for (let j = i + 1; j < l.length; j++) {
      if (l[i][1].every((a) => l[j][1].every((b) => chocan(a.s, b.s)))) pares.push([l[i][0], l[j][0]]);
    }
  }
  return pares;
}

/**
 * @param {Seccion[]} secciones
 * @param {string[]} requeridas codasig de las materias a inscribir
 * @param {Prefs} [prefs]
 * @param {number} [K]
 * @param {number} [msMax] tiempo máximo de búsqueda
 * @returns {Resultado}
 */
export function resolver(secciones, requeridas, prefs = {}, K = K_POR_DEFECTO, msMax = MS_MAX) {
  const pesos = { ...PESOS, ...prefs.pesos };
  const diasMax = prefs.diasMax ?? Infinity;
  const pesoHueco = prefs.evitarHuecos ? pesos.hueco : 0;
  const pesoGrupo = prefs.unGrupo ? pesos.grupo : 0;

  const cand = candidatas(secciones, requeridas, prefs, pesos);
  const faltan = requeridas.filter((c) => cand.get(c)?.length === 0);
  if (faltan.length) return { estado: "FALTAN", faltan, opciones: [], parcial: false };

  const materias = [...cand.values()];
  const M = materias.length;
  const asignada = new Uint8Array(M);
  const ocupado = [0, 0, 0, 0, 0, 0, 0];
  /** @type {Map<string, number>} */
  const usoGrupo = new Map();
  /** @type {Seccion[]} */
  const elegidas = [];
  /** @type {Opcion[]} */
  const mejores = [];
  const peor = () => (mejores.length === K ? mejores[K - 1].penalidad : Infinity);
  const limite = performance.now() + msMax;
  let nodos = 0;
  let parcial = false;

  /** @param {Seccion} s */
  const cabe = (s) => {
    const u = s.usos;
    for (let i = 0; i < u.length; i += 2) if (ocupado[u[i]] & u[i + 1]) return false;
    return true;
  };


  /** @param {number} pen @param {number} dias */
  function hoja(pen, dias) {
    const nDias = popcount(dias);
    const nGrupos = usoGrupo.size;
    const nHuecos = ocupado.reduce((t, m) => t + popcount(mascaraHuecos(m)), 0);
    const total = pen
      + Math.max(0, nDias - diasMax) * pesos.dias
      + Math.max(0, nGrupos - 1) * pesoGrupo
      + nHuecos * pesoHueco;
    if (total >= peor()) return;
    let j = mejores.length;
    while (j > 0 && mejores[j - 1].penalidad > total) j--;
    mejores.splice(j, 0, {
      secciones: [...elegidas].sort((a, b) => a.asignatura.localeCompare(b.asignatura)),
      penalidad: total,
      detalle: { secciones: pen, dias: nDias, huecos: nHuecos, grupos: nGrupos },
    });
    if (mejores.length > K) mejores.pop();
  }

  /** @param {number} asignadas @param {number} pen @param {number} dias */
  function dfs(asignadas, pen, dias) {
    if ((++nodos & 0x3ff) === 0 && performance.now() > limite) parcial = true;
    if (parcial) return;
    if (asignadas === M) {
      hoja(pen, dias);
      return;
    }

    // Forward checking sobre las materias pendientes.
    const nGrupos = usoGrupo.size;
    const posible = [0, 0, 0, 0, 0, 0, 0];
    let elegida = -1, menos = Infinity, minElegida = 0;
    let minPen = 0, diasNuevos = 0, grupoNuevo = false;
    for (let j = 0; j < M; j++) {
      if (asignada[j]) continue;
      let n = 0, mejorP = 0, minDias = 8, enGrupoUsado = false;
      for (const { s, p } of materias[j]) {
        if (!cabe(s)) continue;
        if (n++ === 0) mejorP = p; // ordenadas: la primera que cabe es la mejor
        const dn = popcount(s.dias & ~dias);
        if (dn < minDias) minDias = dn;
        if (!enGrupoUsado && usoGrupo.has(s.grupo)) enGrupoUsado = true;
        if (pesoHueco) for (let i = 0; i < s.usos.length; i += 2) posible[s.usos[i]] |= s.usos[i + 1];
      }
      if (n === 0) return; // callejón sin salida
      minPen += mejorP;
      if (minDias > diasNuevos) diasNuevos = minDias;
      if (!enGrupoUsado) grupoNuevo = true;
      if (n < menos) {
        menos = n;
        elegida = j;
        minElegida = mejorP;
      }
    }

    let huecosFijos = 0;
    if (pesoHueco) for (let d = 0; d < 7; d++) huecosFijos += popcount(mascaraHuecos(ocupado[d]) & ~posible[d]);
    const gruposMin = Math.max(nGrupos, 1) + (nGrupos > 0 && grupoNuevo ? 1 : 0);
    const cota = pen + minPen
      + Math.max(0, popcount(dias) + diasNuevos - diasMax) * pesos.dias
      + (gruposMin - 1) * pesoGrupo
      + huecosFijos * pesoHueco;
    if (cota >= peor()) return;

    asignada[elegida] = 1;
    for (const { s, p } of materias[elegida]) {
      if (cota - minElegida + p >= peor()) break; // ordenadas por p: las siguientes cuestan más
      if (!cabe(s)) continue;

      const u = s.usos;
      for (let i = 0; i < u.length; i += 2) ocupado[u[i]] |= u[i + 1];
      usoGrupo.set(s.grupo, (usoGrupo.get(s.grupo) ?? 0) + 1);
      elegidas.push(s);

      dfs(asignadas + 1, pen + p, dias | s.dias);

      elegidas.pop();
      const n = /** @type {number} */ (usoGrupo.get(s.grupo)) - 1;
      if (n) usoGrupo.set(s.grupo, n);
      else usoGrupo.delete(s.grupo);
      for (let i = 0; i < u.length; i += 2) ocupado[u[i]] &= ~u[i + 1];
      if (parcial) break;
    }
    asignada[elegida] = 0;
  }

  dfs(0, 0, 0);
  if (mejores.length) return { estado: "OK", opciones: mejores, parcial };
  return { estado: "SIN_SOLUCION", opciones: [], parcial, choques: paresImposibles(cand) };
}

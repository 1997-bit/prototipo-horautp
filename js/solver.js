// @ts-check
// Branch & bound exacto: las K combinaciones de menor penalidad.
// Forward checking con bitsets (dom &= ~choques); ramifica por la materia
// con menos candidatas. Cota: mejor sección pendiente + días forzados +
// huecos que nadie puede llenar. Al agotar el tiempo: parcial.

import { mascaraHuecos, popcount } from "./bits.js";
import { PESOS, descartada, penalSeccion, penalidad } from "./preferencias.js";

/**
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./preferencias.js").Prefs} Prefs
 * @typedef {{secciones: Seccion[], penalidad: number, detalle: {dias: number, huecos: number}}} Opcion
 * @typedef {{estado: "OK", opciones: Opcion[], parcial: boolean}
 *         | {estado: "FALTAN", faltan: string[], opciones: [], parcial: false}
 *         | {estado: "SIN_SOLUCION", opciones: [], parcial: boolean, choques: [string, string][]}} Resultado
 * @typedef {{s: Seccion, p: number}} Candidata
 */

export const K_POR_DEFECTO = 50;
export const MS_MAX = 1500;

// USOS: día en los 3 bits altos, períodos en el resto.
const DIA = 29;
const PERIODOS = (1 << DIA) - 1;

/** @param {number} x */
const bitBajo = (x) => 31 - Math.clz32(x & -x);

/**
 * Ordenadas por penalidad.
 * @param {Seccion[]} secciones @param {string[]} requeridas @param {Prefs} prefs
 * @returns {Map<string, Candidata[]>}
 */
export function candidatas(secciones, requeridas, prefs) {
  const fijas = new Set(prefs.fijas ?? []);
  /** @type {Map<string, Candidata[]>} */
  const m = new Map(requeridas.map((c) => [c, []]));
  for (const s of secciones) {
    const l = m.get(s.codasig);
    if (l && !descartada(s, prefs)) l.push({ s, p: penalSeccion(s, prefs) });
  }
  for (const [c, l] of m) {
    const f = l.filter((x) => fijas.has(x.s.codhora));
    m.set(c, (f.length ? f : l).sort((a, b) => a.p - b.p));
  }
  return m;
}

/**
 * Materia j: candidatas base[j]..base[j+1], palabras woff[j]..woff[j+1].
 * @param {Candidata[][]} materias
 */
function tablas(materias) {
  const M = materias.length;
  const base = new Int32Array(M + 1);
  const woff = new Int32Array(M + 1);
  for (let j = 0; j < M; j++) {
    base[j + 1] = base[j] + materias[j].length;
    woff[j + 1] = woff[j] + ((materias[j].length + 31) >>> 5);
  }
  const N = base[M], TW = woff[M];

  /** @type {Seccion[]} */
  const sec = new Array(N);
  const P = new Int32Array(N);
  const DIAS = new Uint8Array(N);
  const MASKS = new Int32Array(N * 7);
  const UOFF = new Int32Array(N + 1);
  let g = 0;
  for (const l of materias) {
    for (const { s, p } of l) {
      sec[g] = s;
      P[g] = p;
      DIAS[g] = s.dias;
      for (let d = 0; d < 7; d++) MASKS[g * 7 + d] = s.masks[d];
      UOFF[g + 1] = UOFF[g] + (s.usos.length >>> 1);
      g++;
    }
  }
  const USOS = new Int32Array(UOFF[N]);
  for (let g = 0; g < N; g++) {
    const u = sec[g].usos;
    for (let i = 0; i < u.length; i += 2) USOS[UOFF[g] + (i >>> 1)] = (u[i] << DIA) | u[i + 1];
  }

  // CONF[g]: chocan con g. CELDA[d*32+k]: ocupan ese período.
  const CONF = new Uint32Array(N * TW);
  const CELDA = new Uint32Array(7 * 32 * TW);
  for (let j = 0; j < M; j++) {
    for (let g = base[j]; g < base[j + 1]; g++) {
      const i = g - base[j], w = woff[j] + (i >>> 5), bit = 1 << (i & 31);
      for (let u = UOFF[g]; u < UOFF[g + 1]; u++) {
        const d = USOS[u] >>> DIA;
        for (let m = USOS[u] & PERIODOS; m; m &= m - 1) CELDA[(d * 32 + bitBajo(m)) * TW + w] |= bit;
      }
    }
  }
  for (let j = 0; j < M; j++) {
    for (let a = base[j]; a < base[j + 1]; a++) {
      for (let j2 = j + 1; j2 < M; j2++) {
        for (let b = base[j2]; b < base[j2 + 1]; b++) {
          let choca = 0;
          for (let d = 0; d < 7; d++) choca |= MASKS[a * 7 + d] & MASKS[b * 7 + d];
          if (!choca) continue;
          const ib = b - base[j2], ia = a - base[j];
          CONF[a * TW + woff[j2] + (ib >>> 5)] |= 1 << (ib & 31);
          CONF[b * TW + woff[j] + (ia >>> 5)] |= 1 << (ia & 31);
        }
      }
    }
  }
  return { M, N, TW, base, woff, sec, P, DIAS, USOS, UOFF, CONF, CELDA };
}

/** @param {Seccion} a @param {Seccion} b */
const chocan = (a, b) => a.masks.some((m, d) => m & b.masks[d]);

/**
 * Pares de materias que chocan en todas sus secciones.
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
 * @param {string[]} requeridas
 * @param {Prefs} [prefs]
 * @param {number} [K]
 * @param {number} [msMax]
 * @returns {Resultado}
 */
export function resolver(secciones, requeridas, prefs = {}, K = K_POR_DEFECTO, msMax = MS_MAX) {
  const diasMax = prefs.menosDias ? 1 : Infinity;
  const conDias = !!prefs.menosDias;

  const cand = candidatas(secciones, requeridas, prefs);
  const faltan = requeridas.filter((c) => cand.get(c)?.length === 0);
  if (faltan.length) return { estado: "FALTAN", faltan, opciones: [], parcial: false };

  const { M, TW, base, woff, sec, P, DIAS, USOS, UOFF, CONF, CELDA } = tablas([...cand.values()]);

  // Dominio por nivel.
  const dom = new Uint32Array((M + 1) * TW);
  for (let j = 0; j < M; j++) {
    for (let w = woff[j], resto = base[j + 1] - base[j]; resto > 0; w++, resto -= 32) {
      dom[w] = resto >= 32 ? 0xffffffff : (1 << resto) - 1;
    }
  }
  const asignada = new Uint8Array(M);
  const ocupado = new Int32Array(7);
  // Huecos fijos por nivel y día: los dominios solo se achican.
  const muertos = new Int32Array((M + 1) * 7);
  // Caché por celda de la última palabra que la tapaba.
  const testigo = new Int32Array(7 * 32);
  const elegidas = new Int32Array(M);
  /** @type {{sel: Int32Array, penalidad: number, detalle: Opcion["detalle"]}[]} */
  const mejores = [];
  let peor = Infinity;
  const limite = performance.now() + msMax;
  let nodos = 0;
  let parcial = false;

  /** @param {number} pen @param {number} dias */
  function hoja(pen, dias) {
    const nDias = popcount(dias);
    let nHuecos = 0;
    for (let d = 0; d < 7; d++) nHuecos += popcount(mascaraHuecos(ocupado[d]));
    const total = pen + Math.max(0, nDias - diasMax) * PESOS.dias + nHuecos * PESOS.hueco;
    if (total >= peor) return;
    let j = mejores.length;
    while (j > 0 && mejores[j - 1].penalidad > total) j--;
    mejores.splice(j, 0, {
      sel: elegidas.slice(),
      penalidad: total,
      detalle: { dias: nDias, huecos: nHuecos },
    });
    if (mejores.length > K) mejores.pop();
    if (mejores.length === K) peor = mejores[K - 1].penalidad;
  }

  /** @param {number} t nivel (materias ya asignadas) @param {number} pen @param {number} dias */
  function dfs(t, pen, dias) {
    if ((++nodos & 0x3ff) === 0 && performance.now() > limite) parcial = true;
    if (parcial) return;
    if (t === M) {
      hoja(pen, dias);
      return;
    }

    const fila = t * TW;

    let elegida = -1, menos = Infinity, minElegida = 0;
    let minPen = 0, diasNuevos = 0;
    for (let j = 0; j < M; j++) {
      if (asignada[j]) continue;
      let n = 0, mejorP = -1, minDias = 8;
      for (let w = fila + woff[j], fin = fila + woff[j + 1], g0 = base[j]; w < fin; w++, g0 += 32) {
        let x = dom[w];
        if (!x) continue;
        n += popcount(x);
        if (mejorP < 0) mejorP = P[g0 + bitBajo(x)];
        if (conDias && minDias) {
          for (; x; x &= x - 1) {
            const dn = popcount(DIAS[g0 + bitBajo(x)] & ~dias);
            if (dn < minDias) minDias = dn;
          }
        }
      }
      if (n === 0) return;
      minPen += mejorP;
      if (conDias && minDias > diasNuevos) diasNuevos = minDias;
      if (n < menos) {
        menos = n;
        elegida = j;
        minElegida = mejorP;
      }
    }

    let huecosFijos = 0;
    for (let d = 0, md = t * 7; d < 7; d++, md++) {
      let m = t ? muertos[md - 7] : 0;
      for (let h = mascaraHuecos(ocupado[d]) & ~m; h; h &= h - 1) {
        const k = bitBajo(h), celda = d * 32 + k, c = celda * TW;
        if (dom[fila + testigo[celda]] & CELDA[c + testigo[celda]]) continue;
        let w = 0;
        while (w < TW && !(dom[fila + w] & CELDA[c + w])) w++;
        if (w < TW) testigo[celda] = w;
        else m |= 1 << k;
      }
      muertos[md] = m;
      huecosFijos += popcount(m);
    }
    const cota = pen + minPen
      + Math.max(0, popcount(dias) + diasNuevos - diasMax) * PESOS.dias
      + huecosFijos * PESOS.hueco;
    if (cota >= peor) return;

    asignada[elegida] = 1;
    const hijo = fila + TW;
    let seguir = true;
    for (let w = fila + woff[elegida], fin = fila + woff[elegida + 1], g0 = base[elegida]; seguir && w < fin; w++, g0 += 32) {
      for (let x = dom[w]; x; x &= x - 1) {
        const g = g0 + bitBajo(x);
        const p = P[g];
        if (cota - minElegida + p >= peor) { seguir = false; break; }

        for (let k = 0, c = g * TW; k < TW; k++) dom[hijo + k] = dom[fila + k] & ~CONF[c + k];
        for (let k = woff[elegida]; k < woff[elegida + 1]; k++) dom[hijo + k] = 0;
        const u0 = UOFF[g], u1 = UOFF[g + 1];
        for (let i = u0; i < u1; i++) ocupado[USOS[i] >>> DIA] |= USOS[i] & PERIODOS;
        elegidas[t] = g;

        dfs(t + 1, pen + p, dias | DIAS[g]);

        for (let i = u0; i < u1; i++) ocupado[USOS[i] >>> DIA] &= ~(USOS[i] & PERIODOS);
        if (parcial) { seguir = false; break; }
      }
    }
    asignada[elegida] = 0;
  }

  dfs(0, 0, 0);
  if (mejores.length) {
    const opciones = mejores.map(({ sel, penalidad, detalle }) => ({
      secciones: Array.from(sel, (g) => sec[g]).sort((a, b) => a.asignatura.localeCompare(b.asignatura)),
      penalidad,
      detalle,
    }));
    return { estado: "OK", opciones, parcial };
  }
  return { estado: "SIN_SOLUCION", opciones: [], parcial, choques: paresImposibles(cand) };
}

/**
 * Plan B por sección, sin mover las demás. Compara por codhora (copias del Worker).
 * @param {Seccion[]} secciones @param {Seccion[]} opcion @param {Prefs} prefs
 * @returns {Map<number, Seccion[]>}
 */
export function reemplazos(secciones, opcion, prefs) {
  const libre = { ...prefs, fijas: [] };
  return new Map(opcion.map((s) => {
    const resto = opcion.filter((x) => x !== s);
    const costo = new Map(secciones
      .filter((x) => x.codasig === s.codasig && x.codhora !== s.codhora && !descartada(x, libre) && !resto.some((y) => chocan(x, y)))
      .map((x) => [x, penalidad([...resto, x], prefs)]));
    return [s.codhora, [...costo.keys()].sort((a, b) => /** @type {number} */ (costo.get(a)) - /** @type {number} */ (costo.get(b)))];
  }));
}

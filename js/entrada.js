// @ts-check
// "Horario del Grupo" del portal → Grupo. DOM → Crudo → Grupo (puro).

import { DIAS, diaIndex, limpio, minDesdeTexto, normalizar, periodoDesdeMin } from "./periodos.js";

/**
 * @typedef {import("./modelo.js").Grupo} Grupo
 * @typedef {import("./modelo.js").Materia} Materia
 * @typedef {{texto: string, tablas: string[][][]}} Crudo
 */

// ---------- DOM (navegador) ----------

/** @param {Element} celda */
function textoCelda(celda) {
  const c = /** @type {Element} */ (celda.cloneNode(true));
  c.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return (c.textContent ?? "")
    .split("\n").map(limpio).filter(Boolean).join("\n");
}

/** Expande rowspan/colspan. @param {HTMLTableElement} tabla */
function matriz(tabla) {
  /** @type {string[][]} */
  const out = [];
  [...tabla.rows].forEach((tr, r) => {
    out[r] ??= [];
    let c = 0;
    for (const td of tr.cells) {
      while (out[r][c] !== undefined) c++;
      const t = textoCelda(td);
      for (let i = 0; i < (td.rowSpan || 1); i++) {
        for (let j = 0; j < (td.colSpan || 1); j++) (out[r + i] ??= [])[c + j] = t;
      }
      c += td.colSpan || 1;
    }
  });
  return out.map((f) => Array.from(f, (x) => x ?? ""));
}

/** textContent pegaría "4GS111Periodo". @param {Document} doc */
function textoPagina(doc) {
  if (!doc.body) return "";
  const partes = [];
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) partes.push(w.currentNode.nodeValue);
  return partes.join(" ");
}

/** @param {Document} doc @returns {Crudo} */
export function crudoDesdeDocumento(doc) {
  return {
    texto: textoPagina(doc),
    tablas: [...doc.querySelectorAll("table")].map((t) => matriz(/** @type {HTMLTableElement} */ (t))),
  };
}

/** @param {string} html */
export function grupoDesdeHtml(html) {
  return grupoDesdeCrudo(crudoDesdeDocumento(new DOMParser().parseFromString(html, "text/html")));
}

// ---------- interpretación (pura) ----------

// "SEDE: PANAMÁ" (PDF) o "VERAGUAS - 4GS111" (portal)
const SEDES = ["BOCAS DEL TORO", "PANAMA OESTE", "PANAMA", "AZUERO", "CHIRIQUI", "COCLE", "COLON", "VERAGUAS"];
const RE_SEDE = new RegExp(`(?:SEDE:\\s*|\\b)(${SEDES.join("|")})\\b(?=\\s*(?:CARRERA|-\\s*\\d[A-Z]))`);
// "GRUPO:" primero: antes van los botones de otros grupos.
const RE_GRUPO_ROTULO = /GRUPO:\s*(\d[A-Z]{1,4}\d{3})\b/;
const RE_GRUPO = /\b(\d[A-Z]{1,4}\d{3})\b/;
const RE_PERIODO = /\b(I{1,3})\s*-\s*(\d{4})\b/;
const RE_PERIODO_ROTULO = /PERIODO:\s*(I{1,3})\b/;
const RE_ANO = /ANO:\s*(\d{4})/;
const RE_AULA = /\baula:?\s*(.+)/i;
const RE_CL = /\(\s*C\s*\+\s*L\s*\)/i;
const RE_L = /\(\s*L\s*\)/i;
const RE_PARENTESIS_FINAL = /\([^)]*\)\s*$/;
const RE_NO_CLAVE = /[^A-Z0-9]/g;
const RE_SALTOS = /\n/g;
const RE_ENTERO = /^\d+$/;
const RE_ESPACIO = /\s/g;

/** @param {string} s */
const clave = (s) => normalizar(s).replace(RE_NO_CLAVE, "");

/**
 * "ESTRUCT.DATOS I(L )\naula 4fis" → {nombre, tipo, aula}
 * @param {string} texto
 */
export function leerCelda(texto) {
  const m = RE_AULA.exec(texto);
  const aula = m ? m[1].split("\n")[0].trim() : "";
  const antes = (m ? texto.slice(0, m.index) : texto).replace(RE_SALTOS, " ");
  let tipo = "C";
  if (RE_CL.test(antes)) tipo = "CL";
  else if (RE_L.test(antes)) tipo = "L";
  const nombre = antes.replace(RE_PARENTESIS_FINAL, "").trim();
  return { nombre, tipo, aula };
}

/** @param {string[][]} t */
function esGrilla(t) {
  return t.some((f) => f.filter((c) => diaIndex(c) >= 0).length >= 5);
}

/** @param {string[][]} t */
function esLeyenda(t) {
  return t.some((f) => {
    const n = f.map(normalizar);
    return n.includes("CODHORA") && n.includes("CODASIG");
  });
}

/**
 * @param {string[][]} t
 * @returns {Materia[]}
 */
function leerLeyenda(t) {
  const iCab = t.findIndex((f) => f.map(normalizar).includes("CODHORA"));
  const cab = t[iCab].map(normalizar);
  const col = (/** @type {string[]} */ ...nombres) => cab.findIndex((c) => nombres.includes(c));
  const [cAsig, cCodasig, cCodhora, cProf, cEmail] = [
    col("ASIGNATURA"), col("CODASIG"), col("CODHORA"), col("PROFESOR"), col("EMAIL", "CORREO"),
  ];
  return t.slice(iCab + 1)
    .filter((f) => RE_ENTERO.test(f[cCodhora]?.trim() ?? ""))
    .map((f) => ({
      codasig: f[cCodasig].trim(),
      codhora: Number(f[cCodhora]),
      asignatura: limpio(f[cAsig]),
      profesor: limpio(f[cProf] ?? ""),
      email: (f[cEmail] ?? "").trim(),
      bloques: [],
    }));
}

/** @param {string[][]} t @param {Materia[]} materias */
function leerGrilla(t, materias) {
  const iCab = t.findIndex((f) => f.filter((c) => diaIndex(c) >= 0).length >= 5);
  const colDia = t[iCab].map(diaIndex);
  const porClave = new Map(materias.map((m) => [clave(m.asignatura), m]));

  /** @param {string} nombre */
  const buscar = (nombre) => {
    const c = clave(nombre);
    const m = porClave.get(c) ?? materias.find((x) => {
      const cx = clave(x.asignatura);
      return cx.startsWith(c) || c.startsWith(cx);
    });
    if (!m) throw new Error(`"${nombre}" no aparece en la tabla de asignaturas`);
    return m;
  };

  /** @type {([Materia, import("./modelo.js").Bloque] | null)[]} */
  const abierto = [null, null, null, null, null, null, null];

  for (const fila of t.slice(iCab + 1)) {
    const k = periodoDesdeMin(minDesdeTexto(fila[0] ?? ""));
    if (k < 0) continue;
    fila.forEach((txt, c) => {
      const d = colDia[c];
      if (d < 0 || !txt.trim()) return;
      const { nombre, tipo, aula } = leerCelda(txt);
      const m = buscar(nombre);
      const a = abierto[d];
      if (a && a[0] === m && a[1][3] === tipo && a[1][4] === aula && a[1][1] + a[1][2] === k) {
        a[1][2]++;
      } else {
        /** @type {import("./modelo.js").Bloque} */
        const b = [d, k, 1, tipo, aula];
        m.bloques.push(b);
        abierto[d] = [m, b];
      }
    });
  }
}

/** @param {Crudo} crudo @returns {Grupo} */
export function grupoDesdeCrudo(crudo) {
  const grilla = crudo.tablas.find(esGrilla);
  const leyenda = crudo.tablas.find(esLeyenda);
  if (!grilla) throw new Error("No encontré la tabla del horario (HORA / LUNES / MARTES…).");
  if (!leyenda) throw new Error("No encontré la tabla de asignaturas (CODASIG / CODHORA).");

  const materias = leerLeyenda(leyenda);
  if (!materias.length) throw new Error("La tabla de asignaturas está vacía.");
  leerGrilla(grilla, materias);
  for (const m of materias) m.bloques.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const texto = normalizar(crudo.texto);
  const grupo = RE_GRUPO_ROTULO.exec(texto)?.[1]
    ?? RE_GRUPO.exec(texto)?.[1]
    ?? `SIN-CODIGO-${Math.min(...materias.map((m) => m.codhora))}`;
  const per = RE_PERIODO.exec(texto);
  const periodo = per
    ? `${per[1]}-${per[2]}`
    : [RE_PERIODO_ROTULO.exec(texto)?.[1], RE_ANO.exec(texto)?.[1]].filter(Boolean).join("-");
  const sede = RE_SEDE.exec(texto)?.[1];

  return { grupo, periodo, ...(sede ? { sede } : {}), materias };
}

/** @param {unknown} datos @returns {Grupo[]} */
export function gruposDesdeJson(datos) {
  const lista = Array.isArray(datos) ? datos : [datos];
  for (const g of lista) {
    if (!g || typeof g.grupo !== "string" || !Array.isArray(g.materias)) {
      throw new Error("El JSON no tiene el formato de grupo esperado.");
    }
  }
  return lista;
}

/**
 * @typedef {{asignatura: string, profesor: string, grupo: string,
 *            bloques: import("./modelo.js").Bloque[]}} Manual
 */

/**
 * Reusa el codasig de una materia homónima; codhora negativo.
 * @param {Manual} datos @param {Grupo[]} grupos @returns {Grupo}
 */
export function grupoManual(datos, grupos) {
  const asignatura = limpio(datos.asignatura);
  if (!asignatura) throw new Error("Escribe el nombre de la materia.");
  if (!datos.bloques.length) throw new Error("Agrega al menos un día de clase.");

  const bloques = [...datos.bloques].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let i = 1; i < bloques.length; i++) {
    const [d, k] = bloques[i], [dp, kp, np] = bloques[i - 1];
    if (d === dp && k < kp + np) throw new Error(`Dos horas del ${DIAS[d].toLowerCase()} se pisan.`);
  }

  const todas = grupos.flatMap((g) => g.materias);
  const c = clave(asignatura);
  const codasig = todas.find((m) => clave(m.asignatura) === c)?.codasig ?? `M-${c}`;
  const codhora = Math.min(0, ...todas.map((m) => m.codhora)) - 1;

  return {
    grupo: normalizar(datos.grupo).replace(RE_ESPACIO, ""),
    periodo: "",
    manual: true,
    materias: [{ codasig, codhora, asignatura, profesor: limpio(datos.profesor), email: "", bloques }],
  };
}

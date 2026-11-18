// @ts-check
// Página "Horario del Grupo" del portal de Matrícula → Grupo.
//
// Dos pasos para poder testear sin navegador:
//   crudoDesdeDocumento(doc)  DOM → {texto, tablas}   (solo navegador)
//   grupoDesdeCrudo(crudo)    {texto, tablas} → Grupo (puro)
//
// La grilla tiene una fila por período y una columna por día; cada celda
// dice "ASIGNATURA(L )" y "aula X". La tabla de leyenda mapea el nombre
// abreviado a codasig, codhora, profesor y email.

import { diaIndex, minDesdeTexto, normalizar, periodoDesdeMin } from "./periodos.js";

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
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

/**
 * Tabla → matriz de textos, expandiendo rowspan/colspan.
 * @param {HTMLTableElement} tabla
 */
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

/**
 * Texto de la página con un espacio entre nodos. textContent los pega
 * ("4GS111Periodo") y el código de grupo deja de verse como palabra.
 * @param {Document} doc
 */
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

/** Clave para unir celda y leyenda: "BASE DE\nDATOS I" ≡ "BASE DE DATOS I". @param {string} s */
const clave = (s) => normalizar(s).replace(/[^A-Z0-9]/g, "");

/**
 * "ESTRUCT.DATOS I(L )\naula 4fis" → {nombre, tipo, aula}
 * @param {string} texto
 */
export function leerCelda(texto) {
  const m = /\baula:?\s*(.+)/i.exec(texto);
  const aula = m ? m[1].split("\n")[0].trim() : "";
  const antes = (m ? texto.slice(0, m.index) : texto).replace(/\n/g, " ");
  let tipo = "C";
  if (/\(\s*C\s*\+\s*L\s*\)/i.test(antes)) tipo = "CL";
  else if (/\(\s*L\s*\)/i.test(antes)) tipo = "L";
  const nombre = antes.replace(/\([^)]*\)\s*$/, "").trim();
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
    .filter((f) => /^\d+$/.test(f[cCodhora]?.trim() ?? ""))
    .map((f) => ({
      codasig: f[cCodasig].trim(),
      codhora: Number(f[cCodhora]),
      asignatura: f[cAsig].replace(/\s+/g, " ").trim(),
      profesor: (f[cProf] ?? "").replace(/\s+/g, " ").trim(),
      email: (f[cEmail] ?? "").trim(),
      bloques: [],
    }));
}

/**
 * @param {string[][]} t
 * @param {Materia[]} materias se les agregan los bloques
 */
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

  /** Última racha abierta por día: [materia, bloque] */
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
  const grupo = /\b(\d[A-Z]{1,4}\d{3})\b/.exec(texto)?.[1]
    ?? `SIN-CODIGO-${Math.min(...materias.map((m) => m.codhora))}`;
  const per = /\b(I{1,3})\s*-\s*(\d{4})\b/.exec(texto);
  const periodo = per
    ? `${per[1]}-${per[2]}`
    : [/PERIODO:\s*(I{1,3})\b/.exec(texto)?.[1], /ANO:\s*(\d{4})/.exec(texto)?.[1]].filter(Boolean).join("-");
  const sede = RE_SEDE.exec(texto)?.[1];

  return { grupo, periodo, ...(sede ? { sede } : {}), materias };
}

/**
 * Valida un JSON cargado por el usuario (un grupo o una lista).
 * @param {unknown} datos
 * @returns {Grupo[]}
 */
export function gruposDesdeJson(datos) {
  const lista = Array.isArray(datos) ? datos : [datos];
  for (const g of lista) {
    if (!g || typeof g.grupo !== "string" || !Array.isArray(g.materias)) {
      throw new Error("El JSON no tiene el formato de grupo esperado.");
    }
  }
  return lista;
}

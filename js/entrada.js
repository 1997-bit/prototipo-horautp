// @ts-check
// "Horario del Grupo" del portal → Grupo. DOM → Crudo → Grupo (puro).

import { porHora } from "./modelo.js";
import { DIAS, clave, diaIndex, limpio, normalizar, rangoDesdeTexto } from "./periodos.js";

/**
 * @typedef {import("./modelo.js").Grupo} Grupo
 * @typedef {import("./modelo.js").Materia} Materia
 * @typedef {{texto: string, tablas: string[][][]}} Crudo
 */

// ---------- DOM (navegador) ----------

// Separa las clases de una celda (un <p> por clase: subgrupos, otra materia).
const SEPARADOR = "¶";

/** Cloudflare: el primer byte es la clave XOR del resto. @param {string} hex */
function cfemail(hex) {
  const k = parseInt(hex.slice(0, 2), 16);
  let s = "";
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return s;
}

/** @param {Element} celda */
function textoCelda(celda) {
  const c = /** @type {Element} */ (celda.cloneNode(true));
  for (const el of c.querySelectorAll("[data-cfemail]")) {
    el.textContent = cfemail(el.getAttribute("data-cfemail") ?? "");
  }
  for (const br of c.querySelectorAll("br")) br.replaceWith("\n");
  for (const p of [...c.querySelectorAll("p")].slice(1)) p.before(`\n${SEPARADOR}\n`);
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
function crudoDesdeDocumento(doc) {
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

// "SEDE: PANAMÁ" (PDF), "SEDE PANAMÁ" o "CENTRO REGIONAL DE COCLÉ" (portal),
// "VERAGUAS - 4GS111" (Horario del Grupo)
const SEDES = ["BOCAS DEL TORO", "PANAMA OESTE", "PANAMA", "AZUERO", "CHIRIQUI", "COCLE", "COLON", "VERAGUAS"];
const RE_SEDE = new RegExp(`(?:\\bSEDE:?\\s+|CENTRO REGIONAL DE\\s+)(${SEDES.join("|")})\\b`
  + `|\\b(${SEDES.join("|")})\\b(?=\\s*(?:CARRERA|-\\s*\\d{1,2}[A-Z]))`);
// 4GS111, 11D234, 1EG1010, V1R122, VAA331. "GRUPO:" primero: antes van los botones de otros grupos.
// Sin normalizar: el portal distingue 6IN141 de 6in141.
const RE_GRUPO_ROTULO = /GRUPO:\s*([A-Z0-9]{1,4}\d{3,4})\b/i;
const RE_GRUPO = /\b([A-Z]?\d{1,2}[A-Z]{1,4}\d{3,4}|[A-Z]{3}\d{3})\b/i;
const RE_PERIODO = /\b(I{1,3})\s*-\s*(\d{4})\b/;
const RE_PERIODO_ROTULO = /PERIODO:\s*(I{1,3})\b/;
const RE_ANO = /ANO:\s*(\d{4})/;
const RE_AULA = /\baula:?\s*(.+)/i;
const RE_CL = /\(\s*C\s*\+\s*L\s*\)/i;
const RE_L = /\(\s*L\s*\)/i;
const RE_PARENTESIS_FINAL = /\([^)]*\)\s*$/;
const RE_SUBGRUPO = /\(\s*([A-F])\s*\)\s*$/i;
const RE_SALTOS = /\n/g;
const RE_ENTERO = /^\d+$/;
const RE_ESPACIO = /\s/g;

/**
 * "ESTRUCT.DATOS I(L )\naula 4fis" → {nombre, tipo, aula}
 * "MÉTODOS NUMÉRIC(B )\naula 1-311" → {…, sub: "B"}
 * @param {string} texto
 * @returns {{nombre: string, tipo: string, aula: string, sub?: string}}
 */
export function leerCelda(texto) {
  const m = RE_AULA.exec(texto);
  const aula = m ? m[1].split("\n")[0].trim() : "";
  const antes = (m ? texto.slice(0, m.index) : texto).replace(RE_SALTOS, " ");
  let tipo = "C";
  if (RE_CL.test(antes)) tipo = "CL";
  else if (RE_L.test(antes)) tipo = "L";
  const sub = tipo === "C" ? RE_SUBGRUPO.exec(antes)?.[1].toUpperCase() : undefined;
  const nombre = antes.replace(RE_PARENTESIS_FINAL, "").trim();
  return sub ? { nombre, tipo, aula, sub } : { nombre, tipo, aula };
}

/**
 * Una celda puede traer varias clases: separadas por SEPARADOR (DOM) o,
 * en texto pegado, una tras otra después de cada "aula …".
 * @param {string} texto
 */
export function leerCeldas(texto) {
  /** @type {string[]} */
  const partes = [];
  for (const trozo of texto.split(SEPARADOR)) {
    let actual = [];
    for (const linea of trozo.split("\n").map((l) => l.trim()).filter(Boolean)) {
      actual.push(linea);
      if (RE_AULA.test(linea)) {
        partes.push(actual.join("\n"));
        actual = [];
      }
    }
    if (actual.length) partes.push(actual.join("\n"));
  }
  return partes.map(leerCelda).filter((c) => c.nombre);
}

/** Fila con al menos LUNES a VIERNES. @param {string[]} f */
const esCabeceraDias = (f) => f.filter((c) => diaIndex(c) >= 0).length >= 5;

/** @param {string[][]} t */
const esGrilla = (t) => t.some(esCabeceraDias);

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
  // Sin nombres, la grilla no se puede unir a la leyenda.
  if (cAsig < 0) throw new Error("La tabla de asignaturas no tiene la columna ASIGNATURA.");
  return t.slice(iCab + 1)
    .filter((f) => RE_ENTERO.test(f[cCodhora]?.trim() ?? "") && limpio(f[cAsig] ?? ""))
    .map((f) => ({
      codasig: (f[cCodasig] ?? "").trim(),
      codhora: Number(f[cCodhora]),
      asignatura: limpio(f[cAsig]),
      profesor: limpio(f[cProf] ?? ""),
      // El portal a veces trae espacios o saltos dentro del correo.
      email: (f[cEmail] ?? "").replace(/\s+/g, ""),
      bloques: [],
    }));
}

/** @param {string[][]} t @param {Materia[]} materias */
function leerGrilla(t, materias) {
  const iCab = t.findIndex(esCabeceraDias);
  const colDia = t[iCab].map(diaIndex);
  const porClave = new Map(materias.map((m) => [clave(m.asignatura), m]));

  /** @param {string} nombre */
  const buscar = (nombre) => {
    const c = clave(nombre);
    // Vacío: startsWith("") uniría con cualquiera.
    const m = c && (porClave.get(c) ?? materias.find((x) => {
      const cx = clave(x.asignatura);
      return cx.startsWith(c) || c.startsWith(cx);
    }));
    if (!m) throw new Error(`"${nombre}" no aparece en la tabla de asignaturas`);
    return m;
  };

  // Bloque abierto por día, materia, tipo, aula y subgrupo: se alarga si la
  // fila siguiente empieza en el recreo (≤ 10 min) tras su fin.
  /** @type {Map<string, import("./modelo.js").Bloque>} */
  const abiertos = new Map();
  const filas = t.slice(iCab + 1)
    .flatMap((celdas) => {
      const r = rangoDesdeTexto(celdas[0] ?? "");
      return r ? [{ ini: r[0], fin: r[1], celdas }] : [];
    })
    .sort((a, b) => a.ini - b.ini);

  for (const { ini, fin, celdas } of filas) {
    celdas.forEach((txt, c) => {
      const d = colDia[c];
      if (d < 0 || !txt.trim()) return;
      for (const { nombre, tipo, aula, sub = "" } of leerCeldas(txt)) {
        const m = buscar(nombre);
        const llave = `${d}|${m.codhora}|${tipo}|${aula}|${sub}`;
        const a = abiertos.get(llave);
        if (a && ini >= a[2] && ini - a[2] <= 10) {
          a[2] = Math.max(a[2], fin);
          continue;
        }
        /** @type {import("./modelo.js").Bloque} */
        const b = sub ? [d, ini, fin, tipo, aula, sub] : [d, ini, fin, tipo, aula];
        m.bloques.push(b);
        abiertos.set(llave, b);
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
  for (const m of materias) m.bloques.sort(porHora);

  const texto = normalizar(crudo.texto);
  const crudoLimpio = limpio(crudo.texto);
  const grupo = RE_GRUPO_ROTULO.exec(crudoLimpio)?.[1]
    ?? RE_GRUPO.exec(crudoLimpio)?.[1]
    ?? `SIN-CODIGO-${Math.min(...materias.map((m) => m.codhora))}`;
  const per = RE_PERIODO.exec(texto);
  const periodo = per
    ? `${per[1]}-${per[2]}`
    : [RE_PERIODO_ROTULO.exec(texto)?.[1], RE_ANO.exec(texto)?.[1]].filter(Boolean).join("-");
  const rs = RE_SEDE.exec(texto);
  const sede = rs?.[1] ?? rs?.[2];

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

  const bloques = [...datos.bloques].sort(porHora);
  for (let i = 1; i < bloques.length; i++) {
    const [d, ini] = bloques[i], [dp, , finPrevio] = bloques[i - 1];
    if (d === dp && ini < finPrevio) throw new Error(`Dos horas del ${DIAS[d].toLowerCase()} se pisan.`);
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

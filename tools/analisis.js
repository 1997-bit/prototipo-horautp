// @ts-check
// Exportación del scraper (utp_horarios_raw_*.json) → contenido de los horarios.
// Herramienta interna: no la usa la app ni la cachea el service worker.

import { codigo, grilla, nombrePropio, porDia } from "../js/calendario.js";
import { h } from "../js/dom.js";
import { sigla } from "../js/modelo.js";
import { DIAS, DIAS_CORTO, formatoHora, limpio, minDesdeTexto, normalizar } from "../js/periodos.js";

/**
 * @typedef {{codasig: string, codhora: string, asignatura: string, profesor: string,
 *            email: string, sedeOtra: string, color: string}} Materia
 * @typedef {{dia: number, ini: number, fin: number, franja: string, nombre: string,
 *            tipo: "T"|"L"|"S", sub: string, aula: string, m: Materia | null}} Sesion
 * @typedef {{codigo: string, facultad: string, carrera: string, sede: string, nivel: string,
 *            turno: string, materias: Materia[], sesiones: Sesion[]}} Grupo
 */

const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
const esc = (/** @type {unknown} */ s) => String(s ?? "").replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const clave = (/** @type {string} */ s) => normalizar(s).replace(/[^A-Z0-9]/g, "");
const espera = () => new Promise((r) => setTimeout(r));

const RE_SUFIJO = /\(\s*(L|A|B|C|C\s*\+\s*L)\s*\)\s*$/i;
const RE_COLOR = /background-color:\s*(#[0-9a-f]{3,6})/i;
const MAX_FILAS = 150;

/** @type {Grupo[]} */
let grupos = [];
let sinHorario = 0;

// ---------- lectura ----------

/** @param {File} archivo */
async function leerArchivo(archivo) {
  let flujo = archivo.stream();
  if (archivo.name.endsWith(".gz")) flujo = flujo.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(flujo).text());
}

/** @param {string} hex Cloudflare: primer byte es la clave XOR. */
function cfemail(hex) {
  const k = parseInt(hex.slice(0, 2), 16);
  let s = "";
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return s;
}

/** @param {Element | null} el */
const colorDe = (el) => (RE_COLOR.exec(el?.getAttribute("style") ?? "")?.[1] ?? "").toUpperCase();

const parser = new DOMParser();

/** @param {any} g @returns {Grupo | null} */
function leerGrupo(g) {
  const html = /** @type {string} */ (g.html);
  if (!html.includes("cphContenido_gvHorario") || !html.includes("cphContenido_Gvdetalle")) return null;
  // Solo desde los rótulos: el resto de la página son menús y botones.
  const i = html.indexOf("cphContenido_LblFacultad");
  const doc = parser.parseFromString(html.slice(Math.max(0, html.lastIndexOf("<", i))), "text/html");
  const rotulo = (/** @type {string} */ id) => limpio(doc.getElementById(`cphContenido_${id}`)?.textContent ?? "");

  /** @type {Materia[]} */
  const materias = [];
  for (const tr of /** @type {HTMLTableElement} */ (doc.getElementById("cphContenido_Gvdetalle")).rows) {
    const td = tr.cells;
    if (td.length < 5 || td[0].tagName === "TH") continue;
    const cf = td[4].querySelector("[data-cfemail]")?.getAttribute("data-cfemail");
    materias.push({
      asignatura: limpio(td[0].textContent ?? ""),
      color: colorDe(td[0].querySelector("[style]")),
      codasig: limpio(td[1].textContent ?? ""),
      codhora: limpio(td[2].textContent ?? ""),
      profesor: limpio(td[3].textContent ?? ""),
      email: cf ? cfemail(cf) : limpio(td[4].textContent ?? "").includes("@") ? limpio(td[4].textContent ?? "") : "",
      sedeOtra: limpio(td[5]?.textContent ?? ""),
    });
  }
  const porClave = new Map(materias.map((m) => [clave(m.asignatura), m]));
  /** @param {string} nombre @param {string} color */
  const buscar = (nombre, color) => {
    const c = clave(nombre);
    return porClave.get(c)
      ?? materias.find((m) => { const x = clave(m.asignatura); return x.startsWith(c) || c.startsWith(x); })
      ?? materias.find((m) => m.color === color)
      ?? null;
  };

  /** @type {Sesion[]} */
  const sesiones = [];
  for (const tr of /** @type {HTMLTableElement} */ (doc.getElementById("cphContenido_gvHorario")).rows) {
    const td = tr.cells;
    if (td[0]?.tagName === "TH") continue;
    const franja = limpio(td[0]?.textContent ?? "");
    const ini = minDesdeTexto(franja);
    const fin = minDesdeTexto(franja.split("-")[1] ?? "");
    if (Number.isNaN(ini)) continue;
    for (let c = 1; c < td.length && c <= 7; c++) {
      for (const p of td[c].querySelectorAll("p")) {
        const copia = /** @type {Element} */ (p.cloneNode(true));
        const fuerte = copia.querySelector("strong");
        const aula = limpio(fuerte?.textContent ?? "").replace(/^aula:?\s*/i, "");
        fuerte?.remove();
        let nombre = limpio(copia.textContent ?? "");
        const suf = RE_SUFIJO.exec(nombre);
        let tipo = /** @type {Sesion["tipo"]} */ ("T"), sub = "";
        if (suf) {
          nombre = nombre.slice(0, suf.index).trim();
          const s = suf[1].toUpperCase().replace(/\s/g, "");
          if (s === "L" || s === "C+L") tipo = "L";
          else { tipo = "S"; sub = s; }
        }
        sesiones.push({ dia: c - 1, ini, fin, franja, nombre, tipo, sub, aula, m: buscar(nombre, colorDe(p)) });
      }
    }
  }

  return {
    codigo: g.boton,
    facultad: g.facultad?.text ?? "",
    carrera: g.carrera?.text ?? rotulo("LblCarrera"),
    sede: g.sede?.text ?? rotulo("LblSede"),
    nivel: rotulo("LblNivel"),
    turno: rotulo("LblTurno"),
    materias,
    sesiones,
  };
}

/** @param {File} archivo */
async function cargar(archivo) {
  const texto = $("#estado-texto"), barra = /** @type {HTMLProgressElement} */ ($("#estado-barra"));
  $("#informe").hidden = true;
  $("#estado").hidden = false;
  texto.textContent = `Leyendo ${archivo.name}…`;
  barra.hidden = false;
  barra.removeAttribute("value");
  await espera();

  let datos;
  try {
    datos = await leerArchivo(archivo);
  } catch (e) {
    texto.textContent = `No se pudo leer: ${/** @type {Error} */ (e).message}`;
    barra.hidden = true;
    return;
  }
  const crudos = Array.isArray(datos?.grupos) ? datos.grupos : [];
  grupos = [];
  sinHorario = 0;
  for (let i = 0; i < crudos.length; i++) {
    const g = leerGrupo(crudos[i]);
    if (g) grupos.push(g); else sinHorario++;
    if (i % 20 === 0) {
      barra.value = i / crudos.length;
      texto.textContent = `Procesando grupos ${i} / ${crudos.length}`;
      await espera();
    }
  }
  datos = null;

  llenarFiltros();
  $("#estado").hidden = true;
  $("#informe").hidden = false;
  $("#csv-sesiones").hidden = $("#csv-materias").hidden = false;
  pintar();
}

// ---------- filtros ----------

const FILTROS = /** @type {const} */ ([["#f-sede", "sede", "Todas las sedes"], ["#f-facultad", "facultad", "Todas las facultades"],
  ["#f-turno", "turno", "Diurno y nocturno"], ["#f-nivel", "nivel", "Todos los años"]]);

function llenarFiltros() {
  for (const [sel, campo, todos] of FILTROS) {
    const conteo = contar(grupos.map((g) => g[campo]));
    /** @type {HTMLSelectElement} */ ($(sel)).innerHTML = `<option value="">${todos}</option>`
      + [...conteo].sort((a, b) => b[1] - a[1])
        .map(([v, n]) => `<option value="${esc(v)}">${esc(v || "—")} (${n})</option>`).join("");
  }
}

function filtrados() {
  const f = FILTROS.map(([sel, campo]) => [campo, /** @type {HTMLSelectElement} */ ($(sel)).value]).filter(([, v]) => v);
  return grupos.filter((g) => f.every(([c, v]) => g[/** @type {"sede"} */ (c)] === v));
}

// ---------- análisis ----------

/** @template T @param {Iterable<T>} xs */
function contar(xs) {
  /** @type {Map<T, number>} */
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** @param {Sesion} s */
const ranura = (s) => `${s.dia}|${s.ini}`;
/** @param {Materia} m */
const idSeccion = (m) => `${m.codasig}|${m.codhora}`;

/**
 * Sesiones de una sección sin contar dos veces los subgrupos a la misma hora.
 * Un estudiante va a teoría + un subgrupo: se toma el primero.
 * @param {Sesion[]} ss
 */
function sesionesAlumno(ss) {
  const primerSub = ss.find((s) => s.tipo === "S")?.sub;
  const vistas = new Set();
  return ss.filter((s) => {
    if (s.tipo === "S" && s.sub !== primerSub) return false;
    const k = ranura(s);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/** Une sesiones contiguas (≤10 min entre una y otra). @param {Sesion[]} ss */
function bloquesDe(ss) {
  const orden = [...ss].sort((a, b) => a.dia - b.dia || a.ini - b.ini);
  /** @type {Sesion[][]} */
  const out = [];
  for (const s of orden) {
    const u = out.at(-1), p = u?.at(-1);
    if (u && p && p.dia === s.dia && p.tipo === s.tipo && s.ini - p.fin <= 10) u.push(s);
    else out.push([s]);
  }
  return out;
}

/** @param {Grupo[]} gs */
function analizar(gs) {
  /** @type {Map<string, {m: Materia, grupos: Grupo[], sesiones: Sesion[]}>} */
  const secciones = new Map();
  for (const g of gs) {
    const porMateria = new Map(g.materias.map((m) => [m, /** @type {Sesion[]} */ ([])]));
    for (const s of g.sesiones) if (s.m) porMateria.get(s.m)?.push(s);
    for (const [m, ss] of porMateria) {
      const id = idSeccion(m);
      const x = secciones.get(id);
      if (x) x.grupos.push(g);
      else secciones.set(id, { m, grupos: [g], sesiones: ss });
    }
  }
  return { gs, secciones };
}

// ---------- pintar ----------

/** @param {number} v @param {number} max */
const barra = (v, max) =>
  `<span style="display:block;height:.4rem;margin-top:.15rem;border-radius:0 4px 4px 0;background:var(--tenue);width:${max ? Math.max(1, (100 * v) / max) : 0}%"></span>`;

/**
 * Tabla de una dimensión con barra de magnitud.
 * @param {[string, number][]} filas @param {string} cab
 */
function tablaConteo(filas, cab) {
  const max = Math.max(1, ...filas.map(([, n]) => n));
  const total = filas.reduce((a, [, n]) => a + n, 0) || 1;
  return `<table><thead><tr><th>${esc(cab)}</th><th class="num">Cantidad</th><th style="width:40%"></th></tr></thead><tbody>${
    filas.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num" title="${((100 * n) / total).toFixed(1)} %">${n}</td><td>${barra(n, max)}</td></tr>`).join("")
  }</tbody></table>`;
}

/** @param {Map<number, number>} m @param {(k: number) => string} rotulo */
const filasOrdenadas = (m, rotulo) => /** @type {[string, number][]} */ ([...m].sort((a, b) => a[0] - b[0]).map(([k, n]) => [rotulo(k), n]));

/** @param {number} a @param {number} b */
const rango = (a, b) => `${formatoHora(a)}–${formatoHora(b)}`;

/** @param {Sesion[]} ss */
function horarioTexto(ss) {
  return bloquesDe(ss).map((b) => {
    const s = b[0], tipo = s.tipo === "L" ? " Lab" : s.tipo === "S" ? ` (${s.sub})` : "";
    return `${DIAS_CORTO[s.dia]} ${rango(s.ini, /** @type {Sesion} */ (b.at(-1)).fin)}${tipo}${s.aula ? ` · ${s.aula}` : ""}`;
  }).join("<br>");
}

/** @type {ReturnType<typeof analizar>} */
let actual;

function pintar() {
  actual = analizar(filtrados());
  pila.length = 0;
  $("#vista").hidden = true;
  $("#reporte").hidden = false;
  const { gs, secciones } = actual;
  const secs = [...secciones.values()];
  const busca = normalizar(/** @type {HTMLInputElement} */ ($("#f-buscar")).value);

  // Cifras
  const profes = new Set(secs.map((s) => s.m.profesor).filter(Boolean));
  const aulas = new Set(gs.flatMap((g) => g.sesiones.filter((s) => s.aula).map((s) => `${g.sede}|${s.aula}`)));
  const asignaturas = new Set(secs.map((s) => s.m.codasig));
  const periodos = secs.reduce((a, s) => a + sesionesAlumno(s.sesiones).length, 0);
  const sinSesiones = secs.filter((s) => !s.sesiones.length).length;
  const sinProfe = secs.filter((s) => !s.m.profesor).length;
  const sueltas = gs.reduce((a, g) => a + g.sesiones.filter((s) => !s.m).length, 0);
  const cifras = [
    [gs.length, "grupos"], [new Set(gs.map((g) => g.carrera)).size, "carreras"], [asignaturas.size, "asignaturas"],
    [secciones.size, "secciones"], [profes.size, "profesores"], [aulas.size, "aulas"], [periodos, "períodos/semana"],
    [sinSesiones, "secciones sin horario"], [sinProfe, "secciones sin profesor"], [sueltas, "sesiones sin materia"], [sinHorario, "grupos sin horario (archivo)"],
  ];
  $("#cifras").innerHTML = cifras.map(([n, t]) => `<li><b>${n}</b> ${t}</li>`).join("");

  pintarOcupacion(secs);

  // Tipos, bloques, días por sección
  const todas = secs.flatMap((s) => s.sesiones);
  const nombresTipo = { T: "Teoría", L: "Laboratorio", S: "Subgrupo (A/B/C)" };
  $("#tipos").innerHTML = tablaConteo([...contar(todas.map((s) => nombresTipo[s.tipo]))], "Tipo");
  const bloques = secs.flatMap((s) => bloquesDe(sesionesAlumno(s.sesiones)));
  $("#bloques").innerHTML = tablaConteo(filasOrdenadas(contar(bloques.map((b) => b.length)), (k) => `${k} seguido${k > 1 ? "s" : ""}`), "Bloque");
  $("#dias-seccion").innerHTML = tablaConteo(filasOrdenadas(
    contar(secs.filter((s) => s.sesiones.length).map((s) => new Set(s.sesiones.map((x) => x.dia)).size)), (k) => `${k} día${k > 1 ? "s" : ""}`), "Días");

  // Por grupo
  const libres = [], huecos = [];
  for (const g of gs) {
    const ss = g.materias.flatMap((m) => sesionesAlumno(g.sesiones.filter((s) => s.m === m)));
    const dias = new Set(ss.map((s) => s.dia));
    libres.push([0, 1, 2, 3, 4, 5].filter((d) => !dias.has(d)).length);
    for (const d of dias) {
      const del = ss.filter((s) => s.dia === d).sort((a, b) => a.ini - b.ini);
      let h = 0;
      for (let i = 1; i < del.length; i++) h += Math.max(0, del[i].ini - del[i - 1].fin - 10);
      huecos.push(Math.ceil(h / 60));
    }
  }
  $("#dias-libres").innerHTML = tablaConteo(filasOrdenadas(contar(libres), String), "Días libres");
  $("#huecos").innerHTML = tablaConteo(filasOrdenadas(contar(huecos), (k) => (k ? `hasta ${k} h` : "sin hueco")), "Hueco");
  $("#materias-grupo").innerHTML = tablaConteo(filasOrdenadas(contar(gs.map((g) => g.materias.length)), String), "Materias");

  pintarGrupos(gs, busca);
  pintarAsignaturas(secs, busca);
  pintarProfesores(secs, busca);
  pintarAulas(gs, busca);

  const compartidas = secs.filter((s) => s.grupos.length > 1).sort((a, b) => b.grupos.length - a.grupos.length);
  $("#compartidas").innerHTML = compartidas.length
    ? `<table><thead><tr><th>Sección</th><th>Asignatura</th><th>Profesor</th><th>Grupos</th></tr></thead><tbody>${
      compartidas.slice(0, MAX_FILAS).map((s) => `<tr><td class="codigo">${esc(s.m.codasig)}·${esc(s.m.codhora)}</td><td>${esc(s.m.asignatura)}</td><td>${esc(s.m.profesor)}</td><td>${s.grupos.map((g) => esc(g.codigo)).join(", ")}</td></tr>`).join("")
    }</tbody></table>`
    : `<p class="vacio">Ninguna</p>`;
}

/** Día × franja. Franjas fuera de la rejilla de la app, en rojo. @param {{m: Materia, sesiones: Sesion[]}[]} secs */
function pintarOcupacion(secs) {
  /** @type {Map<string, {ini: number, fin: number, n: number[]}>} */
  const filas = new Map();
  for (const s of secs) {
    for (const x of sesionesAlumno(s.sesiones)) {
      const f = filas.get(x.franja) ?? { ini: x.ini, fin: x.fin, n: [0, 0, 0, 0, 0, 0, 0] };
      f.n[x.dia]++;
      filas.set(x.franja, f);
    }
  }
  const orden = [...filas.values()].sort((a, b) => a.ini - b.ini || a.fin - b.fin);
  const max = Math.max(1, ...orden.flatMap((f) => f.n));
  const usados = [0, 1, 2, 3, 4, 5, 6].filter((d) => orden.some((f) => f.n[d]));
  $("#ocupacion").innerHTML = `<table><thead><tr><th>Hora</th>${usados.map((d) => `<th>${DIAS_CORTO[d]}</th>`).join("")}</tr></thead><tbody>${
    orden.map((f) => {
      return `<tr style="height:auto"><th scope="row">${formatoHora(f.ini)}<span class="hasta">${formatoHora(f.fin)}</span></th>${
        usados.map((d) => {
          const v = f.n[d] / max;
          return `<td class="centro"${f.n[d] ? ` data-franja="${d}|${f.ini}"` : ""} style="cursor:${f.n[d] ? "pointer" : "default"};background:color-mix(in srgb, var(--texto) ${Math.round(v * 80)}%, transparent)${v > .45 ? ";color:var(--superficie)" : ""}">${f.n[d] || ""}</td>`;
        }).join("")
      }</tr>`;
    }).join("")
  }</tbody></table>`;
}

/** @param {Grupo[]} gs @param {string} busca */
function pintarGrupos(gs, busca) {
  const filas = gs.filter((g) => coincide(busca, g.codigo, g.carrera, ...g.materias.map((m) => m.asignatura)))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  $("#tabla-grupos").innerHTML = `<table><thead><tr><th>Grupo</th><th>Carrera</th><th>Sede</th><th>Año</th><th>Turno</th><th class="num">Materias</th><th class="num">Días</th></tr></thead><tbody>${
    filas.slice(0, MAX_FILAS).map((g) => `<tr data-grupo="${esc(g.codigo)}" style="cursor:pointer"><td class="codigo">${esc(g.codigo)}</td><td>${esc(g.carrera)}</td><td>${esc(g.sede)}</td><td>${esc(g.nivel)}</td><td>${esc(g.turno)}</td><td class="num">${g.materias.length}</td><td class="num">${new Set(g.sesiones.map((s) => s.dia)).size}</td></tr>`).join("")
  }</tbody></table>${pie(filas.length)}`;
}

/** @param {string} busca @param {...string} campos */
const coincide = (busca, ...campos) => !busca || campos.some((c) => normalizar(c).includes(busca));

/** @param {{m: Materia, grupos: Grupo[], sesiones: Sesion[]}[]} secs @param {string} busca */
function pintarAsignaturas(secs, busca) {
  /** @type {Map<string, {nombres: Map<string, number>, secs: typeof secs, sedes: Set<string>, profes: Set<string>, grupos: Set<string>}>} */
  const porAsig = new Map();
  for (const s of secs) {
    const a = porAsig.get(s.m.codasig) ?? { nombres: new Map(), secs: [], sedes: new Set(), profes: new Set(), grupos: new Set() };
    a.nombres.set(s.m.asignatura, (a.nombres.get(s.m.asignatura) ?? 0) + 1);
    a.secs.push(s);
    if (s.m.profesor) a.profes.add(s.m.profesor);
    for (const g of s.grupos) { a.sedes.add(g.sede); a.grupos.add(g.codigo); }
    porAsig.set(s.m.codasig, a);
  }
  const filas = [...porAsig]
    .map(([cod, a]) => ({ cod, nombre: [...a.nombres].sort((x, y) => y[1] - x[1])[0][0], ...a }))
    .filter((a) => coincide(busca, a.cod, ...a.nombres.keys()))
    .sort((a, b) => b.secs.length - a.secs.length);
  const max = Math.max(1, ...filas.map((a) => a.secs.length));
  $("#asignaturas").innerHTML = `<table><thead><tr><th>Cód.</th><th>Asignatura</th><th class="num">Secciones</th><th></th><th class="num">Grupos</th><th class="num">Profes</th><th class="num">Sedes</th><th class="num">Per./sem</th></tr></thead><tbody>${
    filas.slice(0, MAX_FILAS).map((a) => {
      const per = a.secs.map((s) => sesionesAlumno(s.sesiones).length).sort((x, y) => x - y);
      const med = per[Math.floor(per.length / 2)];
      return `<tr data-asig="${esc(a.cod)}" style="cursor:pointer"><td class="codigo">${esc(a.cod)}</td><td>${esc(a.nombre)}${a.nombres.size > 1 ? ` <small title="${esc([...a.nombres.keys()].join(" · "))}">+${a.nombres.size - 1} nombres</small>` : ""}</td><td class="num">${a.secs.length}</td><td style="width:15%">${barra(a.secs.length, max)}</td><td class="num">${a.grupos.size}</td><td class="num">${a.profes.size}</td><td class="num">${a.sedes.size}</td><td class="num">${med}</td></tr>`;
    }).join("")
  }</tbody></table>${pie(filas.length)}`;
}

/** @param {{m: Materia, grupos: Grupo[], sesiones: Sesion[]}[]} secs @param {string} busca */
function pintarProfesores(secs, busca) {
  /** @type {Map<string, {secs: typeof secs, asig: Set<string>, ranuras: Map<string, Set<string>>}>} */
  const porProf = new Map();
  for (const s of secs) {
    const nombre = s.m.profesor;
    if (!nombre) continue;
    const p = porProf.get(nombre) ?? { secs: [], asig: new Set(), ranuras: new Map() };
    p.secs.push(s);
    p.asig.add(s.m.codasig);
    for (const x of sesionesAlumno(s.sesiones)) {
      const k = `${s.grupos[0].sede}|${ranura(x)}`;
      p.ranuras.set(k, (p.ranuras.get(k) ?? new Set()).add(idSeccion(s.m)));
    }
    porProf.set(nombre, p);
  }
  const filas = [...porProf].filter(([n]) => coincide(busca, n)).sort((a, b) => b[1].ranuras.size - a[1].ranuras.size);
  const max = Math.max(1, ...filas.map(([, p]) => p.ranuras.size));
  $("#profesores").innerHTML = `<table><thead><tr><th>Profesor</th><th class="num">Secc.</th><th class="num">Per./sem</th><th></th><th class="num" title="Franjas con dos o más secciones a la vez">Simult.</th></tr></thead><tbody>${
    filas.slice(0, MAX_FILAS).map(([n, p]) => {
      const sim = [...p.ranuras.values()].filter((s) => s.size > 1).length;
      return `<tr data-prof="${esc(n)}" style="cursor:pointer"><td>${esc(n)}</td><td class="num">${p.secs.length}</td><td class="num">${p.ranuras.size}</td><td style="width:25%">${barra(p.ranuras.size, max)}</td><td class="num">${sim || ""}</td></tr>`;
    }).join("")
  }</tbody></table>${pie(filas.length)}`;
}

/** @param {Grupo[]} gs @param {string} busca */
function pintarAulas(gs, busca) {
  /** @type {Map<string, {sede: string, aula: string, ranuras: Map<string, Set<string>>}>} */
  const porAula = new Map();
  for (const g of gs) {
    for (const s of g.sesiones) {
      if (!s.aula || !s.m) continue;
      const k = `${g.sede}|${s.aula}`;
      const a = porAula.get(k) ?? { sede: g.sede, aula: s.aula, ranuras: new Map() };
      const r = ranura(s);
      a.ranuras.set(r, (a.ranuras.get(r) ?? new Set()).add(`${idSeccion(s.m)}|${s.sub}`));
      porAula.set(k, a);
    }
  }
  const filas = [...porAula.values()].filter((a) => coincide(busca, a.aula)).sort((a, b) => b.ranuras.size - a.ranuras.size);
  const max = Math.max(1, ...filas.map((a) => a.ranuras.size));
  $("#aulas").innerHTML = `<table><thead><tr><th>Aula</th><th>Sede</th><th class="num">Per./sem</th><th></th><th class="num" title="Franjas con dos o más secciones a la vez">Simult.</th></tr></thead><tbody>${
    filas.slice(0, MAX_FILAS).map((a) => {
      const sim = [...a.ranuras.values()].filter((s) => s.size > 1).length;
      return `<tr data-aula="${esc(`${a.sede}|${a.aula}`)}" style="cursor:pointer"><td class="codigo">${esc(a.aula)}</td><td>${esc(a.sede)}</td><td class="num">${a.ranuras.size}</td><td style="width:25%">${barra(a.ranuras.size, max)}</td><td class="num">${sim || ""}</td></tr>`;
    }).join("")
  }</tbody></table>${pie(filas.length)}`;
}

/** @param {number} n */
const pie = (n) => (n > MAX_FILAS ? `<p><small>${MAX_FILAS} de ${n}</small></p>` : n ? "" : `<p class="vacio">Sin resultados</p>`);

// ---------- vista (mismo formato que el paso Horario de la app) ----------

/** @typedef {{m: Materia, grupos: Grupo[], sesiones: Sesion[]}} Sec */
/** @typedef {import("../js/modelo.js").Seccion} Seccion */

/** @param {Sec} s */
const codigosGrupo = (s) => s.grupos.map((g) => g.codigo).join(", ");

/**
 * Sección del análisis → Seccion de la app, para reusar su calendario.
 * @param {Sec} s @param {Sesion[]} ss @param {number} id
 * @param {(p: Sesion, s: Sec) => string} rotulo Lo que va junto al tipo en cada clase.
 * @returns {Seccion}
 */
function aSeccion(s, ss, id, rotulo) {
  const bloques = bloquesDe(sesionesAlumno(ss)).map((b) => {
    const p = b[0];
    return /** @type {import("../js/modelo.js").Bloque} */ ([p.dia, p.ini, /** @type {Sesion} */ (b.at(-1)).fin, p.tipo === "L" ? "L" : "C", rotulo(p, s)]);
  });
  return {
    id, grupo: codigosGrupo(s), codasig: s.m.codasig, codhora: Number(s.m.codhora),
    asignatura: s.m.asignatura, profesor: s.m.profesor, email: s.m.email, bloques, masks: [], usos: [], dias: 0,
  };
}

/** @param {Seccion[]} secciones */
const tonos = (secciones) => {
  const cods = [...new Set(secciones.map((s) => s.codasig))];
  return new Map(cods.map((c, i) => [c, Math.round((i * 360) / cods.length)]));
};

/** @param {string} t */
/**
 * Tabla de materias de la app, solo lectura.
 * @param {Seccion[]} secciones @param {Map<string, number>} tono
 * @param {[string, string, (s: Seccion, i: number) => any][]} [extra] columnas al final
 */
function tablaMaterias(secciones, tono, extra = []) {
  return h("div", { class: "tabla" }, h("table", { class: "tabla-materias" },
    h("thead", {}, h("tr", {}, [["Asignatura"], ["Grupo", "c-grupo"], ["C.Hora", "c-hora"], ["Profesor", "c-profe"], ...extra.map(([t, c]) => [t, c])]
      .map(([t, c]) => h("th", { scope: "col", class: c }, t)))),
    h("tbody", {}, secciones.map((s, i) => h("tr", {},
      h("td", {}, h("span", { class: "punto", style: `--h:${tono.get(s.codasig)}`, "aria-hidden": "true" }), s.asignatura,
        h("small", { class: "sigla-leyenda", "aria-hidden": "true" }, ` ${sigla(s.asignatura)}`)),
      h("td", { class: "codigo" }, s.grupo.split(", ").map((g, j) => [j ? ", " : "", h("a", { href: "#", "data-grupo": g }, g)])),
      h("td", { class: "codigo" }, codigo(s) || "—"),
      h("td", {}, s.profesor ? h("a", { href: "#", "data-prof": s.profesor }, nombrePropio(s.profesor)) : "—"),
      extra.map(([, , f]) => h("td", {}, f(s, i))))))));
}

/** @type {(() => void)[]} */
const pila = [];
let scrollInforme = 0;

/**
 * @param {string} titulo @param {string[]} cifrasVista
 * @param {...any} tarjetas
 */
function mostrarVista(titulo, cifrasVista, ...tarjetas) {
  if ($("#vista").hidden) scrollInforme = scrollY;
  $("#reporte").hidden = true;
  $("#vista").hidden = false;
  $("#t-vista").textContent = titulo;
  $("#cifras-vista").innerHTML = cifrasVista.map((c) => `<li>${c}</li>`).join("");
  $("#contenido-opciones").replaceChildren(...tarjetas.flat().filter(Boolean));
  scrollTo(0, 0);
  $("#t-vista").focus();
}

/** @param {() => void} pintarVista */
function ir(pintarVista) {
  pila.push(pintarVista);
  pintarVista();
}

function volver() {
  pila.pop();
  const previa = pila.at(-1);
  if (previa) { previa(); return; }
  $("#vista").hidden = true;
  $("#reporte").hidden = false;
  scrollTo(0, scrollInforme);
}

/**
 * Calendario + tabla, como una opción de la app.
 * @param {string} titulo @param {Sec[]} secs @param {(s: Sec) => Sesion[]} sesionesDe
 * @param {(p: Sesion, s: Sec) => string} rotulo
 */
function vistaHorario(titulo, secs, sesionesDe, rotulo) {
  const secciones = secs.map((s, i) => aSeccion(s, sesionesDe(s), i, rotulo));
  const tono = tonos(secciones);
  const dias = new Set(secciones.flatMap((s) => s.bloques.map((b) => b[0])));
  const periodos = secs.reduce((a, s) => a + sesionesAlumno(sesionesDe(s)).length, 0);
  mostrarVista(titulo, [`<b>${secs.length}</b> secciones`, `<b>${periodos}</b> períodos/semana`, `<b>${dias.size}</b> días`],
    h("section", { class: "tarjeta" }, grilla(secciones, tono), porDia(secciones, tono)),
    h("div", { class: "tarjeta materias-opcion" }, tablaMaterias(secciones, tono)));
}

/** @param {string} codigoGrupo */
function verGrupo(codigoGrupo) {
  const g = grupos.find((x) => x.codigo === codigoGrupo);
  if (!g) return;
  /** @type {Sec[]} */
  const secs = g.materias.map((m) => ({ m, grupos: [g], sesiones: g.sesiones.filter((s) => s.m === m) }));
  ir(() => vistaHorario(`${g.codigo} · ${g.carrera}`, secs, (s) => s.sesiones, (p) => [p.aula, p.sub && `subgrupo ${p.sub}`].filter(Boolean).join(" · ")));
}

/** @param {string} prof */
function verProfesor(prof) {
  const secs = [...actual.secciones.values()].filter((s) => s.m.profesor === prof);
  ir(() => vistaHorario(nombrePropio(prof), secs, (s) => s.sesiones, (p, s) => [p.aula, codigosGrupo(s)].filter(Boolean).join(" · ")));
}

/** Qué se da en el salón a cada hora. @param {string} sede @param {string} aula */
function verAula(sede, aula) {
  const secs = [...actual.secciones.values()].filter((s) => s.grupos[0].sede === sede && s.sesiones.some((x) => x.aula === aula));
  ir(() => vistaHorario(`${aula} · ${sede}`, secs, (s) => s.sesiones.filter((x) => x.aula === aula),
    (p, s) => [codigosGrupo(s), p.sub && `subgrupo ${p.sub}`].filter(Boolean).join(" · ")));
}

/** Secciones de una asignatura: se pisan, así que va en tabla con su horario. @param {string} codasig */
function verAsignatura(codasig) {
  const secs = [...actual.secciones.values()].filter((s) => s.m.codasig === codasig);
  const secciones = secs.map((s, i) => aSeccion(s, s.sesiones, i, (p) => p.aula));
  const tono = tonos(secciones);
  ir(() => mostrarVista(`${secs[0]?.m.asignatura ?? codasig} · ${codasig}`, [`<b>${secs.length}</b> secciones`],
    h("div", { class: "tarjeta materias-opcion" }, tablaMaterias(secciones, tono, [["Horario", "", (_, i) => {
      const t = h("span", {});
      t.innerHTML = horarioTexto(secs[i].sesiones) || "—";
      return t;
    }]]))));
}

/** Lo que se está dando en un día y franja. @param {number} dia @param {number} ini */
function verFranja(dia, ini) {
  /** @type {{s: Sec, p: Sesion}[]} */
  const clases = [];
  for (const s of actual.secciones.values()) {
    for (const p of s.sesiones) if (p.dia === dia && p.ini === ini) clases.push({ s, p });
  }
  clases.sort((a, b) => a.p.aula.localeCompare(b.p.aula, "es", { numeric: true }));
  const fin = clases[0]?.p.fin ?? ini;
  const secciones = clases.map(({ s, p }, i) => aSeccion(s, [p], i, () => ""));
  const tono = tonos(secciones);
  ir(() => mostrarVista(`${DIAS[dia]} ${rango(ini, fin)}`, [`<b>${clases.length}</b> clases`],
    h("div", { class: "tarjeta materias-opcion" }, tablaMaterias(secciones, tono, [
      ["Aula", "c-grupo", (_, i) => {
        const { s, p } = clases[i];
        return p.aula ? h("a", { href: "#", "data-aula": `${s.grupos[0].sede}|${p.aula}` }, p.aula) : "—";
      }],
      ["Sede", "c-grupo", (_, i) => clases[i].s.grupos[0].sede],
    ]))));
}

document.addEventListener("click", (e) => {
  const el = /** @type {HTMLElement} */ (e.target).closest?.("[data-grupo], [data-asig], [data-prof], [data-aula], [data-franja]");
  if (!el || !actual) return;
  e.preventDefault();
  const { grupo, asig, prof, aula, franja } = /** @type {HTMLElement} */ (el).dataset;
  if (grupo) verGrupo(grupo);
  else if (asig) verAsignatura(asig);
  else if (prof) verProfesor(prof);
  else if (aula) { const [sede, nombre] = aula.split("|"); verAula(sede, nombre); }
  else if (franja) { const [d, ini] = franja.split("|").map(Number); verFranja(d, ini); }
});
$("#volver").addEventListener("click", volver);

// ---------- CSV ----------

/** @param {string} nombre @param {unknown[][]} filas */
function descargarCsv(nombre, filas) {
  const csv = filas.map((f) => f.map((v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv" }));
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** @param {number} min */
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

$("#csv-sesiones").addEventListener("click", () => descargarCsv("sesiones.csv", [
  ["grupo", "facultad", "carrera", "sede", "nivel", "turno", "codasig", "codhora", "asignatura", "profesor", "dia", "inicio", "fin", "tipo", "subgrupo", "aula"],
  ...filtrados().flatMap((g) => g.sesiones.map((s) => [g.codigo, g.facultad, g.carrera, g.sede, g.nivel, g.turno,
    s.m?.codasig, s.m?.codhora, s.m?.asignatura ?? s.nombre, s.m?.profesor, DIAS_CORTO[s.dia], hhmm(s.ini), hhmm(s.fin), s.tipo, s.sub, s.aula])),
]));
$("#csv-materias").addEventListener("click", () => descargarCsv("materias.csv", [
  ["grupo", "facultad", "carrera", "sede", "nivel", "turno", "codasig", "codhora", "asignatura", "profesor", "email", "sede_otra"],
  ...filtrados().flatMap((g) => g.materias.map((m) => [g.codigo, g.facultad, g.carrera, g.sede, g.nivel, g.turno,
    m.codasig, m.codhora, m.asignatura, m.profesor, m.email, m.sedeOtra])),
]));

// ---------- eventos ----------

$("#archivo").addEventListener("change", (e) => {
  const f = /** @type {HTMLInputElement} */ (e.target).files?.[0];
  if (f) cargar(f);
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files[0];
  if (f) cargar(f);
});
for (const [sel] of FILTROS) $(sel).addEventListener("change", pintar);
let temporizador = 0;
$("#f-buscar").addEventListener("input", () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(pintar, 200);
});

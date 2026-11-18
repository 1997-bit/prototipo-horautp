// @ts-check
// Pantallas. Cada render reconstruye el contenido de su sección; con
// decenas de elementos no hace falta nada más fino.

import { gruposDesdeJson, grupoDesdeHtml } from "./entrada.js";
import { aCsv, aIcs } from "./exportar.js";
import { construirSecciones, listarMaterias, nombreTipo } from "./modelo.js";
import { DIAS, DIAS_CORTO, rangoPeriodo } from "./periodos.js";
import { estadoSeccion } from "./preferencias.js";
import { K_POR_DEFECTO, resolver } from "./solver.js";
import { guardar } from "./estado.js";

/**
 * @typedef {import("./estado.js").Estado} Estado
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./modelo.js").Grupo} Grupo
 * @typedef {import("./solver.js").Resultado} Resultado
 * @typedef {{estado: Estado, secciones: Seccion[], resultado: Resultado | null, opcion: number}} App
 */

// ---------- helpers ----------

/**
 * Crea un elemento. Props "on*" son eventos; las que existen como propiedad
 * (value, checked…) se asignan después de agregar los hijos, para que
 * <select value> funcione.
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...any} hijos
 */
export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  el.append(...hijos.flat(Infinity).filter((x) => x != null && x !== false));
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== "list") /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  return el;
}

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} id @param {...any} hijos */
const llenar = (id, ...hijos) => $(id).replaceChildren(...hijos.flat(Infinity).filter((x) => x != null && x !== false));

/** @param {App} app */
function cambio(app) {
  app.secciones = construirSecciones(app.estado.grupos);
  app.resultado = null;
  app.opcion = 0;
  guardar(app.estado);
}

/** @param {string} nombre @param {string} contenido @param {string} tipo */
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = h("a", { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 1. Datos ----------

/** @param {App} app @param {Grupo[]} nuevos */
function agregarGrupos(app, nuevos) {
  const codigos = new Set(nuevos.map((g) => g.grupo));
  app.estado.grupos = [...app.estado.grupos.filter((g) => !codigos.has(g.grupo)), ...nuevos]
    .sort((a, b) => a.grupo.localeCompare(b.grupo));
  cambio(app);
  mensaje(`Cargado: ${nuevos.map((g) => `${g.grupo} (${g.materias.length} materias)`).join(", ")}.`);
  renderDatos(app);
}

/** @param {string} texto @param {boolean} [error] */
function mensaje(texto, error = false) {
  const p = $("msg-datos");
  p.textContent = texto;
  p.className = error ? "error" : "ok";
}

/** @param {App} app */
export function iniciarDatos(app) {
  const pegar = /** @type {HTMLTextAreaElement} */ ($("pegar"));
  pegar.addEventListener("paste", (e) => {
    e.preventDefault();
    const html = e.clipboardData?.getData("text/html") ?? "";
    const texto = e.clipboardData?.getData("text/plain") ?? "";
    try {
      if (html) agregarGrupos(app, [grupoDesdeHtml(html)]);
      else if (/^\s*[[{]/.test(texto)) agregarGrupos(app, gruposDesdeJson(JSON.parse(texto)));
      else throw new Error("Lo pegado no trae la tabla. Copia desde la página del portal, no desde el PDF.");
    } catch (err) {
      mensaje(/** @type {Error} */ (err).message, true);
    }
  });

  const archivos = /** @type {HTMLInputElement} */ ($("archivos"));
  archivos.addEventListener("change", async () => {
    try {
      const grupos = [];
      for (const f of archivos.files ?? []) {
        const texto = await f.text();
        grupos.push(...(f.name.endsWith(".json") ? gruposDesdeJson(JSON.parse(texto)) : [grupoDesdeHtml(texto)]));
      }
      if (grupos.length) agregarGrupos(app, grupos);
    } catch (err) {
      mensaje(/** @type {Error} */ (err).message, true);
    }
    archivos.value = "";
  });

  $("ejemplo").addEventListener("click", async () => {
    try {
      const r = await fetch("data/ejemplo.json");
      agregarGrupos(app, gruposDesdeJson(await r.json()));
    } catch {
      mensaje("No se pudo cargar el ejemplo.", true);
    }
  });
}

/** @param {App} app */
export function renderDatos(app) {
  const { grupos } = app.estado;
  llenar("lista-grupos", grupos.length
    ? grupos.map((g) => h("li", {},
      h("span", {}, h("b", {}, g.grupo), ` · ${[g.sede, g.periodo].filter(Boolean).join(" · ")} · ${g.materias.length} materias`),
      h("button", {
        type: "button", class: "secundario chico", "aria-label": `Quitar ${g.grupo}`,
        onclick: () => {
          app.estado.grupos = grupos.filter((x) => x !== g);
          cambio(app);
          renderDatos(app);
        },
      }, "Quitar")))
    : h("li", { class: "vacio" }, "Todavía no hay grupos."));
}

// ---------- 2. Materias ----------

/** @param {App} app */
export function renderMaterias(app) {
  const materias = listarMaterias(app.secciones);
  if (!materias.length) {
    llenar("contenido-materias", h("p", {}, "Primero carga al menos un grupo en ", h("a", { href: "#datos" }, "Datos"), "."));
    return;
  }
  const disponibles = new Set(materias.map((m) => m.codasig));
  app.estado.requeridas = app.estado.requeridas.filter((c) => disponibles.has(c));
  const elegidas = new Set(app.estado.requeridas);

  /** @param {string[]} codigos */
  const elegir = (codigos) => {
    app.estado.requeridas = codigos;
    cambio(app);
    renderMaterias(app);
  };

  llenar("contenido-materias",
    h("p", { class: "fila" }, "Atajos: ",
      app.estado.grupos.map((g) => h("button", {
        type: "button", class: "secundario chico",
        onclick: () => elegir(g.materias.map((m) => m.codasig)),
      }, `Las de ${g.grupo}`)),
      h("button", { type: "button", class: "secundario chico", onclick: () => elegir([]) }, "Ninguna")),
    h("fieldset", {},
      h("legend", {}, `Elige las materias (${elegidas.size} de ${materias.length})`),
      materias.map((m) => h("label", { class: "opcion" },
        h("input", {
          type: "checkbox", checked: elegidas.has(m.codasig),
          onchange: (/** @type {Event} */ e) => {
            const marcado = /** @type {HTMLInputElement} */ (e.target).checked;
            elegir(marcado
              ? [...app.estado.requeridas, m.codasig]
              : app.estado.requeridas.filter((c) => c !== m.codasig));
          },
        }),
        h("span", {}, m.asignatura, " ", h("small", {}, `${m.codasig} · ${m.secciones} ${m.secciones === 1 ? "sección" : "secciones"}`))))));
}

// ---------- 3. Preferencias ----------

const FRANJAS = [
  ["", "Cualquiera"],
  ["manana", "Mañana (7:00–12:45)"],
  ["tarde", "Tarde (12:50–4:55)"],
  ["noche", "Noche (5:00 en adelante)"],
];

/** @param {App} app */
export function renderPreferencias(app) {
  const { requeridas, prefs } = app.estado;
  if (!requeridas.length) {
    llenar("contenido-preferencias", h("p", {}, "Primero elige tus ", h("a", { href: "#materias" }, "materias"), "."));
    return;
  }
  const actualizar = () => cambio(app);

  /** @param {string} codasig @param {"horario" | "profesor"} campo @param {string} valor */
  const setMateria = (codasig, campo, valor) => {
    const pm = { ...prefs.materias[codasig] };
    if (valor) pm[campo] = valor;
    else delete pm[campo];
    if (Object.keys(pm).length) prefs.materias[codasig] = pm;
    else delete prefs.materias[codasig];
    actualizar();
  };

  const materias = listarMaterias(app.secciones).filter((m) => requeridas.includes(m.codasig));
  llenar("contenido-preferencias",
    materias.map((m) => {
      const pm = prefs.materias[m.codasig] ?? {};
      const profesores = [...new Set(app.secciones.filter((s) => s.codasig === m.codasig).map((s) => s.profesor))].sort();
      return h("fieldset", { class: "pref" },
        h("legend", {}, m.asignatura),
        h("label", {}, "Franja ",
          h("select", {
            value: pm.horario ?? "",
            onchange: (/** @type {Event} */ e) => setMateria(m.codasig, "horario", /** @type {HTMLSelectElement} */ (e.target).value),
          }, FRANJAS.map(([v, t]) => h("option", { value: v }, t)))),
        h("label", {}, "Profesor ",
          h("select", {
            value: pm.profesor ?? "",
            onchange: (/** @type {Event} */ e) => setMateria(m.codasig, "profesor", /** @type {HTMLSelectElement} */ (e.target).value),
          }, h("option", { value: "" }, "Cualquiera"), profesores.map((p) => h("option", { value: p }, p)))));
    }),
    h("fieldset", { class: "pref" },
      h("legend", {}, "Generales"),
      h("label", {}, "Máximo de días por semana ",
        h("input", {
          type: "number", min: 1, max: 7, inputmode: "numeric", placeholder: "sin límite",
          value: prefs.diasMax ?? "",
          onchange: (/** @type {Event} */ e) => {
            const v = /** @type {HTMLInputElement} */ (e.target).valueAsNumber;
            prefs.diasMax = Number.isFinite(v) && v > 0 ? v : null;
            actualizar();
          },
        })),
      h("label", { class: "opcion" },
        h("input", {
          type: "checkbox", checked: prefs.evitarHuecos,
          onchange: (/** @type {Event} */ e) => { prefs.evitarHuecos = /** @type {HTMLInputElement} */ (e.target).checked; actualizar(); },
        }), "Evitar huecos entre clases"),
      h("label", { class: "opcion" },
        h("input", {
          type: "checkbox", checked: prefs.unGrupo,
          onchange: (/** @type {Event} */ e) => { prefs.unGrupo = /** @type {HTMLInputElement} */ (e.target).checked; actualizar(); },
        }), "Preferir pocos grupos distintos")));
}

// ---------- 4. Opciones ----------

/**
 * Tabla semanal: fila = período, celda con rowspan = n.
 * @param {Seccion[]} secciones @param {Map<string, number>} tono
 */
function grilla(secciones, tono) {
  let kMin = Infinity, kMax = -1, diasUsados = 0;
  /** @type {Map<string, [Seccion, import("./modelo.js").Bloque]>} */
  const inicio = new Map();
  const tapada = new Set();
  for (const s of secciones) {
    for (const b of s.bloques) {
      const [d, k, n] = b;
      kMin = Math.min(kMin, k);
      kMax = Math.max(kMax, k + n - 1);
      diasUsados |= 1 << d;
      inicio.set(`${d},${k}`, [s, b]);
      for (let i = 1; i < n; i++) tapada.add(`${d},${k + i}`);
    }
  }
  const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => d < 5 || diasUsados & (1 << d));
  const filas = [];
  for (let k = kMin; k <= kMax; k++) {
    filas.push(h("tr", {},
      h("th", { scope: "row" }, rangoPeriodo(k)),
      dias.map((d) => {
        if (tapada.has(`${d},${k}`)) return null;
        const c = inicio.get(`${d},${k}`);
        if (!c) return h("td", {});
        const [s, [, , n, tipo, aula]] = c;
        return h("td", { rowSpan: n, class: "clase", style: `--h:${tono.get(s.codasig)}` },
          h("b", {}, s.asignatura),
          h("small", {}, `${nombreTipo(tipo)} · ${aula}`));
      })));
  }
  return h("div", { class: "grilla" },
    h("table", {},
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Hora"), dias.map((d) => h("th", { scope: "col" }, DIAS_CORTO[d])))),
      h("tbody", {}, filas)));
}

/** Misma información por día, para pantallas angostas. @param {Seccion[]} secciones @param {Map<string, number>} tono */
function porDia(secciones, tono) {
  const dias = DIAS.map((nombre, d) => ({
    nombre,
    clases: secciones.flatMap((s) => s.bloques.filter((b) => b[0] === d).map((b) => ({ s, b })))
      .sort((x, y) => x.b[1] - y.b[1]),
  })).filter((x) => x.clases.length);
  return h("ol", { class: "por-dia" }, dias.map(({ nombre, clases }) => h("li", {},
    h("h3", {}, nombre),
    h("ul", {}, clases.map(({ s, b: [, k, n, tipo, aula] }) => h("li", { class: "clase", style: `--h:${tono.get(s.codasig)}` },
      h("span", { class: "hora" }, rangoPeriodo(k, n)),
      h("b", {}, s.asignatura),
      h("small", {}, `${nombreTipo(tipo)} · ${aula}`)))))));
}

/** @param {boolean | null} v */
const marca = (v) => (v === null ? h("span", { class: "nd", title: "sin preferencia" }, "–")
  : v ? h("span", { class: "si", title: "cumple" }, "✓") : h("span", { class: "no", title: "no cumple" }, "✗"));

/** @param {App} app */
export function renderOpciones(app) {
  const { requeridas, prefs } = app.estado;
  if (!requeridas.length) {
    llenar("contenido-opciones", h("p", {}, "Primero elige tus ", h("a", { href: "#materias" }, "materias"), "."));
    return;
  }
  app.resultado ??= resolver(app.secciones, requeridas, prefs);
  const r = app.resultado;
  if (r.estado === "FALTAN") {
    llenar("contenido-opciones", h("p", { class: "error" }, `No hay secciones cargadas para: ${r.faltan.join(", ")}.`));
    return;
  }
  if (r.estado === "SIN_SOLUCION") {
    llenar("contenido-opciones", h("p", { class: "error" },
      "No existe ninguna combinación sin choques con estas materias. Prueba cargar más grupos o quitar alguna materia."));
    return;
  }

  const total = r.opciones.length;
  app.opcion = Math.min(app.opcion, total - 1);
  const o = r.opciones[app.opcion];
  const tono = new Map(requeridas.map((c, i) => [c, Math.round((i * 360) / requeridas.length)]));
  const ir = (/** @type {number} */ i) => { app.opcion = i; renderOpciones(app); };
  const { detalle: dt } = o;

  llenar("contenido-opciones",
    h("div", { class: "navegar" },
      h("button", { type: "button", class: "secundario", disabled: app.opcion === 0, onclick: () => ir(app.opcion - 1), "aria-label": "Opción anterior" }, "‹"),
      h("p", { role: "status" },
        h("b", {}, `Opción ${app.opcion + 1} de ${total}${total === K_POR_DEFECTO ? "+" : ""}`),
        h("br", {}),
        h("small", {}, `Penalidad ${o.penalidad} · ${dt.dias} días · ${dt.huecos} huecos · ${dt.grupos} ${dt.grupos === 1 ? "grupo" : "grupos"}`)),
      h("button", { type: "button", class: "secundario", disabled: app.opcion === total - 1, onclick: () => ir(app.opcion + 1), "aria-label": "Opción siguiente" }, "›")),
    grilla(o.secciones, tono),
    porDia(o.secciones, tono),
    h("h3", {}, "Materias"),
    h("div", { class: "tabla" }, h("table", {},
      h("thead", {}, h("tr", {}, ["Asignatura", "Grupo", "Profesor", "Franja", "Prof.", "Codhora"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, o.secciones.map((s) => {
        const e = estadoSeccion(s, prefs.materias[s.codasig]);
        return h("tr", {},
          h("td", {}, s.asignatura),
          h("td", {}, s.grupo),
          h("td", {}, s.email ? h("a", { href: `mailto:${s.email}` }, s.profesor) : s.profesor),
          h("td", { class: "centro" }, marca(e.horario)),
          h("td", { class: "centro" }, marca(e.profesor)),
          h("td", {}, String(s.codhora)));
      })))));
}

// ---------- 5. Exportar ----------

/** @param {App} app */
export function renderExportar(app) {
  const o = app.resultado?.estado === "OK" ? app.resultado.opciones[app.opcion] : null;
  if (!o) {
    llenar("contenido-exportar", h("p", {}, "Primero elige una ", h("a", { href: "#opciones" }, "opción"), "."));
    return;
  }
  const e = app.estado;
  const hoy = new Date();
  e.inicio ||= `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  const fechaInicio = () => {
    const [y, m, d] = e.inicio.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const nombre = `horario-${[...new Set(o.secciones.map((s) => s.grupo))].join("-")}`;

  llenar("contenido-exportar",
    h("p", {}, `Opción ${app.opcion + 1}: ${o.secciones.map((s) => s.asignatura).join(", ")}.`),
    h("fieldset", { class: "pref" },
      h("legend", {}, "Calendario (.ics)"),
      h("label", {}, "Primer día de clases ",
        h("input", { type: "date", value: e.inicio, onchange: (/** @type {Event} */ ev) => { e.inicio = /** @type {HTMLInputElement} */ (ev.target).value; guardar(e); } })),
      h("label", {}, "Semanas ",
        h("input", {
          type: "number", min: 1, max: 30, value: e.semanas,
          onchange: (/** @type {Event} */ ev) => { e.semanas = /** @type {HTMLInputElement} */ (ev.target).valueAsNumber || 16; guardar(e); },
        })),
      h("button", {
        type: "button",
        onclick: () => descargar(`${nombre}.ics`, aIcs(o.secciones, { inicio: fechaInicio(), semanas: e.semanas }), "text/calendar"),
      }, "Descargar .ics")),
    h("p", { class: "fila" },
      h("button", { type: "button", class: "secundario", onclick: () => descargar(`${nombre}.csv`, aCsv(o.secciones), "text/csv") }, "Descargar CSV"),
      h("button", { type: "button", class: "secundario", onclick: () => { location.hash = "#opciones"; setTimeout(() => print(), 50); } }, "Imprimir")));
}

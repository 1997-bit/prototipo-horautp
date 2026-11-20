// @ts-check

import { celular, codigo, grilla, nombrePropio, porDia } from "./calendario.js";
import { h } from "./dom.js";
import { grupoManual, gruposDesdeJson, grupoDesdeHtml } from "./entrada.js";
import { construirSecciones, listarMaterias, sigla } from "./modelo.js";
import { DIAS, finMin, formatoHora, inicioMin } from "./periodos.js";
import { cumpleHorario, descartada } from "./preferencias.js";
import { K_POR_DEFECTO, MS_MAX, candidatas, reemplazos, resolver } from "./solver.js";
import { guardar } from "./estado.js";
import { quieto } from "./ajustes.js";

/**
 * @typedef {import("./estado.js").Estado} Estado
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./modelo.js").Grupo} Grupo
 * @typedef {import("./solver.js").Resultado} Resultado
 * @typedef {{estado: Estado, secciones: Seccion[], resultado: Resultado | null, opcion: number,
 *            pedido: number, enCurso: number, mostradas: Set<number> | null}} App
 */

// ---------- helpers ----------

export { h };

const RE_JSON = /^\s*[[{]/;
const RE_TABLA = /<table[\s>]/i;

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} id @param {...any} hijos */
const llenar = (id, ...hijos) => $(id).replaceChildren(...hijos.flat(Infinity).filter((x) => x != null && x !== false));

/**
 * @param {string} titulo @param {string} destino @param {string} accion
 */
const pendiente = (titulo, destino, accion) => h("div", { class: "tarjeta pendiente" },
  h("h3", {}, titulo), h("a", { href: destino, class: "boton" }, accion));

/**
 * Lo calculado ya no vale; el deshacer viejo pisaría lo nuevo.
 * @param {App} app
 */
export function descartar(app) {
  cortarWorker();
  cerrarAviso();
  app.secciones = construirSecciones(app.estado.grupos);
  app.resultado = null;
  app.opcion = 0;
  app.enCurso = 0;
}

/** Todo cambio de app.estado pasa por aquí. @param {App} app */
function cambio(app) {
  descartar(app);
  guardar(app.estado);
}

// ---------- Deshacer ----------

const ESPERA_DESHACER = 6000;
/** @type {(() => void) | null} */
let deshacer = null;
let plazo = 0;

function cerrarAviso() {
  clearTimeout(plazo);
  deshacer = null;
  $("tostada").replaceChildren();
}

function correrPlazo() {
  clearTimeout(plazo);
  plazo = setTimeout(cerrarAviso, ESPERA_DESHACER);
}

/**
 * @param {App} app @param {string} texto qué pasó, en pasado @param {() => void} hacer
 */
function conDeshacer(app, texto, hacer) {
  const antes = JSON.stringify(app.estado);
  hacer();
  deshacer = () => {
    Object.assign(app.estado, JSON.parse(antes));
    cambio(app);
    if (location.hash === "#opciones") recalcular(app);
    else PANTALLAS[location.hash.slice(1) || "materias"]?.(app);
  };
  llenar("tostada", h("div", {}, h("span", {}, texto),
    h("button", { type: "button", class: "chico", onclick: deshacerUltimo }, "Deshacer")));
  correrPlazo();
}

export const hayDeshacer = () => deshacer !== null;

export function deshacerUltimo() {
  const d = deshacer;
  cerrarAviso();
  d?.();
}

/**
 * Nombres de View Transition, numerados por bloque.
 * @param {boolean} poner
 */
function nombrarClases(poner) {
  /** @type {Map<string, number>} */
  const vistos = new Map();
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("#contenido-opciones .clase"))) {
    el.style.viewTransitionName = "";
    if (!poner || !el.closest(".actual") || !el.checkVisibility?.()) continue;
    const c = el.dataset.codhora ?? "";
    const i = vistos.get(c) ?? 0;
    vistos.set(c, i + 1);
    el.style.viewTransitionName = `clase-${c}-${i}`;
  }
  for (const [sel, nombre] of [[".carrusel", "carrusel"], [".materias-opcion", "materias-opcion"]]) {
    const el = /** @type {HTMLElement | null} */ (document.querySelector(`#contenido-opciones ${sel}`));
    if (el) el.style.viewTransitionName = poner ? nombre : "";
  }
}

// ---------- Búsqueda ----------
// Problemas chicos en el hilo principal; grandes, en el Worker.

const UMBRAL = 1e6;

/** @type {Worker | null} */
let worker = null;
let trabajando = false;

function cortarWorker() {
  if (!trabajando) return;
  worker?.terminate();
  worker = null;
  trabajando = false;
}

/** @param {App} app */
const tamano = (app) => [...candidatas(app.secciones, app.estado.requeridas, app.estado.prefs).values()]
  .reduce((t, l) => t * l.length, 1);

/**
 * Con `animar`, cada clase viaja a su lugar.
 * @param {App} app @param {boolean} animar
 */
function mostrar(app, animar) {
  if (location.hash !== "#opciones") return;
  if (!animar || !document.startViewTransition || quieto()) {
    renderOpciones(app);
    return;
  }
  nombrarClases(true);
  document.startViewTransition(() => {
    renderOpciones(app);
    nombrarClases(true);
  }).finished.finally(() => nombrarClases(false));
}

/**
 * Chico: deja app.resultado y devuelve true sin pintar. Grande: Worker.
 * @param {App} app
 */
function buscar(app) {
  const id = ++app.pedido;
  const { requeridas, prefs } = app.estado;
  if (tamano(app) <= UMBRAL) {
    const r = resolver(app.secciones, requeridas, prefs);
    cortarWorker();
    app.enCurso = 0;
    app.resultado = r;
    app.opcion = 0;
    return true;
  }

  app.enCurso = id;
  const listo = (/** @type {Resultado} */ r) => {
    if (app.enCurso !== id) return;
    app.enCurso = 0;
    // Con vista previa, se completa sin moverse de la opción.
    const previa = app.resultado !== null;
    app.resultado = r;
    if (!previa) app.opcion = 0;
    mostrar(app, !previa && $("contenido-opciones").getAttribute("aria-busy") === "true");
  };
  const enHilo = () => listo(resolver(app.secciones, requeridas, prefs));
  try {
    cortarWorker();
    worker ??= new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    trabajando = true;
    worker.onmessage = (e) => {
      trabajando = false;
      listo(e.data.resultado);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker?.terminate();
      worker = null;
      trabajando = false;
      enHilo();
    };
    worker.postMessage({ id, secciones: app.secciones, requeridas, prefs });
  } catch {
    enHilo();
  }
  return false;
}

/**
 * Reemplaza otra fija de la misma materia.
 * @param {App} app @param {Seccion} s
 */
function alternarFija(app, s) {
  const p = app.estado.prefs;
  const misma = new Set(app.secciones.filter((x) => x.codasig === s.codasig).map((x) => x.codhora));
  p.fijas = p.fijas.includes(s.codhora)
    ? p.fijas.filter((c) => c !== s.codhora)
    : [...p.fijas.filter((c) => !misma.has(c)), s.codhora];
  cambio(app);
}

/** @param {App} app @param {Seccion} s */
function excluir(app, s) {
  const p = app.estado.prefs;
  if (!p.excluidas.includes(s.codhora)) p.excluidas = [...p.excluidas, s.codhora];
  p.fijas = p.fijas.filter((c) => c !== s.codhora);
  cambio(app);
}

// ---------- 1. Materias ----------

/** @param {Grupo} g */
const cuantas = (g) => `${g.materias.length} ${g.materias.length === 1 ? "materia" : "materias"}`;

/** @param {App} app @param {Grupo[]} nuevos */
export function agregarGrupos(app, nuevos) {
  const codigos = new Set(nuevos.filter((g) => !g.manual).map((g) => g.grupo));
  const quedan = app.estado.grupos.filter((g) => g.manual || !codigos.has(g.grupo));
  const [delPortal, aMano] = [false, true].map((m) => [...quedan, ...nuevos].filter((g) => !!g.manual === m));
  app.estado.grupos = [...delPortal.sort((a, b) => a.grupo.localeCompare(b.grupo)), ...aMano];
  app.estado.requeridas = [...new Set([...app.estado.requeridas, ...nuevos.flatMap((g) => g.materias.map((m) => m.codasig))])];
  cambio(app);
  if (nuevos.some((g) => g.manual)) {
    renderMaterias(app);
    return;
  }
  mensaje(`Listo: ${nuevos.map((g) => g.grupo).join(", ")}`);
  /** @type {HTMLTextAreaElement} */ ($("pegar")).value = "";
  const sug = /** @type {[string, "asignatura" | "profesor"][]} */ ([["sug-materias", "asignatura"], ["sug-profes", "profesor"]]);
  for (const [id, campo] of sug) document.getElementById(id)?.replaceChildren(...sugerencias(app, campo));
  renderMaterias(app);
}

/** @param {string} texto @param {boolean} [error] */
function mensaje(texto, error = false) {
  const p = $("msg-datos");
  p.textContent = texto;
  p.className = error ? "error" : "ok";
}

/**
 * @param {App} app @param {string} html @param {string} texto
 */
function leerPegado(app, html, texto) {
  try {
    if (html) agregarGrupos(app, [grupoDesdeHtml(html)]);
    else if (RE_JSON.test(texto)) agregarGrupos(app, gruposDesdeJson(JSON.parse(texto)));
    else throw new Error("Lo pegado no trae la tabla. Copia desde la página del portal, no desde el PDF.");
  } catch (err) {
    mensaje(/** @type {Error} */ (err).message, true);
  }
}

/** @param {App} app @param {Iterable<File>} lista */
async function leerArchivos(app, lista) {
  try {
    const archivos = [...lista];
    const textos = await Promise.all(archivos.map((f) => f.text()));
    const grupos = archivos.flatMap((f, i) =>
      f.name.endsWith(".json") ? gruposDesdeJson(JSON.parse(textos[i])) : [grupoDesdeHtml(textos[i])]);
    if (grupos.length) agregarGrupos(app, grupos);
  } catch (err) {
    mensaje(/** @type {Error} */ (err).message, true);
  }
}

/** @param {App} app */
export function iniciarDatos(app) {
  const pegar = /** @type {HTMLTextAreaElement} */ ($("pegar"));
  pegar.addEventListener("paste", (e) => {
    e.preventDefault();
    leerPegado(app, e.clipboardData?.getData("text/html") ?? "", e.clipboardData?.getData("text/plain") ?? "");
  });
  // Un agente llena el campo sin evento paste
  pegar.addEventListener("input", () => {
    const v = pegar.value;
    if (RE_TABLA.test(v)) leerPegado(app, v, "");
    else if (RE_JSON.test(v)) {
      try { JSON.parse(v); } catch { return; }
      leerPegado(app, "", v);
    }
  });

  const archivos = /** @type {HTMLInputElement} */ ($("archivos"));
  archivos.addEventListener("change", async () => {
    await leerArchivos(app, archivos.files ?? []);
    archivos.value = "";
  });

  // Soltar en cualquier parte de Materias; el contador evita el parpadeo.
  const zona = $("materias");
  const sirve = (/** @type {DragEvent} */ e) => [...(e.dataTransfer?.types ?? [])].some((t) => t === "Files" || t === "text/html");
  let encima = 0;
  const salir = () => { encima = 0; zona.classList.remove("soltando"); };
  zona.addEventListener("dragenter", (e) => {
    if (!sirve(e)) return;
    e.preventDefault();
    encima++;
    zona.classList.add("soltando");
  });
  zona.addEventListener("dragover", (e) => {
    if (!sirve(e) || !e.dataTransfer) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  zona.addEventListener("dragleave", () => { if (--encima <= 0) salir(); });
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    salir();
    const dt = e.dataTransfer;
    if (!dt) return;
    if (dt.files.length) leerArchivos(app, dt.files);
    else leerPegado(app, dt.getData("text/html"), dt.getData("text/plain"));
  });
  for (const tipo of ["dragover", "drop"]) {
    addEventListener(tipo, (e) => {
      const d = /** @type {DragEvent} */ (e);
      if (d.defaultPrevented || !d.dataTransfer?.types.includes("Files")) return;
      d.preventDefault();
      d.dataTransfer.dropEffect = "none";
    });
  }

  const tostada = $("tostada");
  tostada.addEventListener("pointerenter", () => clearTimeout(plazo));
  tostada.addEventListener("focusin", () => clearTimeout(plazo));
  tostada.addEventListener("pointerleave", () => { if (deshacer && !tostada.contains(document.activeElement)) correrPlazo(); });
  tostada.addEventListener("focusout", (e) => { if (deshacer && !tostada.contains(/** @type {Node | null} */ (e.relatedTarget))) correrPlazo(); });

  $("ejemplo").addEventListener("click", async () => {
    try {
      const r = await fetch("data/ejemplo.json");
      agregarGrupos(app, gruposDesdeJson(await r.json()));
    } catch {
      mensaje("No se pudo cargar el ejemplo.", true);
    }
  });
}

/** @param {Grupo} g */
function chipGrupo(g) {
  if (!g.manual) return { texto: g.grupo, titulo: [g.sede, g.periodo, cuantas(g)].filter(Boolean).join(" · "), quitado: `Grupo ${g.grupo} quitado` };
  const m = g.materias[0];
  return {
    texto: [sigla(m.asignatura), g.grupo].filter(Boolean).join(" · "),
    titulo: [m.asignatura, m.profesor, g.grupo && `Grupo ${g.grupo}`].filter(Boolean).join(" · "),
    quitado: `${m.asignatura} quitada`,
  };
}

/** @param {App} app */
export function renderMaterias(app) {
  const { grupos } = app.estado;
  if (!$("a-mano").childElementCount) formularioManual(app);

  llenar("grupos", grupos.length > 0 && [
    grupos.map((g) => {
      const c = chipGrupo(g);
      return h("span", { class: "grupo", title: c.titulo },
        c.texto,
        h("button", {
          type: "button", class: "quitar", "aria-label": `Quitar ${c.texto}`,
          onclick: () => conDeshacer(app, c.quitado, () => {
            app.estado.grupos = grupos.filter((x) => x !== g);
            cambio(app);
            renderMaterias(app);
          }),
        }, "×"));
    }),
  ]);

  const materias = listarMaterias(app.secciones);
  if (!materias.length) {
    llenar("contenido-materias");
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
    h("fieldset", { class: "tarjeta" },
      h("legend", {}, "¿Cuáles vas a inscribir?"),
      h("div", { class: "materias" }, materias.map((m) => h("div", { class: "materia" },
        h("label", { class: "materia-elegir" },
          h("input", {
            type: "checkbox", checked: elegidas.has(m.codasig),
            onchange: (/** @type {Event} */ e) => {
              const marcado = /** @type {HTMLInputElement} */ (e.target).checked;
              elegir(marcado
                ? [...app.estado.requeridas, m.codasig]
                : app.estado.requeridas.filter((c) => c !== m.codasig));
            },
          }),
          h("span", {},
            h("b", {}, m.asignatura),
            cuentaSecciones(app, m.codasig, m.secciones))),
        elegidas.has(m.codasig) && profesMateria(app, m.codasig))))));
}

/**
 * "1 de 3 secciones", o nada.
 * @param {App} app @param {string} codasig @param {number} total
 */
function cuentaSecciones(app, codasig, total) {
  const quedan = app.secciones.filter((s) => s.codasig === codasig && !descartada(s, app.estado.prefs)).length;
  return quedan < total && h("small", {}, `${quedan} de ${total} ${total === 1 ? "sección" : "secciones"}`);
}

const ESTADO_PROFE = { "": "da igual", quiero: "lo quieres", no: "no lo quieres" };

/**
 * Tocar uno lo saca de todas sus materias.
 * @param {App} app @param {string} codasig
 */
function profesMateria(app, codasig) {
  const solo = app.estado.prefs.solo[codasig] ?? [];
  return h("ul", { class: "profes-materia", role: "list", "aria-label": "Profesores" },
    profesoresDe(app, codasig).map((p) => {
      const estado = estadoProfe(app, codasig, p);
      const siguiente = estado === "no" || sinSalida(app, p) ? "" : "no";
      const foco = `profe:${codasig}:${p}`;
      return h("li", {}, h("button", {
        type: "button", class: "profe-chip", "data-estado": estado, "data-foco": foco,
        "data-fuera": String(estado === "" && solo.length > 0),
        title: `Tocar: ${siguiente === "no" ? "no lo quiero" : "da igual"}`,
        onclick: () => {
          ponerEnMateria(app, codasig, p, siguiente);
          cambio(app);
          renderMaterias(app);
          /** @type {HTMLElement | null} */ ($("contenido-materias").querySelector(`[data-foco="${CSS.escape(foco)}"]`))?.focus();
        },
      }, p ? nombrePropio(p) : "Sin profesor", h("span", { class: "oculto" }, `: ${ESTADO_PROFE[estado]}`)));
    }));
}

// ---------- Materia a mano ----------
// Se arma una vez: no pierde lo escrito.

// 9:10pm
const ULTIMO_K = 17;

/** @type {WeakMap<Element, () => import("./modelo.js").Bloque>} */
const filasLeer = new WeakMap();

/** @param {number} [d] @param {number} [k] @param {number} [n] @param {string} [tipo] @param {string} [aula] */
function filaBloque(d = 0, k = 0, n = 2, tipo = "C", aula = "") {
  const dia = h("select", { "aria-label": "Día", value: String(d) }, DIAS.map((t, i) => h("option", { value: String(i) }, t)));
  const desde = h("select", { "aria-label": "Desde", value: String(k) },
    Array.from({ length: ULTIMO_K + 1 }, (_, i) => h("option", { value: String(i) }, formatoHora(inicioMin(i)))));
  const hasta = h("select", { "aria-label": "Hasta" });
  const ponerHasta = (/** @type {number} */ fin) => {
    const k0 = Number(desde.value);
    hasta.replaceChildren(...Array.from({ length: ULTIMO_K + 1 - k0 }, (_, i) =>
      h("option", { value: String(k0 + i) }, formatoHora(finMin(k0 + i)))));
    hasta.value = String(Math.min(Math.max(fin, k0), ULTIMO_K));
  };
  ponerHasta(k + n - 1);
  desde.addEventListener("change", () => ponerHasta(Number(desde.value) + 1));
  const clase = h("select", { "aria-label": "Tipo", value: tipo }, h("option", { value: "C" }, "Clase"), h("option", { value: "L" }, "Lab"));
  const salon = h("input", { type: "text", placeholder: "Aula", "aria-label": "Aula (opcional)", value: aula, size: 6 });
  const fila = h("div", { class: "bloque-manual" }, dia, desde, h("span", { "aria-hidden": "true" }, "–"), hasta, clase, salon,
    h("button", {
      type: "button", class: "quitar", "aria-label": "Quitar este día",
      onclick: () => {
        const lista = fila.parentElement;
        fila.remove();
        /** @type {HTMLElement | null | undefined} */ (lista?.querySelector("select"))?.focus();
      },
    }, "×"));
  filasLeer.set(fila, () => {
    const k0 = Number(desde.value);
    return [Number(dia.value), k0, Number(hasta.value) - k0 + 1, clase.value, salon.value.trim()];
  });
  return fila;
}

/** @param {App} app @param {"asignatura" | "profesor"} campo */
function sugerencias(app, campo) {
  const vals = [...new Set(app.estado.grupos.flatMap((g) => g.materias.map((m) => m[campo])).filter(Boolean))].sort();
  return vals.map((v) => h("option", { value: v }));
}

/** @param {App} app @param {string} [aviso] */
function formularioManual(app, aviso = "") {
  const lista = h("div", { class: "bloques-manual" }, filaBloque());
  const msg = h("p", { role: "status", class: aviso ? "ok" : "" }, aviso);
  const campo = (/** @type {string} */ etiqueta, /** @type {Record<string, any>} */ props) =>
    h("label", { class: "campo" }, h("span", {}, etiqueta), h("input", { type: "text", autocomplete: "off", ...props }));

  const form = h("form", {
    class: "form-manual",
    onsubmit: (/** @type {SubmitEvent} */ e) => {
      e.preventDefault();
      const f = /** @type {HTMLFormElement} */ (e.target);
      const v = (/** @type {string} */ n) => /** @type {HTMLInputElement} */ (f.elements.namedItem(n)).value;
      try {
        const g = grupoManual({
          asignatura: v("asignatura"), profesor: v("profesor"), grupo: v("grupo"),
          bloques: [...lista.children].map((fila) => /** @type {() => any} */ (filasLeer.get(fila))()),
        }, app.estado.grupos);
        agregarGrupos(app, [g]);
        formularioManual(app, `${g.materias[0].asignatura} agregada`);
        /** @type {HTMLElement | null} */ ($("a-mano").querySelector("input"))?.focus();
      } catch (err) {
        msg.textContent = /** @type {Error} */ (err).message;
        msg.className = "error";
      }
    },
  },
  h("div", { class: "campos-manual" },
    campo("Materia", { name: "asignatura", required: true, list: "sug-materias", placeholder: "Sistemas operativos" }),
    campo("Profesor", { name: "profesor", list: "sug-profes", placeholder: "Opcional" }),
    campo("Grupo", { name: "grupo", placeholder: "Opcional", size: 8, class: "campo-corto" })),
  h("datalist", { id: "sug-materias" }, sugerencias(app, "asignatura")),
  h("datalist", { id: "sug-profes" }, sugerencias(app, "profesor")),
  lista,
  h("p", { class: "fila" },
    h("button", {
      type: "button", class: "secundario chico",
      onclick: () => {
        // Día siguiente, misma hora
        const ult = lista.lastElementChild && filasLeer.get(lista.lastElementChild)?.();
        const nueva = ult ? filaBloque(Math.min(ult[0] + 2, 6), ult[1], ult[2], ult[3], ult[4]) : filaBloque();
        lista.append(nueva);
        /** @type {HTMLElement} */ (nueva.querySelector("select")).focus();
      },
    }, "+ Otro día")),
  h("p", { class: "fila" }, h("button", { type: "submit" }, "Agregar materia")),
  msg);

  llenar("a-mano", h("p", { class: "titulo" }, "O agrégala a mano"), form);
}

// ---------- Filtros del horario ----------

const turnos = () => [
  ["manana", "Mañana", `${formatoHora(inicioMin(0))}–${formatoHora(finMin(6))}`],
  ["tarde", "Tarde", `${formatoHora(inicioMin(7))}–${formatoHora(finMin(11))}`],
  ["noche", "Noche", `${formatoHora(inicioMin(12))}+`],
];

let grupoSeg = 0;
/**
 * Radios por debajo.
 * @param {string} etiqueta @param {[string, string, string?, boolean?][]} opciones valor, texto, título, desactivada
 * @param {string} actual @param {(v: string) => void} alElegir @param {string} [clase]
 */
function segmentado(etiqueta, opciones, actual, alElegir, clase = "") {
  const nombre = `seg-${++grupoSeg}`;
  return h("div", { class: `segmentado ${clase}`, role: "radiogroup", "aria-label": etiqueta },
    opciones.map(([v, texto, titulo, desactivada]) => h("label", { title: titulo },
      h("input", { type: "radio", name: nombre, value: v, checked: v === actual, disabled: desactivada, "data-foco": `${etiqueta}:${v}`, onchange: () => alElegir(v) }),
      h("span", {}, texto))));
}

/**
 * @param {string} texto @param {boolean} valor @param {(v: boolean) => void} alCambiar
 */
const conmutador = (texto, valor, alCambiar) => h("label", { class: "conmutador" },
  h("span", {}, texto),
  h("input", { type: "checkbox", role: "switch", class: "switch", checked: valor, "data-foco": texto, onchange: (/** @type {Event} */ e) => alCambiar(/** @type {HTMLInputElement} */ (e.target).checked) }));


/** @param {App} app @param {string} codasig */
const profesoresDe = (app, codasig) => [...new Set(app.secciones.filter((s) => s.codasig === codasig).map((s) => s.profesor))].sort();

/** @param {App} app @param {string} profesor @param {boolean} evitar */
function setEvitado(app, profesor, evitar) {
  const p = app.estado.prefs;
  p.evitados = evitar ? [...p.evitados, profesor] : p.evitados.filter((x) => x !== profesor);
  if (!evitar) return;
  const suyas = new Set(app.secciones.filter((s) => s.profesor === profesor).map((s) => s.codhora));
  p.fijas = p.fijas.filter((c) => !suyas.has(c));
  for (const [c, solo] of Object.entries(p.solo)) {
    if (solo.includes(profesor)) setSolo(app, c, solo.filter((x) => x !== profesor));
  }
}

/** @param {App} app @param {string} codasig @param {string[]} solo */
function setSolo(app, codasig, solo) {
  const p = app.estado.prefs;
  if (solo.length) p.solo[codasig] = solo;
  else delete p.solo[codasig];
}

/** "quiero", "no" o "" para un profesor en una materia. @param {App} app @param {string} codasig @param {string} profesor */
function estadoProfe(app, codasig, profesor) {
  const p = app.estado.prefs;
  if (p.evitados.includes(profesor)) return "no";
  return p.solo[codasig]?.includes(profesor) ? "quiero" : "";
}

/**
 * Lo quiero: solo sus secciones en esta materia. No: fuera en todas.
 * @param {App} app @param {string} codasig @param {string} profesor @param {string} estado
 */
function ponerEnMateria(app, codasig, profesor, estado) {
  const solo = (app.estado.prefs.solo[codasig] ?? []).filter((x) => x !== profesor);
  setSolo(app, codasig, estado === "quiero" ? [...solo, profesor] : solo);
  if (estado !== "no" && app.estado.prefs.evitados.includes(profesor)) setEvitado(app, profesor, false);
  if (estado === "no") setEvitado(app, profesor, true);
}

/**
 * Si descartarlo deja sin profesores a alguna materia elegida.
 * @param {App} app @param {string} profesor
 */
function sinSalida(app, profesor) {
  const { prefs, requeridas } = app.estado;
  return requeridas.some((c) => {
    const ps = profesoresDe(app, c);
    const solo = (prefs.solo[c] ?? []).filter((x) => x !== profesor);
    return ps.includes(profesor)
      && ps.every((q) => q === profesor || prefs.evitados.includes(q) || (solo.length > 0 && !solo.includes(q)));
  });
}

/** @param {App} app @param {() => void} hacer */
function filtrar(app, hacer) {
  hacer();
  cambio(app);
  recalcular(app);
}

let filtrosAbiertos = false;

/**
 * @param {App} app
 */
function filtros(app) {
  const { requeridas, prefs } = app.estado;
  const elegidas = app.secciones.filter((s) => requeridas.includes(s.codasig));
  const enUso = turnos().filter(([v]) => elegidas.some((s) => cumpleHorario(s, v)));

  /** @param {string} texto @param {() => void} quitar @param {string} hecho */
  const quitable = (texto, quitar, hecho) => h("button", {
    type: "button", class: "chip-quitar", "aria-label": `Quitar: ${texto}`,
    onclick: () => conDeshacer(app, hecho, () => filtrar(app, quitar)),
  }, texto, h("span", { "aria-hidden": "true" }, "×"));
  const quitables = [
    prefs.fijas.length > 0 && quitable(`${prefs.fijas.length} ${prefs.fijas.length === 1 ? "fijada" : "fijadas"}`, () => { prefs.fijas = []; }, "Secciones soltadas"),
    prefs.excluidas.length > 0 && quitable(`${prefs.excluidas.length} ${prefs.excluidas.length === 1 ? "excluida" : "excluidas"}`, () => { prefs.excluidas = []; }, "Secciones de vuelta"),
    prefs.evitados.map((p) => quitable(`Sin ${nombrePropio(p)}`, () => setEvitado(app, p, false), `${nombrePropio(p)} de vuelta`)),
  ].flat().filter(Boolean);

  const activos = (prefs.horario ? 1 : 0) + (prefs.menosDias ? 1 : 0) + quitables.length;
  return h("details", {
    class: "filtros tarjeta", open: !celular.matches || filtrosAbiertos,
    ontoggle: (/** @type {Event} */ e) => { if (celular.matches) filtrosAbiertos = /** @type {HTMLDetailsElement} */ (e.target).open; },
  },
  h("summary", {}, "Ajustar", activos > 0 && h("span", { class: "insignia" }, activos)),
  h("div", { class: "filtros-cuerpo" },
    enUso.length > 1 && h("div", { class: "filtro" },
      h("span", { class: "nombre-filtro" }, "Turno"),
      segmentado("Turno", [["", "Da igual"], ...enUso.map(([v, t, rango]) => /** @type {[string, string, string]} */ ([v, t, rango]))],
        prefs.horario ?? "", (v) => filtrar(app, () => {
          if (v) prefs.horario = v;
          else {
            delete prefs.horario;
            prefs.soloTurno = false;
          }
        }))),
    prefs.horario && conmutador("Solo ese turno", !!prefs.soloTurno, (v) => filtrar(app, () => { prefs.soloTurno = v; })),
    conmutador("Ir menos días", !!prefs.menosDias, (v) => filtrar(app, () => { prefs.menosDias = v; })),
    quitables.length > 0 && h("div", { class: "filtro" }, quitables)));
}

// ---------- 2. Horario ----------

/**
 * Odómetro: solo ruedan los dígitos que cambian.
 * @param {number} ancho
 */
function rodante(ancho) {
  const leer = h("span", { class: "oculto" });
  const digitos = h("span", { class: "rodante", "aria-hidden": "true" });
  const el = h("span", { class: "num", style: `min-width:${ancho}ch` }, leer, digitos);
  /** @param {number} n */
  const poner = (n) => {
    const txt = String(n);
    leer.textContent = txt;
    while (digitos.children.length < txt.length) {
      digitos.prepend(h("span", { class: "digito" }, [..."0123456789"].map((d) => h("span", {}, d))));
    }
    while (digitos.children.length > txt.length) digitos.firstElementChild?.remove();
    [...digitos.children].forEach((d, i) => {
      const el = /** @type {HTMLElement} */ (d);
      el.style.setProperty("--d", txt[i]);
      el.style.setProperty("--i", String(txt.length - 1 - i));
    });
  };
  return { el, poner };
}

/**
 * Singular y plural en la misma celda: ancho fijo.
 * @param {string} uno @param {string} varios
 */
function cifra(uno, varios) {
  const num = rodante(2);
  const a = h("span", {}, uno);
  const b = h("span", {}, varios);
  const el = h("li", {}, h("b", {}, num.el), " ", h("span", { class: "etiqueta" }, a, b));
  /** @param {number} n */
  const poner = (n) => {
    num.poner(n);
    a.classList.toggle("fuera", n !== 1);
    b.classList.toggle("fuera", n === 1);
  };
  return { el, poner };
}


/**
 * Deja la opción atenuada hasta la nueva búsqueda.
 * Si solo se achican las combinaciones, `previo` adelanta las que siguen valiendo.
 * @param {App} app @param {Resultado | null} [previo]
 */
function recalcular(app, previo = null) {
  $("contenido-opciones").setAttribute("aria-busy", "true");
  if (!buscar(app) && previo?.estado === "OK") {
    const { requeridas, prefs } = app.estado;
    // Por codhora: las secciones se reconstruyen en cada cambio
    const validas = new Set([...candidatas(app.secciones, requeridas, prefs).values()].flat().map((c) => c.s.codhora));
    const quedan = previo.opciones.filter((o) => o.secciones.every((s) => validas.has(s.codhora)));
    if (quedan.length) {
      app.resultado = { estado: "OK", opciones: quedan, parcial: previo.parcial };
      app.opcion = 0;
    }
  }
  if (app.resultado) mostrar(app, true);
}

/** @param {App} app */
export function renderOpciones(app) {
  const { requeridas, prefs } = app.estado;
  $("contenido-opciones").removeAttribute("aria-busy");
  if (!requeridas.length) {
    app.mostradas = null;
    llenar("contenido-opciones", pendiente("Aún no elegiste materias", "#materias", "Elegir materias"));
    return;
  }
  // No sacar el foco del control tocado.
  const pintar = (/** @type {any[]} */ ...hijos) => {
    const foco = document.activeElement?.closest("#contenido-opciones") && document.activeElement.getAttribute("data-foco");
    llenar("contenido-opciones", filtros(app), hijos);
    // Tras llenar la tabla de materias
    if (foco) queueMicrotask(() => /** @type {HTMLElement | null} */ ($("contenido-opciones").querySelector(`[data-foco="${CSS.escape(foco)}"]`))?.focus({ preventScroll: true }));
  };
  if (!app.resultado && !app.enCurso) buscar(app);
  if (!app.resultado) {
    app.mostradas = null;
    pintar(h("div", { class: "tarjeta cargando", "aria-busy": "true" },
      h("p", { role: "status" }, "Buscando combinaciones…"),
      h("div", { class: "esqueleto", "aria-hidden": "true" })));
    return;
  }
  const r = app.resultado;
  const nombre = (/** @type {string} */ c) => app.secciones.find((s) => s.codasig === c)?.asignatura ?? c;
  const hayFiltros = prefs.fijas.length > 0 || prefs.excluidas.length > 0 || prefs.evitados.length > 0 || (prefs.soloTurno && prefs.horario);
  // Con filtros, la salida son los chips
  const salida = !hayFiltros && h("a", { href: "#materias", class: "boton secundario" }, "Cambiar materias");

  if (r.estado !== "OK") app.mostradas = null;
  if (r.estado === "FALTAN") {
    pintar(h("div", { class: "tarjeta pendiente" },
      h("h3", { class: "error" }, "No quedan secciones"),
      h("p", {}, r.faltan.map(nombre).join(", ")),
      salida));
    return;
  }
  if (r.estado === "SIN_SOLUCION") {
    pintar(h("div", { class: "tarjeta pendiente" },
      h("h3", { class: "error" }, r.parcial ? `Sin horario en ${MS_MAX / 1000} s` : "Sin horario posible"),
      r.choques.length > 0 && h("ul", {}, r.choques.map(([a, b]) => h("li", {}, `${nombre(a)} y ${nombre(b)} chocan siempre`))),
      salida));
    return;
  }

  const total = r.opciones.length;
  app.opcion = Math.min(app.opcion, total - 1);
  const tono = new Map(requeridas.map((c, i) => [c, Math.round((i * 360) / requeridas.length)]));

  const diapositivas = r.opciones.map((o, i) => h("section", {
    class: "tarjeta diapositiva", "aria-roledescription": "opción", "aria-label": `Opción ${i + 1} de ${total}`,
  }, grilla(o.secciones, tono), porDia(o.secciones, tono)));
  const carrusel = h("div", {
    class: "carrusel", tabindex: 0, "aria-roledescription": "carrusel", "aria-label": "Opciones de horario",
  }, diapositivas);

  const anterior = /** @type {HTMLButtonElement} */ (h("button", { type: "button", class: "secundario", "aria-label": "Opción anterior", onclick: () => irAOpcion(app, app.opcion - 1) }));
  const siguiente = /** @type {HTMLButtonElement} */ (h("button", { type: "button", class: "secundario", "aria-label": "Opción siguiente", onclick: () => irAOpcion(app, app.opcion + 1) }));
  const numero = rodante(String(total).length);
  const cDias = cifra("día", "días");
  const cHuecos = cifra("hueco", "huecos");
  const materias = h("div", { class: "tarjeta materias-opcion" });

  const resorte = resorteScroll(carrusel);
  moverCarrusel = resorte.ir;
  // Alto de la opción visible, no de la más alta.
  const alto = new ResizeObserver(([e]) => {
    const cs = getComputedStyle(carrusel);
    const relleno = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    carrusel.style.height = `${/** @type {HTMLElement} */ (e.target).offsetHeight + relleno}px`;
  });

  /** Sin reconstruir el carrusel. @param {number} i */
  const mostrar = (i) => {
    app.opcion = i;
    diapositivas.forEach((d, k) => d.classList.toggle("actual", k === i));
    alto.disconnect();
    alto.observe(diapositivas[i]);
    const o = r.opciones[i];
    const dt = o.detalle;
    anterior.disabled = i === 0;
    siguiente.disabled = i === total - 1;
    numero.poner(i + 1);
    cDias.poner(dt.dias);
    cHuecos.poner(dt.huecos);
    materias.replaceChildren(...tablaMaterias(app, o, tono));

    // Resaltar solo lo que cambió.
    const actuales = new Set(o.secciones.map((s) => s.codhora));
    const antes = app.mostradas;
    const distintas = antes ? [...actuales].filter((c) => !antes.has(c)) : [];
    app.mostradas = actuales;
    if (!distintas.length || distintas.length === actuales.size) return;
    for (const el of diapositivas[i].querySelectorAll(".clase")) {
      el.classList.remove("nueva");
      if (distintas.includes(Number(/** @type {HTMLElement} */ (el).dataset.codhora))) {
        void (/** @type {HTMLElement} */ (el).offsetWidth); // reinicia la animación
        el.classList.add("nueva");
      }
    }
  };

  const paso = () => (diapositivas.length > 1 ? diapositivas[1].offsetLeft - diapositivas[0].offsetLeft : 1);
  const acotar = (/** @type {number} */ i) => Math.max(0, Math.min(total - 1, i));

  let cuadro = 0;
  carrusel.addEventListener("scroll", () => {
    // overflow-y: hidden deja mover por código
    if (carrusel.scrollTop) carrusel.scrollTop = 0;
    cancelAnimationFrame(cuadro);
    cuadro = requestAnimationFrame(() => {
      const j = acotar(Math.round(carrusel.scrollLeft / paso()));
      if (j !== app.opcion) mostrar(j);
    });
  }, { passive: true });

  // Arrastre con mouse, con inercia.
  /** @type {{x: number, izq: number, ultX: number, ultT: number, v: number, desde: number} | null} */
  let arrastre = null;
  carrusel.addEventListener("pointerdown", (e) => {
    resorte.detener();
    if (e.pointerType !== "mouse" || e.button !== 0 || total < 2) return;
    arrastre = { x: e.clientX, izq: carrusel.scrollLeft, ultX: e.clientX, ultT: e.timeStamp, v: 0, desde: app.opcion };
  });
  carrusel.addEventListener("wheel", () => resorte.detener(), { passive: true });
  carrusel.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    if (!carrusel.classList.contains("arrastrando")) {
      if (Math.abs(dx) < 4) return;
      carrusel.classList.add("arrastrando");
      carrusel.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - arrastre.ultT;
    if (dt > 0) arrastre.v = 0.8 * ((e.clientX - arrastre.ultX) / dt) + 0.2 * arrastre.v; // px/ms
    arrastre.ultX = e.clientX;
    arrastre.ultT = e.timeStamp;
    carrusel.scrollLeft = arrastre.izq - dx;
  });
  const soltar = () => {
    if (!arrastre) return;
    const { v, desde } = arrastre;
    arrastre = null;
    if (!carrusel.classList.contains("arrastrando")) return;
    carrusel.classList.remove("arrastrando");
    // ~250 ms de inercia, de a una opción
    const proyectada = Math.round((carrusel.scrollLeft - v * 250) / paso());
    const destino = acotar(Math.max(desde - 1, Math.min(desde + 1, proyectada)));
    resorte.ir(destino * paso(), -v * 1000);
  };
  carrusel.addEventListener("pointerup", soltar);
  carrusel.addEventListener("pointercancel", soltar);

  pintar(
    r.parcial && h("p", { class: "aviso" }, `Búsqueda cortada a los ${MS_MAX / 1000} s: puede haber opciones mejores.`),
    h("div", { class: "horario-cabeza" },
      h("div", { class: "navegar" },
        anterior,
        h("p", { role: "status" }, h("span", { class: "oculto" }, "Opción "),
          h("b", {}, numero.el, h("small", {}, ` de ${total}${total === K_POR_DEFECTO ? "+" : ""}`))),
        siguiente),
      h("ul", { class: "cifras", role: "list" }, cDias.el, cHuecos.el)),
    carrusel,
    materias);

  mostrar(app.opcion);
  carrusel.scrollLeft = diapositivas[app.opcion].offsetLeft - diapositivas[0].offsetLeft;
}

/** @type {((x: number) => void) | null} */
let moverCarrusel = null;

/**
 * El scroll actualiza el resto.
 * @param {App} app @param {number} i
 */
export function irAOpcion(app, i) {
  const diapositivas = document.querySelectorAll("#contenido-opciones .diapositiva");
  const d = /** @type {HTMLElement | undefined} */ (diapositivas[i]);
  if (!d || !moverCarrusel) return;
  moverCarrusel(d.offsetLeft - /** @type {HTMLElement} */ (diapositivas[0]).offsetLeft);
}

/**
 * Resorte (520/38): a diferencia de "smooth", conserva la velocidad.
 * @param {HTMLElement} el
 */
function resorteScroll(el) {
  let x = 0, v = 0, destino = 0, cuadro = 0, ultimo = 0;
  const detener = () => {
    if (!cuadro) return;
    cancelAnimationFrame(cuadro);
    cuadro = 0;
    el.classList.remove("animando");
  };
  /** @param {number} t */
  const avanzar = (t) => {
    const dt = Math.min(0.064, (t - ultimo) / 1000);
    ultimo = t;
    // Sub-pasos de ~4 ms: estable con 520 de rigidez
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
    for (let k = 0; k < n; k++) {
      v += (-520 * (x - destino) - 38 * v) * h;
      x += v * h;
    }
    el.scrollLeft = x;
    if (Math.abs(x - destino) < 0.5 && Math.abs(v) < 10) {
      el.scrollLeft = destino;
      detener();
      return;
    }
    cuadro = requestAnimationFrame(avanzar);
  };
  /** @param {number} d @param {number} [v0] velocidad inicial, px/s */
  const ir = (d, v0) => {
    if (quieto()) {
      el.scrollLeft = d;
      return;
    }
    if (!cuadro) {
      x = el.scrollLeft;
      v = 0;
      ultimo = performance.now();
      el.classList.add("animando"); // el snap pelearía con el resorte
      cuadro = requestAnimationFrame(avanzar);
    }
    if (v0 !== undefined) v = v0;
    destino = d;
  };
  return { ir, detener };
}

// Materia cuya fila de profesores está abierta en la tabla
/** @type {string | null} */
let profAbierto = null;

/** Lo que identifica una sección al inscribirse. @param {Seccion} s */
const claveDe = (s) => codigo(s) || s.grupo || nombrePropio(s.profesor);

/**
 * @param {Seccion[]} lista reemplazos, de mejor a peor
 */
function planB(lista) {
  if (!lista.length) return null;
  return h("small", { class: "plan-b", title: ["Si se llena:", ...lista.slice(0, 3).map((x) => [codigo(x), x.grupo, nombrePropio(x.profesor)].filter(Boolean).join(" · "))].join("\n") },
    h("span", { class: "oculto" }, "Si se llena: "), h("span", { "aria-hidden": "true" }, "↳ "), claveDe(lista[0]));
}

/**
 * Tocar el profesor abre los demás de esa materia.
 * @param {App} app @param {import("./solver.js").Opcion} o @param {Map<string, number>} tono
 */
function tablaMaterias(app, o, tono) {
  const { prefs } = app.estado;
  const planes = reemplazos(app.secciones, o.secciones, prefs);
  const COLUMNAS = 5;
  const repintar = (/** @type {Event} */ e) => {
    const t = /** @type {HTMLElement} */ (e.currentTarget).closest(".materias-opcion");
    t?.replaceChildren(...tablaMaterias(app, o, tono));
    /** @type {HTMLElement | null | undefined} */ (t?.querySelector(`[data-foco="${CSS.escape(/** @type {HTMLElement} */ (e.currentTarget).dataset.foco ?? "")}"]`))?.focus();
  };
  return [
    // Anchos fijos: al pasar de opción las columnas no bailan con el largo de los nombres
    h("div", { class: "tabla" }, h("table", { class: "tabla-materias" },
      h("thead", {}, h("tr", {}, [["Asignatura"], ["Grupo", "c-grupo"], ["C.Hora", "c-hora"], ["Profesor", "c-profe"], ["", "c-acciones"]]
        .map(([t, c]) => h("th", { scope: "col", class: c }, t)))),
      h("tbody", {}, o.secciones.map((s) => {
        const fija = prefs.fijas.includes(s.codhora);
        const profesores = profesoresDe(app, s.codasig);
        const abierta = profAbierto === s.codasig;
        const fila = h("tr", {},
          h("td", {}, h("span", { class: "punto", style: `--h:${tono.get(s.codasig)}`, "aria-hidden": "true" }), s.asignatura,
            h("small", { class: "sigla-leyenda", "aria-hidden": "true" }, ` ${sigla(s.asignatura)}`)),
          h("td", { class: "codigo" }, s.grupo || "—"),
          h("td", { class: "codigo hora-plan" }, h("span", {}, codigo(s) || "—"), planB(planes.get(s.codhora) ?? [])),
          h("td", {}, profesores.length > 1
            ? h("button", {
              type: "button", class: "enlace-prof", "aria-expanded": String(abierta), "data-foco": `abrir:${s.codasig}`,
              title: "Elegir profesor",
              onclick: (/** @type {Event} */ e) => {
                profAbierto = abierta ? null : s.codasig;
                repintar(e);
              },
            }, nombrePropio(s.profesor), h("span", { class: "flecha", "aria-hidden": "true" }, "▾"))
            : nombrePropio(s.profesor)),
          h("td", { class: "acciones-fila" },
            h("button", {
              type: "button", class: `chico ${fija ? "" : "secundario"}`, "aria-pressed": String(fija),
              title: fija ? "Soltar: volver a considerar las otras secciones" : "Fijar: usar siempre esta sección",
              onclick: () => {
                const previo = fija ? null : app.resultado; // soltar agranda las combinaciones
                alternarFija(app, s);
                recalcular(app, previo);
              },
            }, fija ? "Fijada" : "Fijar"),
            h("button", {
              type: "button", class: "chico fantasma", title: "Excluir: no usar nunca esta sección",
              onclick: () => conDeshacer(app, `${s.asignatura} · ${s.grupo} excluida`, () => {
                const previo = app.resultado;
                excluir(app, s);
                recalcular(app, previo);
              }),
            }, "Excluir")));
        if (!abierta) return fila;
        // Igual que en Materias
        return [fila, h("tr", { class: "fila-profes" }, h("td", { colSpan: COLUMNAS },
          h("ul", { class: "profes", role: "list" },
            profesores.map((p) => {
              const estado = estadoProfe(app, s.codasig, p);
              const bloqueado = estado !== "no" && sinSalida(app, p);
              return h("li", { "data-estado": estado },
                h("span", { class: "nombre-profe" }, nombrePropio(p)),
                segmentado(`Profesor ${nombrePropio(p)} en ${s.asignatura}`, [
                  ["quiero", "Lo quiero", "Solo sus secciones en esta materia"],
                  ["", "Da igual"],
                  ["no", "No", bloqueado ? "Es el único que queda" : "Que no salga en ninguna materia", bloqueado],
                ], estado, (v) => filtrar(app, () => ponerEnMateria(app, s.codasig, p, v)), "chico"));
            }))))];
      })))),
  ];
}

/** Render de cada paso, para repintar el actual tras deshacer. @type {Record<string, (app: App) => void>} */
const PANTALLAS = { materias: renderMaterias, opciones: renderOpciones };

/** Cambio desde el agente. @param {App} app @param {() => void} hacer */
export function aplicar(app, hacer) {
  hacer();
  cambio(app);
  PANTALLAS[location.hash.slice(1) || "materias"]?.(app);
}

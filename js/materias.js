// @ts-check
// Paso 1: cargar grupos y elegir materias.

import { nombrePropio } from "./calendario.js";
import { conDeshacer, iniciarTostada } from "./deshacer.js";
import { $, contar, enfocar, h, llenar, marcado } from "./dom.js";
import { estadoProfe, ponerEnMateria, profesoresDe, sinSalida } from "./elecciones.js";
import { gruposDesdeJson, grupoDesdeHtml } from "./entrada.js";
import { actualizarSugerencias, formularioManual } from "./manual.js";
import { listarMaterias, sigla } from "./modelo.js";
import { descartada } from "./preferencias.js";
import { cambio } from "./ui.js";

/**
 * @typedef {import("./ui.js").App} App
 * @typedef {import("./modelo.js").Grupo} Grupo
 */

const RE_JSON = /^\s*[[{]/;
const RE_TABLA = /<table[\s>]/i;
const RE_EXT_JSON = /\.json$/i;

/** @param {string} texto @param {"ok" | "error"} [tipo] */
function mensaje(texto, tipo = "ok") {
  const p = $("msg-datos");
  p.textContent = texto;
  p.className = tipo;
}

/** @param {unknown} err */
const mensajeError = (err) => mensaje(/** @type {Error} */ (err).message, "error");

/** @param {App} app @param {Grupo[]} nuevos */
export function agregarGrupos(app, nuevos) {
  const codigos = new Set(nuevos.filter((g) => !g.manual).map((g) => g.grupo));
  const quedan = app.estado.grupos.filter((g) => g.manual || !codigos.has(g.grupo));
  const todos = [...quedan, ...nuevos];
  const delPortal = todos.filter((g) => !g.manual).sort((a, b) => a.grupo.localeCompare(b.grupo));
  const aMano = todos.filter((g) => g.manual);
  app.estado.grupos = [...delPortal, ...aMano];
  const materiasNuevas = nuevos.flatMap((g) => g.materias.map((m) => m.codasig));
  app.estado.requeridas = [...new Set([...app.estado.requeridas, ...materiasNuevas])];
  cambio(app);
  if (nuevos.some((g) => g.manual)) {
    renderMaterias(app);
    return;
  }
  mensaje(`Listo: ${nuevos.map((g) => g.grupo).join(", ")}`);
  /** @type {HTMLTextAreaElement} */ ($("pegar")).value = "";
  actualizarSugerencias(app);
  renderMaterias(app);
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
    mensajeError(err);
  }
}

/** @param {App} app @param {Iterable<File>} lista */
async function leerArchivos(app, lista) {
  try {
    const archivos = [...lista];
    const textos = await Promise.all(archivos.map((f) => f.text()));
    const grupos = archivos.flatMap((f, i) =>
      RE_EXT_JSON.test(f.name) ? gruposDesdeJson(JSON.parse(textos[i])) : [grupoDesdeHtml(textos[i])]);
    if (grupos.length) agregarGrupos(app, grupos);
  } catch (err) {
    mensajeError(err);
  }
}

/** @param {App} app */
function iniciarPegar(app) {
  const pegar = /** @type {HTMLTextAreaElement} */ ($("pegar"));
  pegar.addEventListener("paste", (e) => {
    e.preventDefault();
    const datos = e.clipboardData;
    leerPegado(app, datos?.getData("text/html") ?? "", datos?.getData("text/plain") ?? "");
  });
  // Escrito o llenado sin evento paste
  pegar.addEventListener("input", () => {
    const v = pegar.value;
    if (RE_TABLA.test(v)) {
      leerPegado(app, v, "");
      return;
    }
    if (!RE_JSON.test(v)) return;
    try { JSON.parse(v); } catch { return; }
    leerPegado(app, "", v);
  });
}

/** @param {App} app */
function iniciarArchivos(app) {
  const archivos = /** @type {HTMLInputElement} */ ($("archivos"));
  archivos.addEventListener("change", async () => {
    await leerArchivos(app, archivos.files ?? []);
    archivos.value = "";
  });
}

/** Soltar en cualquier parte de Materias; el contador evita el parpadeo. @param {App} app */
function iniciarSoltar(app) {
  const zona = $("materias");
  const sirve = (/** @type {DragEvent} */ e) =>
    [...(e.dataTransfer?.types ?? [])].some((t) => t === "Files" || t === "text/html");
  let encima = 0;
  const salir = () => {
    encima = 0;
    zona.classList.remove("soltando");
  };
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
  zona.addEventListener("dragleave", () => {
    if (--encima <= 0) salir();
  });
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    salir();
    const dt = e.dataTransfer;
    if (!dt) return;
    if (dt.files.length) leerArchivos(app, dt.files);
    else leerPegado(app, dt.getData("text/html"), dt.getData("text/plain"));
  });
  // Fuera de la zona, un archivo soltado no abre otra página.
  for (const tipo of ["dragover", "drop"]) {
    addEventListener(tipo, (e) => {
      const d = /** @type {DragEvent} */ (e);
      if (d.defaultPrevented || !d.dataTransfer?.types.includes("Files")) return;
      d.preventDefault();
      d.dataTransfer.dropEffect = "none";
    });
  }
}

/** @param {App} app */
export function iniciarDatos(app) {
  iniciarPegar(app);
  iniciarArchivos(app);
  iniciarSoltar(app);
  iniciarTostada();
  $("ejemplo").addEventListener("click", async () => {
    try {
      const r = await fetch("data/ejemplo.json");
      agregarGrupos(app, gruposDesdeJson(await r.json()));
    } catch {
      mensaje("No se pudo cargar el ejemplo.", "error");
    }
  });
}

/** @param {Grupo} g */
const cuantas = (g) => contar(g.materias.length, "materia", "materias");

/** @param {...(string | false | undefined)} partes */
const juntar = (...partes) => partes.filter(Boolean).join(" · ");

/** @param {Grupo} g */
function chipGrupo(g) {
  if (!g.manual) {
    return {
      texto: g.grupo,
      titulo: juntar(g.sede, g.periodo, cuantas(g)),
      quitado: `Grupo ${g.grupo} quitado`,
    };
  }
  const m = g.materias[0];
  return {
    texto: juntar(sigla(m.asignatura), g.grupo),
    titulo: juntar(m.asignatura, m.profesor, g.grupo && `Grupo ${g.grupo}`),
    quitado: `${m.asignatura} quitada`,
  };
}

/** El valor más repetido. @param {string[]} xs */
function moda(xs) {
  /** @type {Map<string, number>} */
  const n = new Map();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

/**
 * Grupos del portal de otro período o sede que la mayoría: se mezclarían sin aviso.
 * @param {Grupo[]} grupos @returns {Map<Grupo, string>} grupo → qué difiere
 */
function distintos(grupos) {
  const portal = grupos.filter((g) => !g.manual);
  const periodo = moda(portal.map((g) => g.periodo));
  const sede = moda(portal.map((g) => g.sede ?? ""));
  return new Map(portal.flatMap((g) => {
    const dif = [
      g.periodo && periodo && g.periodo !== periodo && `Otro período: ${g.periodo}`,
      g.sede && sede && g.sede !== sede && `Otra sede: ${g.sede}`,
    ].filter(Boolean).join(" · ");
    return dif ? [[g, dif]] : [];
  }));
}

/** @param {App} app @param {Grupo} g @param {string} [dif] */
function botonGrupo(app, g, dif) {
  const c = chipGrupo(g);
  const quitar = () => conDeshacer(app, c.quitado, () => {
    app.estado.grupos = app.estado.grupos.filter((x) => x !== g);
    cambio(app);
    renderMaterias(app);
  });
  return h("span", { class: dif ? "grupo distinto" : "grupo", title: dif ? `${dif}\n${c.titulo}` : c.titulo },
    dif && h("span", { class: "oculto" }, `${dif}: `),
    c.texto,
    h("button", { type: "button", class: "quitar", "aria-label": `Quitar ${c.texto}`, onclick: quitar }, "×"));
}

/** @param {App} app */
export function renderMaterias(app) {
  if (!$("a-mano").childElementCount) formularioManual(app);
  const dif = distintos(app.estado.grupos);
  llenar("grupos", app.estado.grupos.map((g) => botonGrupo(app, g, dif.get(g))));

  const materias = listarMaterias(app.secciones);
  if (!materias.length) {
    llenar("contenido-materias");
    return;
  }
  llenar("contenido-materias",
    h("fieldset", { class: "tarjeta" },
      h("legend", {}, "¿Cuáles vas a inscribir?"),
      h("div", { class: "materias" }, materias.map((m) => filaMateria(app, m)))));
}

/** @param {App} app @param {{codasig: string, asignatura: string, secciones: number}} m */
function filaMateria(app, m) {
  const elegida = app.estado.requeridas.includes(m.codasig);
  /** @param {Event} e */
  const alternar = (e) => {
    const { requeridas } = app.estado;
    app.estado.requeridas = marcado(e)
      ? [...requeridas, m.codasig]
      : requeridas.filter((c) => c !== m.codasig);
    cambio(app);
    renderMaterias(app);
  };
  return h("div", { class: "materia" },
    h("label", { class: "materia-elegir" },
      h("input", { type: "checkbox", checked: elegida, onchange: alternar }),
      h("span", {},
        h("b", {}, m.asignatura),
        cuentaSecciones(app, m.codasig, m.secciones))),
    profesMateria(app, m.codasig, elegida));
}

/**
 * "1 de 3", o nada. Va en la línea del título para no mover la tarjeta.
 * @param {App} app @param {string} codasig @param {number} total
 */
function cuentaSecciones(app, codasig, total) {
  const vivas = app.secciones.filter((s) => s.codasig === codasig && !descartada(s, app.estado.prefs));
  const quedan = new Set(vivas.map((s) => s.codhora)).size;
  if (quedan >= total) return null;
  const texto = `${quedan} de ${contar(total, "sección", "secciones")}`;
  return h("small", { title: texto }, h("span", { "aria-hidden": "true" }, `${quedan} de ${total}`), h("span", { class: "oculto" }, texto));
}

const ESTADO_PROFE = { "": "da igual", quiero: "lo quieres", no: "no lo quieres" };

/**
 * Tocar uno lo saca de todas sus materias. Sin elegir, quedan visibles e inertes
 * para que la tarjeta no cambie de alto.
 * @param {App} app @param {string} codasig @param {boolean} elegida
 */
function profesMateria(app, codasig, elegida) {
  const solo = app.estado.prefs.solo[codasig] ?? [];
  const chip = (/** @type {string} */ p) => {
    const estado = estadoProfe(app, codasig, p);
    const siguiente = estado === "no" || sinSalida(app, p) ? "" : "no";
    const foco = `profe:${codasig}:${p}`;
    const tocar = () => {
      ponerEnMateria(app, codasig, p, siguiente);
      cambio(app);
      renderMaterias(app);
      enfocar($("contenido-materias"), foco);
    };
    return h("li", {}, h("button", {
      type: "button",
      class: "profe-chip",
      "data-estado": estado,
      "data-foco": foco,
      "data-fuera": String(estado === "" && solo.length > 0),
      title: `Tocar: ${siguiente === "no" ? "no lo quiero" : "da igual"}`,
      onclick: tocar,
    },
    p ? nombrePropio(p) : "Sin profesor",
    h("span", { class: "oculto" }, `: ${ESTADO_PROFE[estado]}`)));
  };
  return h("ul", { class: "profes-materia", role: "list", "aria-label": "Profesores", inert: !elegida },
    profesoresDe(app, codasig).map(chip));
}

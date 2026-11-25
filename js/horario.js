// @ts-check
// Paso 2: las opciones de horario, una por diapositiva, y su tabla de materias.

import { buscar } from "./busqueda.js";
import { codigo, grilla, nombrePropio, porDia, punto } from "./calendario.js";
import { animarCarrusel } from "./carrusel.js";
import { $, enfocar, h, llenar } from "./dom.js";
import { filtros } from "./filtros.js";
import { inspeccionar } from "./inspector.js";
import { sigla } from "./modelo.js";
import { K_POR_DEFECTO, MS_MAX } from "./solver.js";

/**
 * @typedef {import("./ui.js").App} App
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./solver.js").Resultado} Resultado
 * @typedef {import("./solver.js").Opcion} Opcion
 */

/** @param {string} titulo @param {string} destino @param {string} accion */
const pendiente = (titulo, destino, accion) => h("div", { class: "tarjeta pendiente" },
  h("h3", {}, titulo),
  h("a", { href: destino, class: "boton" }, accion));

/**
 * Odómetro: solo ruedan los dígitos que cambian.
 * @param {number} ancho
 */
function rodante(ancho) {
  const leer = h("span", { class: "oculto" });
  const digitos = h("span", { class: "rodante", "aria-hidden": "true" });
  const el = h("span", { class: "num", style: `min-width:${ancho}ch` }, leer, digitos);
  const rueda = () => h("span", { class: "digito" }, [..."0123456789"].map((d) => h("span", {}, d)));
  /** @param {number} n */
  const poner = (n) => {
    const txt = String(n);
    leer.textContent = txt;
    while (digitos.children.length < txt.length) digitos.prepend(rueda());
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

/** No saca el foco del control tocado. @param {App} app @param {...any} hijos */
function pintar(app, ...hijos) {
  const activo = document.activeElement;
  const foco = activo?.closest("#contenido-opciones") && activo.getAttribute("data-foco");
  llenar("contenido-opciones", filtros(app), hijos);
  // Tras llenar la tabla de materias
  if (foco) queueMicrotask(() => enfocar($("contenido-opciones"), foco, { preventScroll: true }));
}

/** @param {App} app */
export function renderOpciones(app) {
  $("contenido-opciones").removeAttribute("aria-busy");
  if (!app.estado.requeridas.length) {
    app.mostradas = null;
    llenar("contenido-opciones", pendiente("Aún no elegiste materias", "#materias", "Elegir materias"));
    return;
  }
  if (!app.resultado && !app.enCurso) buscar(app);
  const r = app.resultado;
  if (!r) {
    app.mostradas = null;
    pintar(app, h("div", { class: "tarjeta cargando", "aria-busy": "true" },
      h("p", { role: "status" }, "Buscando combinaciones…"),
      h("div", { class: "esqueleto", "aria-hidden": "true" })));
    return;
  }
  if (r.estado !== "OK") {
    app.mostradas = null;
    pintar(app, sinOpciones(app, r));
    return;
  }
  pintarOpciones(app, r);
}

/** @param {App} app @param {Exclude<Resultado, {estado: "OK"}>} r */
function sinOpciones(app, r) {
  const { prefs } = app.estado;
  const nombre = (/** @type {string} */ c) => app.secciones.find((s) => s.codasig === c)?.asignatura ?? c;
  const hayFiltros = prefs.fijas.length > 0 || prefs.excluidas.length > 0 || prefs.evitados.length > 0;
  // Con filtros, la salida son los chips
  const salida = !hayFiltros && h("a", { href: "#materias", class: "boton secundario" }, "Cambiar materias");

  if (r.estado === "FALTAN") {
    return h("div", { class: "tarjeta pendiente" },
      h("h3", { class: "error" }, "No quedan secciones"),
      h("p", {}, r.faltan.map(nombre).join(", ")),
      salida);
  }
  const titulo = r.parcial ? `Sin horario en ${MS_MAX / 1000} s` : "Sin horario posible";
  const choques = r.choques.map(([a, b]) => h("li", {}, `${nombre(a)} y ${nombre(b)} chocan siempre`));
  return h("div", { class: "tarjeta pendiente" },
    h("h3", { class: "error" }, titulo),
    choques.length > 0 && h("ul", {}, choques),
    salida);
}

/** @type {((x: number) => void) | null} */
let moverCarrusel = null;

/** @param {App} app @param {Extract<Resultado, {estado: "OK"}>} r */
function pintarOpciones(app, r) {
  const { requeridas } = app.estado;
  const total = r.opciones.length;
  app.opcion = Math.min(app.opcion, total - 1);
  const tono = new Map(requeridas.map((c, i) => [c, Math.round((i * 360) / requeridas.length)]));

  const diapositivas = r.opciones.map((o, i) => h("section", {
    class: "tarjeta diapositiva",
    "aria-roledescription": "opción",
    "aria-label": `Opción ${i + 1} de ${total}`,
  }, grilla(o.secciones, tono, (s, _, celda) => inspeccionar(app, o, s, celda, tono)), porDia(o.secciones, tono)));
  const carrusel = h("div", {
    class: "carrusel",
    tabindex: 0,
    "aria-roledescription": "carrusel",
    "aria-label": "Opciones de horario",
  }, diapositivas);

  /** @param {string} etiqueta @param {number} salto */
  const flecha = (etiqueta, salto) => /** @type {HTMLButtonElement} */ (h("button", {
    type: "button",
    class: "secundario",
    "aria-label": etiqueta,
    onclick: () => irAOpcion(app, app.opcion + salto),
  }));
  const anterior = flecha("Opción anterior", -1);
  const siguiente = flecha("Opción siguiente", +1);
  const numero = rodante(String(total).length);
  const cDias = cifra("día", "días");
  const cHuecos = cifra("hueco", "huecos");
  const materias = h("div", { class: "tarjeta materias-opcion" });

  // Alto de la opción visible, no de la más alta.
  const alto = new ResizeObserver(([e]) => {
    const cs = getComputedStyle(carrusel);
    const relleno = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    carrusel.style.height = `${/** @type {HTMLElement} */ (e.target).offsetHeight + relleno}px`;
  });

  /** Sin reconstruir el carrusel. @param {number} i */
  const verOpcion = (i) => {
    app.opcion = i;
    diapositivas.forEach((d, k) => d.classList.toggle("actual", k === i));
    alto.disconnect();
    alto.observe(diapositivas[i]);
    const o = r.opciones[i];
    anterior.disabled = i === 0;
    siguiente.disabled = i === total - 1;
    numero.poner(i + 1);
    cDias.poner(o.detalle.dias);
    cHuecos.poner(o.detalle.huecos);
    materias.replaceChildren(...tablaMaterias(app, o, tono));
    resaltarCambios(app, o, diapositivas[i]);
  };

  moverCarrusel = animarCarrusel(carrusel, diapositivas, () => app.opcion, verOpcion);

  const aviso = r.parcial
    && h("p", { class: "aviso" }, `Búsqueda cortada a los ${MS_MAX / 1000} s: puede haber opciones mejores.`);
  const de = ` de ${total}${total === K_POR_DEFECTO ? "+" : ""}`;
  pintar(app,
    aviso,
    h("div", { class: "horario-cabeza" },
      h("div", { class: "navegar" },
        anterior,
        h("p", { role: "status" },
          h("span", { class: "oculto" }, "Opción "),
          h("b", {}, numero.el, h("small", {}, de))),
        siguiente),
      h("ul", { class: "cifras", role: "list" }, cDias.el, cHuecos.el)),
    carrusel,
    materias);

  verOpcion(app.opcion);
  carrusel.scrollLeft = diapositivas[app.opcion].offsetLeft - diapositivas[0].offsetLeft;
}

/** Íconos de 16 px, trazo. */
const ICONOS = {
  fijar: '<path d="M8 10.5V14"/><path d="M5.5 2.5h5M6.5 2.5v3.25L4.5 8v1.5h7V8L9.5 5.75V2.5"/>',
};

/** @param {keyof typeof ICONOS} nombre */
function icono(nombre) {
  const el = h("span", { class: "icono", "aria-hidden": "true" });
  el.innerHTML = `<svg viewBox="0 0 16 16">${ICONOS[nombre]}</svg>`;
  return el;
}

/** Fijada: solo se suelta desde el inspector o el chip de Ajustar. */
const marcaFija = () => h("span", { class: "marca-fija", title: "Fijada" },
  icono("fijar"), h("span", { class: "oculto" }, "fijada"));

/**
 * Anima solo las clases que cambiaron respecto a la opción anterior.
 * @param {App} app @param {Opcion} o @param {HTMLElement} diapositiva
 */
function resaltarCambios(app, o, diapositiva) {
  const actuales = new Set(o.secciones.map((s) => s.codhora));
  const antes = app.mostradas;
  const distintas = antes ? [...actuales].filter((c) => !antes.has(c)) : [];
  app.mostradas = actuales;
  if (!distintas.length || distintas.length === actuales.size) return;
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (diapositiva.querySelectorAll(".clase"))) {
    el.classList.remove("nueva");
    if (!distintas.includes(Number(el.dataset.codhora))) continue;
    void el.offsetWidth; // reinicia la animación
    el.classList.add("nueva");
  }
}

/**
 * El scroll actualiza el resto.
 * @param {App} app @param {number} i
 */
function irAOpcion(app, i) {
  const diapositivas = document.querySelectorAll("#contenido-opciones .diapositiva");
  const d = /** @type {HTMLElement | undefined} */ (diapositivas[i]);
  if (!d || !moverCarrusel) return;
  moverCarrusel(d.offsetLeft - /** @type {HTMLElement} */ (diapositivas[0]).offsetLeft);
}

// ---------- Tabla de materias de la opción ----------

/** Texto y clase de cada columna. */
const COLUMNAS = [
  ["Asignatura"],
  ["Grupo", "c-grupo"],
  ["C.Hora", "c-hora"],
  ["Profesor", "c-profe"],
];

/** @param {App} app @param {Opcion} o @param {Map<string, number>} tono */
function tablaMaterias(app, o, tono) {
  const filas = o.secciones.map((s) => h("tr", {},
    celdaAsignatura(s, tono),
    h("td", { class: "codigo", title: s.sub ? `Subgrupo ${s.sub}` : null }, s.grupo || "—", s.sub && ` (${s.sub})`),
    h("td", { class: "codigo" }, codigo(s) || "—", app.estado.prefs.fijas.includes(s.codhora) && marcaFija()),
    h("td", {}, nombrePropio(s.profesor))));
  // Anchos fijos: al pasar de opción las columnas no bailan con el largo de los nombres
  return [
    h("div", { class: "tabla" }, h("table", { class: "tabla-materias" },
      h("thead", {}, h("tr", {}, COLUMNAS.map(([t, c]) => h("th", { scope: "col", class: c }, t)))),
      h("tbody", {}, filas))),
  ];
}

/** @param {Seccion} s @param {Map<string, number>} tono */
const celdaAsignatura = (s, tono) => h("td", {},
  punto(tono.get(s.codasig)),
  s.asignatura,
  h("small", { class: "sigla-leyenda", "aria-hidden": "true" }, ` ${sigla(s.asignatura)}`));

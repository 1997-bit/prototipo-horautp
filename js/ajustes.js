// @ts-check
// Ajustes del dispositivo, como data-* en <html>.

import { iniciarUnaTecla, ponerUnaTecla, unaTecla } from "./atajos.js";
import { usar24 } from "./periodos.js";
import { h } from "./dom.js";

const raiz = document.documentElement;

/** @type {[string, string, string][]} valor, nombre, descripción */
const VISTAS = [
  ["compacta", "Compacta", "Toda la semana en la pantalla, con siglas."],
  ["lateral", "Deslizable", "La grilla completa; deslizas los días con la hora fija."],
  ["lista", "Lista", "Las clases de cada día, una debajo de otra."],
];

/** @param {number} x @param {number} y @param {number} w @param {number} alto @param {number | null} [tono] sin tono: gris */
const r = (x, y, w, alto, tono) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${alto}" rx="1.5"${tono == null ? ' class="g"' : ` style="--h:${tono}"`}/>`;

/** @type {Record<string, string>} */
const DIBUJOS = {
  compacta: [
    ...[0, 1, 2, 3, 4].map((i) => r(3 + i * 16, 2, 6, 2.5)),
    ...[[0, 0, 2, 25], [1, 1, 1, 250], [2, 0, 1, 150], [3, 2, 2, 25], [4, 1, 1, 300], [0, 3, 1, 150], [2, 3, 2, 250], [1, 4, 1, 300]]
      .map(([d, f, n, t]) => r(2 + d * 16, 8 + f * 9.5, 14, n * 9.5 - 1.5, t)),
  ].join(""),
  lateral: `<mask id="mini-borde"><rect width="84" height="56" style="fill:url(#mini-fundido)"/></mask>
    <linearGradient id="mini-fundido"><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    ${[0, 1, 2, 3].map((i) => r(2, 9 + i * 12, 7, 2.5)).join("")}
    <g mask="url(#mini-borde)">${[
      ...[0, 1, 2].map((i) => r(14 + i * 27, 2, 10, 2.5)),
      ...[[0, 0, 2, 25], [1, 1, 1, 250], [2, 0, 1, 150], [0, 2, 1, 300], [1, 2, 2, 25], [2, 2, 1, 250]]
        .map(([d, f, n, t]) => r(13 + d * 27, 8 + f * 15.5, 24, n * 15.5 - 2, t)),
    ].join("")}</g>`,
  lista: [[2, null], [8, 25], [18, 250], [30, null], [36, 150], [46, 300]]
    .map(([y, t]) => t == null ? r(2, y, 14, 2.5)
      : `<rect x="2" y="${y}" width="80" height="8" rx="2" class="fila"/>${r(4, y + 2, 2.5, 4, t)}${r(9, y + 3, 30, 2)}`)
    .join(""),
};

/** @param {string} fondo @param {string} tarjeta @param {string} linea @param {number} luz */
const ventana = (fondo, tarjeta, linea, luz) => `<rect width="84" height="56" style="fill:${fondo}"/>
  <rect x="8" y="8" width="68" height="40" rx="4" style="fill:${tarjeta}"/>
  <rect x="14" y="14" width="22" height="3" rx="1.5" style="fill:${linea}"/>
  <rect x="14" y="22" width="26" height="9" rx="2" style="fill:oklch(${luz}% .08 25)"/>
  <rect x="44" y="22" width="26" height="9" rx="2" style="fill:oklch(${luz}% .08 250)"/>
  <rect x="14" y="34" width="26" height="9" rx="2" style="fill:oklch(${luz}% .08 150)"/>`;
const CLARO = ventana("#f4f4f4", "#fff", "#d6d6d6", 90);
const OSCURO = ventana("#000", "#161616", "#3a3a3a", 35);

/** @param {string} a @param {string} b */
const horas = (a, b) => `<text x="42" y="24" class="t">${a}</text><text x="42" y="44" class="t">${b}</text>`;

/** @typedef {{ clave: string, dato: string, leyenda: string, aplicar?: (v: string) => void, opciones: [string, string, string, string][] }} Ajuste */
/** @type {Ajuste[]} opciones: valor, nombre, descripción, dibujo. La primera es la de fábrica */
const AJUSTES = [
  {
    clave: "horautp:tema", dato: "tema", leyenda: "Tema",
    aplicar: (v) => {
      for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
        const meta = /** @type {HTMLMetaElement} */ (m);
        meta.dataset.original ??= meta.content;
        meta.content = v === "claro" ? "#f4f4f4" : v === "oscuro" ? "#000000" : meta.dataset.original;
      }
    },
    opciones: [
      ["sistema", "Sistema", "Claro u oscuro según el dispositivo.",
        `<clipPath id="mini-mitad"><rect width="42" height="56"/></clipPath>${OSCURO}<g clip-path="url(#mini-mitad)">${CLARO}</g>`],
      ["claro", "Claro", "Siempre claro.", CLARO],
      ["oscuro", "Oscuro", "Siempre oscuro.", OSCURO],
    ],
  },
  {
    clave: "horautp:vista", dato: "vista", leyenda: "Horario en el celular",
    opciones: VISTAS.map(([v, nombre, texto]) => [v, nombre, texto, DIBUJOS[v]]),
  },
  {
    clave: "horautp:hora", dato: "hora", leyenda: "Hora",
    aplicar: (v) => usar24(v === "24"),
    opciones: [
      ["12", "12 horas", "7:00am, 1:00pm.", horas("7:00am", "1:00pm")],
      ["24", "24 horas", "7:00, 13:00.", horas("7:00", "13:00")],
    ],
  },
];

/** @param {Ajuste} a @param {string} v */
function poner(a, v) {
  if (!a.opciones.some(([x]) => x === v)) v = a.opciones[0][0];
  raiz.dataset[a.dato] = v;
  a.aplicar?.(v);
}

/** @param {Ajuste} a */
function grupo(a) {
  const actual = raiz.dataset[a.dato];
  return h("fieldset", { class: "ajuste" },
    h("legend", {}, a.leyenda),
    h("div", { class: `vistas vistas-${a.opciones.length}` },
      a.opciones.map(([v, nombre, texto, svg]) => {
        const dibujo = h("span", { class: `mini mini-${a.dato}`, "aria-hidden": "true" });
        dibujo.innerHTML = `<svg viewBox="0 0 84 56">${svg}</svg>`;
        return h("label", { class: "opcion-tarjeta vista", title: texto },
          h("input", {
            type: "radio", name: a.dato, value: v, checked: v === actual,
            onchange: () => {
              poner(a, v);
              try { localStorage.setItem(a.clave, v); } catch { /* modo privado */ }
              document.dispatchEvent(new CustomEvent("ajuste", { detail: a.dato }));
            },
          }),
          dibujo, nombre);
      })));
}

const MOVIMIENTO = "horautp:movimiento";
const sistemaQuieto = matchMedia("(prefers-reduced-motion: reduce)");
export const quieto = () => sistemaQuieto.matches || raiz.dataset.movimiento === "reducido";
/** @param {boolean} si */
function reducir(si) {
  if (si) raiz.dataset.movimiento = "reducido";
  else delete raiz.dataset.movimiento;
}

/** @param {string} nombre @param {boolean} si @param {(si: boolean) => void} alCambiar @param {string} [fijo] por qué no se puede cambiar */
const interruptor = (nombre, si, alCambiar, fijo) => h("label", { class: "ajuste-switch", title: fijo },
  h("span", {}, nombre),
  h("input", {
    type: "checkbox", role: "switch", class: "switch", checked: si, disabled: !!fijo,
    onchange: (/** @type {Event} */ e) => alCambiar(/** @type {HTMLInputElement} */ (e.target).checked),
  }));

const conTeclado = matchMedia("(hover: hover) and (pointer: fine)");

function movimientoYTeclado() {
  return h("fieldset", { class: "ajuste" },
    h("legend", {}, conTeclado.matches ? "Movimiento y teclado" : "Movimiento"),
    interruptor("Reducir movimiento", quieto(), (si) => {
      reducir(si);
      try { localStorage.setItem(MOVIMIENTO, si ? "reducido" : "normal"); } catch { /* modo privado */ }
    }, sistemaQuieto.matches ? "Tu dispositivo ya lo pide" : undefined),
    conTeclado.matches && interruptor("Atajos de una tecla", unaTecla(), ponerUnaTecla));
}

function llenar() {
  document.getElementById("contenido-ajustes")?.replaceChildren(
    ...AJUSTES.map(grupo),
    movimientoYTeclado(),
    h("fieldset", { class: "ajuste" },
      h("legend", {}, "Datos"),
      h("div", { class: "ajuste-fila" },
        h("span", {}, "Borrar datos"),
        h("button", { type: "button", class: "secundario chico peligro-suave", commandfor: "dialogo-borrar", command: "show-modal" }, "Borrar…"))));
}

/** Los ajustes se quedan. */
function borrarDatos() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("horautp:") && !AJUSTES.some((a) => a.clave === k) && k !== MOVIMIENTO && k !== "horautp:atajos") localStorage.removeItem(k);
    }
  } catch { /* modo privado */ }
  location.replace(location.pathname);
}

// Arrastrar la hoja hacia abajo la cierra
const enCelular = matchMedia("(width < 37.5rem)");
document.addEventListener("pointerdown", (e) => {
  if (!enCelular.matches || e.button || !(e.target instanceof Element)) return;
  if (!e.target.closest(".dialogo-agarre, .dialogo h2")) return;
  const d = /** @type {HTMLDialogElement | null} */ (e.target.closest("dialog.dialogo[open]"));
  if (!d) return;
  const inicio = e.clientY;
  let dy = 0, velocidad = 0, ultimo = { y: e.clientY, t: e.timeStamp };
  d.setPointerCapture(e.pointerId);
  d.dataset.arrastrando = "";
  /** @param {PointerEvent} ev */
  const mover = (ev) => {
    const delta = ev.clientY - inicio;
    dy = delta > 0 ? delta : delta / 4;
    d.style.translate = `0 ${dy}px`;
    velocidad = (ev.clientY - ultimo.y) / Math.max(1, ev.timeStamp - ultimo.t);
    ultimo = { y: ev.clientY, t: ev.timeStamp };
  };
  const soltar = () => {
    d.removeEventListener("pointermove", mover);
    d.removeEventListener("pointerup", soltar);
    d.removeEventListener("pointercancel", soltar);
    delete d.dataset.arrastrando;
    d.style.translate = "";
    // px/ms
    if (dy > d.offsetHeight / 3 || (velocidad > 0.5 && dy > 24)) d.close();
  };
  d.addEventListener("pointermove", mover);
  d.addEventListener("pointerup", soltar);
  d.addEventListener("pointercancel", soltar);
});

export function iniciarAjustes() {
  for (const a of AJUSTES) {
    let v = a.opciones[0][0];
    try { v = localStorage.getItem(a.clave) ?? v; } catch { /* modo privado */ }
    poner(a, v);
  }
  try { reducir(localStorage.getItem(MOVIMIENTO) === "reducido"); } catch { /* modo privado */ }
  iniciarUnaTecla();
  document.getElementById("dialogo-ajustes")?.addEventListener("command", llenar);
  const borrar = /** @type {HTMLDialogElement} */ (document.getElementById("dialogo-borrar"));
  borrar.addEventListener("close", () => { if (borrar.returnValue === "borrar") borrarDatos(); });
}

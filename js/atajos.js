// @ts-check
// data-atajo="g m": espacio = secuencia, "+" = juntas, Mod = Ctrl o ⌘.

import { guardarLocal, leerLocal } from "./dom.js";

/** @typedef {{texto: string, si?: () => unknown, accion: () => void}} Atajo */

const raiz = document.documentElement;
const CLAVE = "horautp:atajos";

const plataforma = /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.userAgent;
export const MAC = /mac|iphone|ipad/i.test(plataforma);
/** @type {Record<string, string>} */
const FLECHAS = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
const RE_LETRA_FINAL = /(^|\+|⌘)(\p{Ll})$/u;
const RE_LETRA = /^\p{L}$/u;
const mayus = (/** @type {string} */ k) => k.replace(RE_LETRA_FINAL, (_, a, b) => a + b.toUpperCase());
const verTecla = (/** @type {string} */ k) => FLECHAS[k] ?? mayus(k.replace("Mod+", MAC ? "⌘" : "Ctrl+"));

const esCampo = (/** @type {Element} */ el) => el.matches("input, textarea, select, [contenteditable]");
// WCAG 2.1.4
export const unaTecla = () => raiz.dataset.atajos !== "no";
const permitido = (/** @type {string} */ teclas) => unaTecla() || teclas.startsWith("Mod+");

/** @type {Record<string, Atajo>} */
let extra = {};

const deElementos = () => [...document.querySelectorAll("[data-atajo]")]
  .filter((el) => !(/** @type {any} */ (el).disabled) && !el.closest("[hidden], [inert]"))
  .map((el) => {
    const h = /** @type {HTMLElement} */ (el);
    return {
      teclas: h.dataset.atajo ?? "",
      texto: h.dataset.atajoTexto || h.textContent?.trim() || "",
      accion: () => (esCampo(h) ? h.focus() : h.click()),
    };
  });

const todos = () => [
  ...deElementos(),
  ...Object.entries(extra).filter(([, a]) => !a.si || a.si()).map(([teclas, a]) => ({ teclas, ...a })),
].filter((a) => permitido(a.teclas));

/** @param {KeyboardEvent} e Minúsculas: con Bloq Mayús sigue igual */
function tecla(e) {
  if (["Shift", "Control", "Meta", "Alt", "CapsLock"].includes(e.key) || e.altKey) return null;
  let k = e.key === " " ? "Space" : e.key;
  if (RE_LETRA.test(k)) k = k.toLowerCase();
  return (e.ctrlKey || e.metaKey ? "Mod+" : "") + k;
}

/** @type {string[]} */
let pendiente = [];
let espera = 0;
const reiniciar = () => { pendiente = []; clearTimeout(espera); };

/** @param {KeyboardEvent} e */
function alTeclear(e) {
  // IME o tecla muerta
  if (e.isComposing || e.key === "Dead") return;
  const t = tecla(e);
  if (!t || e.defaultPrevented || document.querySelector("dialog[open]")) return;
  if (t === "Escape" && pendiente.length) {
    reiniciar();
    return;
  }
  if (e.repeat && pendiente.length) {
    e.preventDefault();
    return;
  }
  const destino = /** @type {Element} */ (e.target);
  if (esCampo(destino) && !t.startsWith("Mod+")) return;
  if (!pendiente.length && ["Space", "Enter"].includes(t) && destino.closest("a, button, summary")) return;
  pendiente.push(t);
  const secuencia = pendiente.join(" ");
  const lista = todos();
  const exacto = lista.find((a) => a.teclas === secuencia);
  if (exacto) {
    e.preventDefault();
    reiniciar();
    exacto.accion();
    return;
  }
  if (lista.some((a) => a.teclas.startsWith(`${secuencia} `))) {
    e.preventDefault();
    clearTimeout(espera);
    espera = setTimeout(reiniciar, 1000);
    return;
  }
  reiniciar();
}

// ARIA no admite secuencias: esas van solo en title.
function anotar() {
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-atajo]"))) {
    const teclas = el.dataset.atajo ?? "";
    el.dataset.titleBase ??= el.title;
    const base = el.dataset.titleBase;
    const visto = teclas.split(" ").map(verTecla).join(" ");
    const activo = permitido(teclas);
    el.title = activo ? (base ? `${base} (${visto})` : `Atajo: ${visto}`) : base;
    if (activo && !teclas.includes(" ")) {
      el.setAttribute("aria-keyshortcuts", mayus(teclas.replace("Mod+", MAC ? "Meta+" : "Control+")));
    } else {
      el.removeAttribute("aria-keyshortcuts");
    }
  }
}

/** @param {string} tag @param {Record<string, any>} [props] @param {...(Node | string)} hijos */
const nuevo = (tag, props = {}, ...hijos) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...hijos);
  return el;
};

/** @param {string} teclas */
function seccionDe(teclas) {
  if (teclas.startsWith("g ")) return "Ir a";
  if (teclas === "?" || teclas.startsWith("Mod+")) return "General";
  return "Este paso";
}

function secciones() {
  /** @type {Record<string, {teclas: string, texto: string}[]>} */
  const grupos = { "Ir a": [], "Este paso": [], "General": [] };
  const vistos = new Set();
  for (const a of todos()) {
    if (vistos.has(a.teclas)) continue;
    vistos.add(a.teclas);
    grupos[seccionDe(a.teclas)].push(a);
  }
  return Object.entries(grupos).filter(([, l]) => l.length).flatMap(([nombre, l]) => {
    const dl = nuevo("dl", { className: "atajos-lista" });
    for (const { teclas, texto } of l) {
      const kbds = teclas.split(" ").map((k) => nuevo("kbd", { textContent: verTecla(k) }));
      dl.append(nuevo("dt", {}, ...kbds), nuevo("dd", { textContent: texto }));
    }
    return [nuevo("h3", { textContent: nombre }), dl];
  });
}

const dialogo = /** @type {HTMLDialogElement} */ (document.getElementById("dialogo-atajos"));
const llenar = () => document.getElementById("contenido-atajos")?.replaceChildren(...secciones());
function ayuda() {
  llenar();
  dialogo.showModal();
}

export function iniciarUnaTecla() {
  if (leerLocal(CLAVE) === "no") raiz.dataset.atajos = "no";
}

/** @param {boolean} si */
export function ponerUnaTecla(si) {
  if (si) delete raiz.dataset.atajos;
  else raiz.dataset.atajos = "no";
  guardarLocal(CLAVE, si ? "si" : "no");
  anotar();
}

/** Los que no tienen elemento. @param {Record<string, Atajo>} [propios] */
export function iniciarAtajos(propios = {}) {
  extra = { "?": { texto: "Ayuda de atajos", accion: ayuda }, ...propios };
  document.addEventListener("keydown", alTeclear);
  document.addEventListener("pointerdown", () => {
    if (pendiente.length) reiniciar();
  });
  dialogo.addEventListener("command", llenar);
  anotar();
}

// @ts-check

import { iniciarAgentes } from "./agentes.js";
import { iniciarAjustes, quieto } from "./ajustes.js";
import { MAC, iniciarAtajos } from "./atajos.js";
import { cargar, escucharOtrasPestanas } from "./estado.js";
import { construirSecciones } from "./modelo.js";
import {
  descartar, deshacerUltimo, hayDeshacer, iniciarDatos, irAOpcion, renderMaterias, renderOpciones,
} from "./ui.js";

// iOS: sin esto no aplica :active
document.addEventListener("touchstart", () => {}, { passive: true });

// Respaldo de commandfor/command
if (!("command" in HTMLButtonElement.prototype)) {
  document.addEventListener("click", (e) => {
    const b = e.target instanceof Element ? e.target.closest("button[commandfor]") : null;
    const d = b && document.getElementById(b.getAttribute("commandfor") ?? "");
    if (!(d instanceof HTMLDialogElement) || !d.dispatchEvent(new Event("command", { cancelable: true }))) return;
    const orden = b?.getAttribute("command");
    if (orden === "show-modal" && !d.open) d.showModal();
    else if (orden === "close") d.close();
  });
}
// Respaldo de closedby="any"
if (!("closedBy" in HTMLDialogElement.prototype)) {
  document.addEventListener("click", (e) => {
    if (e.target instanceof HTMLDialogElement && e.target.getAttribute("closedby") === "any") e.target.close();
  });
}

iniciarAjustes();
const estado = cargar();
/** @type {import("./ui.js").App} */
const app = { estado, secciones: construirSecciones(estado.grupos), resultado: null, opcion: 0, pedido: 0, enCurso: 0, mostradas: null };

/** @type {Record<string, (app: import("./ui.js").App) => void>} */
const PASOS = {
  materias: renderMaterias,
  opciones: renderOpciones,
};
// Enlaces viejos
/** @type {Record<string, string>} */
const ANTES = { datos: "materias", preferencias: "opciones" };

const ORDEN = Object.keys(PASOS);
const ULTIMO = "horautp:paso";
const pasos = /** @type {HTMLElement} */ (document.getElementById("pasos"));

// Píldora: un resorte por borde. Elemento real, no ::before: Safari no lo repintaba.
const pildora = /** @type {HTMLElement} */ (pasos.querySelector(".pildora"));
const enlaces = /** @type {HTMLElement[]} */ ([...pasos.querySelectorAll("a")]);
const FIRME = { k: 520, c: 38 };
const BLANDO = { k: 240, c: 27 };
const borde = () => ({ x: 0, v: 0, meta: 0, ...FIRME });
const izq = borde(), der = borde();
let cuadro = 0, ultimo = 0, colocada = false;

function pintar() {
  const rapidez = (Math.abs(izq.v) + Math.abs(der.v)) / 2; // px/s
  pildora.style.translate = `${izq.x}px 0`;
  pildora.style.width = `${Math.max(0, der.x - izq.x)}px`;
  pildora.style.filter = rapidez > 1 ? `blur(${Math.min(1.5, rapidez / 2500).toFixed(2)}px)` : "";
  for (const a of enlaces) {
    const tapado = Math.min(der.x, a.offsetLeft + a.offsetWidth) - Math.max(izq.x, a.offsetLeft);
    const t = Math.max(0, Math.min(1, tapado / a.offsetWidth));
    a.style.color = `color-mix(in srgb, var(--invertido-texto) ${Math.round(t * 100)}%, var(--tenue))`;
  }
}

/** @param {number} t */
function animar(t) {
  const dt = Math.min(0.064, (t - ultimo) / 1000);
  ultimo = t;
  const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
  for (const b of [izq, der]) {
    for (let k = 0; k < n; k++) {
      b.v += (-b.k * (b.x - b.meta) - b.c * b.v) * h;
      b.x += b.v * h;
    }
  }
  const quieta = [izq, der].every((b) => Math.abs(b.x - b.meta) < 0.3 && Math.abs(b.v) < 5);
  if (quieta) for (const b of [izq, der]) { b.x = b.meta; b.v = 0; }
  pintar();
  cuadro = quieta ? 0 : requestAnimationFrame(animar);
}

/** @param {boolean} [animada] */
function moverPildora(animada = true) {
  const a = pasos.querySelector("a[aria-current]");
  if (!(a instanceof HTMLElement)) return;
  const l = a.offsetLeft, r = l + a.offsetWidth;
  if (l === izq.meta && r === der.meta && colocada) return;
  a.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (!colocada || !animada || quieto()) {
    izq.x = izq.meta = l;
    der.x = der.meta = r;
    izq.v = der.v = 0;
    colocada = true;
    pasos.classList.add("medido");
    pintar();
    return;
  }
  const derecha = l > izq.meta;
  Object.assign(derecha ? der : izq, FIRME);
  Object.assign(derecha ? izq : der, BLANDO);
  izq.meta = l;
  der.meta = r;
  if (!cuadro) {
    ultimo = performance.now();
    cuadro = requestAnimationFrame(animar);
  }
}
new ResizeObserver(() => { if (!cuadro) moverPildora(false); }).observe(pasos);

function rutear() {
  const id = location.hash.slice(1);
  if (id in ANTES) {
    history.replaceState(null, "", `#${ANTES[id]}`);
    return rutear();
  }
  const paso = id in PASOS ? id : "materias";
  try { localStorage.setItem(ULTIMO, paso); } catch { /* modo privado */ }
  for (const s of document.querySelectorAll("main > section")) s.toggleAttribute("hidden", s.id !== paso);
  for (const a of document.querySelectorAll("#pasos a")) {
    if (a.getAttribute("href") === `#${paso}`) a.setAttribute("aria-current", "step");
    else a.removeAttribute("aria-current");
  }
  moverPildora();
  PASOS[paso](app);
  document.getElementById(`t-${paso}`)?.focus({ preventScroll: true });
  scrollTo(0, 0);
}

const enOpciones = () => location.hash === "#opciones" && !document.activeElement?.closest(".carrusel");
iniciarAtajos({
  ArrowLeft: { texto: "Opción anterior", si: enOpciones, accion: () => irAOpcion(app, app.opcion - 1) },
  ArrowRight: { texto: "Opción siguiente", si: enOpciones, accion: () => irAOpcion(app, app.opcion + 1) },
  "Mod+z": { texto: "Deshacer", si: () => hayDeshacer() && !document.activeElement?.matches("textarea, input:not([type=checkbox], [type=radio])"), accion: deshacerUltimo },
});

if (MAC) {
  const pegar = /** @type {HTMLTextAreaElement} */ (document.getElementById("pegar"));
  pegar.placeholder = pegar.placeholder.replaceAll("Ctrl+", "⌘");
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

iniciarDatos(app);
iniciarAgentes(app);
if (!location.hash && estado.grupos.length) {
  let ultimo = null;
  try { ultimo = localStorage.getItem(ULTIMO); } catch { /* modo privado */ }
  if (ultimo && ultimo in PASOS) for (const p of ORDEN.slice(1, ORDEN.indexOf(ultimo) + 1)) history.pushState(null, "", `#${p}`);
}
// Volver a un paso es history.back(), no apilar.
const nav = /** @type {any} */ (window).navigation;
if (nav) {
  const pasoDe = (/** @type {string} */ url) => url.split("#")[1] || "materias";
  nav.addEventListener("navigate", (/** @type {any} */ e) => {
    if (e.navigationType !== "push" || !e.hashChange || !e.cancelable) return;
    const destino = pasoDe(e.destination.url);
    const antes = nav.entries().slice(0, nav.currentEntry.index).reverse();
    const ya = antes.find((/** @type {any} */ x) => x.sameDocument && x.url && pasoDe(x.url) === destino);
    if (!ya) return;
    e.preventDefault();
    nav.traverseTo(ya.key);
  });
}
addEventListener("hashchange", rutear);
// Otra pestaña guardó: evitar pisarla.
escucharOtrasPestanas(() => {
  Object.assign(estado, cargar());
  descartar(app);
  const paso = location.hash.slice(1);
  PASOS[paso in PASOS ? paso : "materias"](app);
});
document.addEventListener("ajuste", (e) => {
  if (/** @type {CustomEvent} */ (e).detail !== "hora") return;
  const paso = location.hash.slice(1);
  PASOS[paso in PASOS ? paso : "materias"](app);
});
rutear();

// Umbral: rebote del scroll en iOS.
let yAntes = scrollY;
addEventListener("scroll", () => {
  const y = scrollY;
  if (Math.abs(y - yAntes) < 8) return;
  document.documentElement.classList.toggle("bajando", y > yAntes && y > 40);
  yAntes = y;
}, { passive: true });

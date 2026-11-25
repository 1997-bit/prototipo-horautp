// @ts-check
// Carrusel de opciones: scroll con resorte y arrastre con mouse.

import { quieto } from "./ajustes.js";
import { FIRME, avanzar, dtEntre } from "./resorte.js";

const INERCIA = 250; // ms
const UMBRAL_ARRASTRE = 4; // px

/**
 * Resorte: a diferencia de "smooth", conserva la velocidad.
 * @param {HTMLElement} el
 */
function resorteScroll(el) {
  const r = { x: 0, v: 0, meta: 0, ...FIRME };
  let cuadro = 0, ultimo = 0;
  const detener = () => {
    if (!cuadro) return;
    cancelAnimationFrame(cuadro);
    cuadro = 0;
    el.classList.remove("animando");
  };
  /** @param {number} t */
  const cuadroSiguiente = (t) => {
    avanzar(r, dtEntre(ultimo, t));
    ultimo = t;
    el.scrollLeft = r.x;
    if (Math.abs(r.x - r.meta) < 0.5 && Math.abs(r.v) < 10) {
      el.scrollLeft = r.meta;
      detener();
      return;
    }
    cuadro = requestAnimationFrame(cuadroSiguiente);
  };
  /** @param {number} d @param {number} [v0] velocidad inicial, px/s */
  const ir = (d, v0) => {
    if (quieto()) {
      el.scrollLeft = d;
      return;
    }
    if (!cuadro) {
      r.x = el.scrollLeft;
      r.v = 0;
      ultimo = performance.now();
      el.classList.add("animando"); // el snap pelearía con el resorte
      cuadro = requestAnimationFrame(cuadroSiguiente);
    }
    if (v0 !== undefined) r.v = v0;
    r.meta = d;
  };
  return { ir, detener };
}

/**
 * Avisa con `alCambiar` cuando otra diapositiva queda al frente.
 * @param {HTMLElement} carrusel @param {HTMLElement[]} diapositivas
 * @param {() => number} actual @param {(i: number) => void} alCambiar
 * @returns {(x: number) => void} lleva el scroll a x, con resorte
 */
export function animarCarrusel(carrusel, diapositivas, actual, alCambiar) {
  const total = diapositivas.length;
  const resorte = resorteScroll(carrusel);
  const paso = () => (total > 1 ? diapositivas[1].offsetLeft - diapositivas[0].offsetLeft : 1);
  const acotar = (/** @type {number} */ i) => Math.max(0, Math.min(total - 1, i));

  let cuadro = 0;
  carrusel.addEventListener("scroll", () => {
    if (!carrusel.isConnected) return; // reemplazado con el resorte en marcha
    // overflow-y: hidden deja mover por código
    if (carrusel.scrollTop) carrusel.scrollTop = 0;
    cancelAnimationFrame(cuadro);
    cuadro = requestAnimationFrame(() => {
      const j = acotar(Math.round(carrusel.scrollLeft / paso()));
      if (j !== actual()) alCambiar(j);
    });
  }, { passive: true });

  /** @type {{x: number, izq: number, ultX: number, ultT: number, v: number, desde: number} | null} */
  let arrastre = null;
  carrusel.addEventListener("pointerdown", (e) => {
    resorte.detener();
    if (e.pointerType !== "mouse" || e.button !== 0 || total < 2) return;
    arrastre = { x: e.clientX, izq: carrusel.scrollLeft, ultX: e.clientX, ultT: e.timeStamp, v: 0, desde: actual() };
  });
  carrusel.addEventListener("wheel", () => resorte.detener(), { passive: true });
  carrusel.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    if (!carrusel.classList.contains("arrastrando")) {
      if (Math.abs(dx) < UMBRAL_ARRASTRE) return;
      carrusel.classList.add("arrastrando");
      carrusel.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - arrastre.ultT;
    if (dt > 0) arrastre.v = 0.8 * ((e.clientX - arrastre.ultX) / dt) + 0.2 * arrastre.v; // px/ms
    arrastre.ultX = e.clientX;
    arrastre.ultT = e.timeStamp;
    carrusel.scrollLeft = arrastre.izq - dx;
  });
  // Con la inercia avanza a lo más una opción.
  const soltar = () => {
    if (!arrastre) return;
    const { v, desde } = arrastre;
    arrastre = null;
    if (!carrusel.classList.contains("arrastrando")) return;
    carrusel.classList.remove("arrastrando");
    const proyectada = Math.round((carrusel.scrollLeft - v * INERCIA) / paso());
    const destino = acotar(Math.max(desde - 1, Math.min(desde + 1, proyectada)));
    resorte.ir(destino * paso(), -v * 1000);
  };
  carrusel.addEventListener("pointerup", soltar);
  carrusel.addEventListener("pointercancel", soltar);

  return resorte.ir;
}

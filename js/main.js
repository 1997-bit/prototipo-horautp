// @ts-check
// Arranque y navegación por hash: #datos, #materias, #preferencias, #opciones, #exportar.

import { cargar } from "./estado.js";
import { construirSecciones } from "./modelo.js";
import {
  iniciarDatos, renderDatos, renderExportar, renderMaterias, renderOpciones, renderPreferencias,
} from "./ui.js";

const estado = cargar();
/** @type {import("./ui.js").App} */
const app = { estado, secciones: construirSecciones(estado.grupos), resultado: null, opcion: 0, pedido: 0, enCurso: 0 };

/** @type {Record<string, (app: import("./ui.js").App) => void>} */
const PASOS = {
  datos: renderDatos,
  materias: renderMaterias,
  preferencias: renderPreferencias,
  opciones: renderOpciones,
  exportar: renderExportar,
};

function rutear() {
  const id = location.hash.slice(1);
  const paso = id in PASOS ? id : "datos";
  for (const s of document.querySelectorAll("main > section")) s.toggleAttribute("hidden", s.id !== paso);
  for (const a of document.querySelectorAll("#pasos a")) {
    if (a.getAttribute("href") === `#${paso}`) a.setAttribute("aria-current", "step");
    else a.removeAttribute("aria-current");
  }
  PASOS[paso](app);
  document.getElementById(`t-${paso}`)?.focus({ preventScroll: true });
  scrollTo(0, 0);
}

// ← → para cambiar de opción
addEventListener("keydown", (e) => {
  if (location.hash !== "#opciones" || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const total = app.resultado?.opciones.length ?? 0;
  const i = app.opcion + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0);
  if (i !== app.opcion && i >= 0 && i < total) {
    app.opcion = i;
    renderOpciones(app);
  }
});

// Uso sin conexión. Solo funciona en https o localhost; si falla, la app sigue igual.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

iniciarDatos(app);
addEventListener("hashchange", rutear);
rutear();

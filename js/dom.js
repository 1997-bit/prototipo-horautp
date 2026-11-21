// @ts-check

/** @param {any[]} hijos */
const visibles = (hijos) => hijos.flat(Infinity).filter((x) => x != null && x !== false);

/**
 * Props "on*" son eventos; las propiedades van tras los hijos (<select value>).
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...any} hijos
 */
export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  el.append(...visibles(hijos));
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== "list") /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  return el;
}

/** @param {string} id */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} id @param {...any} hijos */
export const llenar = (id, ...hijos) => $(id).replaceChildren(...visibles(hijos));

/** @param {Element} contenedor @param {string} foco valor de data-foco @param {FocusOptions} [opciones] */
export function enfocar(contenedor, foco, opciones) {
  const el = contenedor.querySelector(`[data-foco="${CSS.escape(foco)}"]`);
  /** @type {HTMLElement | null} */ (el)?.focus(opciones);
}

/** @param {Event} e */
export const marcado = (e) => /** @type {HTMLInputElement} */ (e.target).checked;

// En modo privado localStorage lanza: se sigue sin guardar.

/** @param {string} clave */
export function leerLocal(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

/** @param {string} clave @param {string} valor */
export function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch { /* modo privado */ }
}

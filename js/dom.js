// @ts-check

/**
 * Props "on*" son eventos; las propiedades van tras los hijos (<select value>).
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

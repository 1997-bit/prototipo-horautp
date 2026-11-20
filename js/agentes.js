// @ts-check
// Herramientas WebMCP; sin WebMCP, en window.horautp.

import { gruposDesdeJson, grupoDesdeHtml } from "./entrada.js";
import { listarMaterias, nombreTipo } from "./modelo.js";
import { DIAS, rangoPeriodo } from "./periodos.js";
import { K_POR_DEFECTO, reemplazos, resolver } from "./solver.js";
import { agregarGrupos, aplicar, irAOpcion } from "./ui.js";

/**
 * @typedef {import("./ui.js").App} App
 * @typedef {import("./modelo.js").Seccion} Seccion
 */

/** C.HORA (0761). @param {Seccion} s */
const cHora = (s) => (s.codhora > 0 ? String(s.codhora).padStart(4, "0") : null);

/** @param {Seccion} s */
const clases = (s) => s.bloques.map(([d, k, n, t, aula]) => [DIAS[d], rangoPeriodo(k, n), nombreTipo(t), aula].filter(Boolean).join(" · "));

/** @param {App} app */
function estado(app) {
  const { grupos, requeridas, prefs } = app.estado;
  return {
    grupos: grupos.map((g) => ({ grupo: g.grupo, periodo: g.periodo, sede: g.sede, a_mano: !!g.manual, materias: g.materias.length })),
    materias: listarMaterias(app.secciones).map((m) => ({
      codasig: m.codasig,
      asignatura: m.asignatura,
      elegida: requeridas.includes(m.codasig),
      secciones: app.secciones.filter((s) => s.codasig === m.codasig).map((s) => ({
        codhora: s.codhora, c_hora: cHora(s), grupo: s.grupo, profesor: s.profesor, clases: clases(s),
      })),
    })),
    preferencias: {
      turno: prefs.horario ?? "",
      solo_turno: !!prefs.soloTurno,
      menos_dias: !!prefs.menosDias,
      profesores_solo: prefs.solo,
      profesores_evitados: prefs.evitados,
      fijas: prefs.fijas,
      excluidas: prefs.excluidas,
    },
  };
}

const LISTA_CODHORA = { type: "array", items: { type: "integer" } };

/** @param {App} app */
function herramientas(app) {
  return [
    {
      name: "cargar_horario",
      description: "Carga el horario de un grupo de la UTP. Pasa el HTML completo de la página del portal de Matrícula "
        + "(Grupos por Asignatura → Horario del Grupo), o JSON de grupos: [{grupo, periodo, materias: [{codasig, codhora, "
        + "asignatura, profesor, email, bloques: [[dia 0=lunes, período k (7:00 + 50k min), n períodos, \"C\"|\"L\"|\"CL\", aula]]}]}]. "
        + "Se pueden cargar varios grupos; sus materias quedan elegidas. Devuelve el estado.",
      inputSchema: {
        type: "object",
        properties: {
          html: { type: "string", description: "HTML de la página Horario del Grupo" },
          json: { description: "Un grupo o lista de grupos, como objeto o texto JSON" },
        },
      },
      execute: (/** @type {{html?: string, json?: unknown}} */ { html, json }) => {
        if (html) agregarGrupos(app, [grupoDesdeHtml(html)]);
        else if (json) agregarGrupos(app, gruposDesdeJson(typeof json === "string" ? JSON.parse(json) : json));
        else throw new Error("Falta html o json.");
        return estado(app);
      },
    },
    {
      name: "ver_estado",
      description: "Grupos cargados, materias (cuáles están elegidas, sus secciones con codhora, grupo, profesor y clases) "
        + "y las preferencias actuales.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => estado(app),
    },
    {
      name: "elegir_materias",
      description: "Define qué materias se van a inscribir (reemplaza la selección). Usa los codasig de ver_estado.",
      inputSchema: {
        type: "object",
        properties: { codasig: { type: "array", items: { type: "string" } } },
        required: ["codasig"],
      },
      execute: (/** @type {{codasig: string[]}} */ { codasig }) => {
        const hay = new Set(app.secciones.map((s) => s.codasig));
        const faltan = codasig.filter((c) => !hay.has(c));
        if (faltan.length) throw new Error(`No están cargadas: ${faltan.join(", ")}`);
        aplicar(app, () => { app.estado.requeridas = [...new Set(codasig)]; });
        return estado(app);
      },
    },
    {
      name: "ajustar_preferencias",
      description: "Cambia preferencias; solo lo que se pase, cada campo reemplaza al anterior. "
        + "turno ordena (con solo_turno, descarta lo de otros turnos); menos_dias prefiere ir menos días; "
        + "profesores_solo: por codasig, los únicos profesores aceptados en esa materia; profesores_evitados: fuera en todas; "
        + "fijas: codhora que deben salir (una por materia); excluidas: codhora que no deben salir. "
        + "Nombres de profesor exactos como en ver_estado.",
      inputSchema: {
        type: "object",
        properties: {
          turno: { type: "string", enum: ["", "manana", "tarde", "noche"], description: "\"\" = da igual" },
          solo_turno: { type: "boolean" },
          menos_dias: { type: "boolean" },
          profesores_solo: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
          profesores_evitados: { type: "array", items: { type: "string" } },
          fijas: LISTA_CODHORA,
          excluidas: LISTA_CODHORA,
        },
      },
      execute: (/** @type {Record<string, any>} */ e) => {
        aplicar(app, () => {
          const p = app.estado.prefs;
          if (e.turno !== undefined) {
            if (e.turno) p.horario = e.turno;
            else {
              delete p.horario;
              p.soloTurno = false;
            }
          }
          if (e.solo_turno !== undefined) p.soloTurno = !!e.solo_turno && !!p.horario;
          if (e.menos_dias !== undefined) p.menosDias = !!e.menos_dias;
          if (e.profesores_solo) p.solo = Object.fromEntries(Object.entries(e.profesores_solo).filter(([, l]) => l.length));
          if (e.profesores_evitados) p.evitados = [...new Set(/** @type {string[]} */ (e.profesores_evitados))];
          if (e.fijas) p.fijas = e.fijas.map(Number);
          if (e.excluidas) p.excluidas = e.excluidas.map(Number);
        });
        return estado(app).preferencias;
      },
    },
    {
      name: "ver_horarios",
      description: "Busca las mejores combinaciones sin choques de las materias elegidas, de mejor a peor según las preferencias. "
        + "Cada materia trae c_hora (lo que se escribe en Matrícula del Período) y plan_b: los C.HORA que la reemplazan "
        + "sin mover nada más si el grupo se llena (vacío: inscribirla primero).",
      inputSchema: {
        type: "object",
        properties: { cuantas: { type: "integer", minimum: 1, maximum: K_POR_DEFECTO, default: 5 } },
      },
      annotations: { readOnlyHint: true },
      execute: (/** @type {{cuantas?: number}} */ { cuantas = 5 }) => {
        const { requeridas, prefs } = app.estado;
        if (!requeridas.length) throw new Error("No hay materias elegidas.");
        const r = resolver(app.secciones, requeridas, prefs);
        const nombre = (/** @type {string} */ c) => app.secciones.find((s) => s.codasig === c)?.asignatura ?? c;
        if (r.estado === "FALTAN") return { estado: "sin_secciones", materias: r.faltan.map(nombre) };
        if (r.estado === "SIN_SOLUCION") return { estado: "sin_horario", choques: r.choques.map((par) => par.map(nombre)), parcial: r.parcial };
        return {
          estado: "ok",
          parcial: r.parcial,
          total: r.opciones.length,
          opciones: r.opciones.slice(0, cuantas).map((o, i) => {
            const planes = reemplazos(app.secciones, o.secciones, prefs);
            return {
              numero: i + 1,
              dias: o.detalle.dias,
              huecos: o.detalle.huecos,
              materias: o.secciones.map((s) => ({
                asignatura: s.asignatura, codasig: s.codasig, codhora: s.codhora, c_hora: cHora(s), grupo: s.grupo,
                profesor: s.profesor, clases: clases(s), plan_b: (planes.get(s.codhora) ?? []).map((x) => cHora(x) ?? x.grupo),
              })),
            };
          }),
        };
      },
    },
    {
      name: "mostrar_horario",
      description: "Lleva la pantalla al horario y muestra la opción con ese número (el de ver_horarios), para que el usuario la vea.",
      inputSchema: {
        type: "object",
        properties: { numero: { type: "integer", minimum: 1, default: 1 } },
      },
      execute: async (/** @type {{numero?: number}} */ { numero = 1 }) => {
        if (location.hash !== "#opciones") {
          const llego = new Promise((listo) => addEventListener("hashchange", listo, { once: true }));
          location.hash = "#opciones";
          await llego;
        }
        irAOpcion(app, numero - 1);
        return { numero };
      },
    },
  ];
}

/** @param {App} app */
export function iniciarAgentes(app) {
  const lista = herramientas(app);
  /** @type {any} */ (globalThis).horautp = Object.fromEntries(lista.map((t) => [t.name, t.execute]));
  // navigator: prueba de origen de Chrome
  const mc = /** @type {any} */ (document).modelContext ?? /** @type {any} */ (navigator).modelContext;
  if (!mc?.registerTool) return;
  for (const t of lista) {
    try {
      Promise.resolve(mc.registerTool(t)).catch(() => {});
    } catch { /* otra versión de la API */ }
  }
}

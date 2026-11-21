// @ts-check
// Herramientas WebMCP; sin WebMCP, en window.horautp.

import { borrarGuardado } from "./ajustes.js";
import { conDeshacer } from "./deshacer.js";
import { alternarFija, excluir, ponerEnMateria, profesoresDe, sinSalida } from "./elecciones.js";
import { grupoManual, gruposDesdeJson, grupoDesdeHtml } from "./entrada.js";
import { cargar } from "./estado.js";
import { listarMaterias, nombreTipo } from "./modelo.js";
import { irAOpcion } from "./horario.js";
import { agregarGrupos } from "./materias.js";
import { DIAS, rango } from "./periodos.js";
import { ponerTurno } from "./preferencias.js";
import { K_POR_DEFECTO, reemplazos, resolver } from "./solver.js";
import { aplicar, cambio, pasoActual, repintar } from "./ui.js";

/**
 * @typedef {import("./ui.js").App} App
 * @typedef {import("./modelo.js").Seccion} Seccion
 * @typedef {import("./modelo.js").Grupo} Grupo
 * @typedef {{name: string, title: string, description: string, inputSchema: object, outputSchema?: object,
 *            annotations?: Record<string, boolean>, execute: (e: any) => unknown, si: (app: App) => boolean}} Herramienta
 */

/** C.HORA (0761). @param {Seccion} s */
const cHora = (s) => (s.codhora > 0 ? String(s.codhora).padStart(4, "0") : null);

/** @param {Seccion} s */
const clases = (s) => s.bloques.map(([d, ini, fin, t, aula, sub]) =>
  [DIAS[d], rango(ini, fin), sub ? `subgrupo ${sub}` : nombreTipo(t), aula].filter(Boolean).join(" · "));

/** @param {Seccion} s */
const seccion = (s) => ({
  codhora: s.codhora,
  c_hora: cHora(s),
  grupo: s.grupo,
  subgrupo: s.sub || undefined,
  profesor: s.profesor,
  clases: clases(s),
});

/** Grupo del portal: su código. A mano: el codhora de su materia. @param {Grupo} g */
const idGrupo = (g) => (g.manual ? String(g.materias[0].codhora) : g.grupo);

/** @param {Grupo} g */
const grupo = (g) => ({
  id: idGrupo(g),
  grupo: g.grupo,
  periodo: g.periodo,
  sede: g.sede,
  a_mano: !!g.manual,
  materias: g.materias.length,
});

/** @param {App} app */
function pantalla(app) {
  const paso = pasoActual();
  const hay = paso === "opciones" && !!/** @type {any} */ (app.resultado)?.opciones?.length;
  return { paso, opcion: hay ? app.opcion + 1 : null };
}

/** @param {App} app */
const preferencias = ({ estado: { prefs } }) => ({
  turno: prefs.horario ?? "",
  solo_turno: !!prefs.soloTurno,
  menos_dias: !!prefs.menosDias,
  profesores_solo: prefs.solo,
  profesores_evitados: prefs.evitados,
  fijas: prefs.fijas,
  excluidas: prefs.excluidas,
});

/** @param {App} app */
function estado(app) {
  const { grupos, requeridas } = app.estado;
  return {
    pantalla: pantalla(app),
    grupos: grupos.map(grupo),
    materias: listarMaterias(app.secciones).map((m) => ({
      codasig: m.codasig,
      asignatura: m.asignatura,
      elegida: requeridas.includes(m.codasig),
      secciones: app.secciones.filter((s) => s.codasig === m.codasig).map(seccion),
    })),
    preferencias: preferencias(app),
  };
}

// ---------- Esquemas ----------

const TEXTO = { type: "string" };
const ENTERO = { type: "integer" };
const SI_NO = { type: "boolean" };
/** @param {object} items @param {string} [description] */
const lista = (items, description) => ({ type: "array", items, ...(description && { description }) });
/** @param {Record<string, object>} properties @param {string[]} [required] */
const objeto = (properties, required) => ({ type: "object", properties, ...(required && { required }) });
const TURNO = { type: "string", enum: ["", "manana", "tarde", "noche"], description: "\"\" = da igual" };

const SECCION = objeto({
  codhora: { type: "integer", description: "Id de la sección. Negativo: materia agregada a mano" },
  c_hora: { type: ["string", "null"], description: "Lo que se escribe en Matrícula del Período" },
  grupo: TEXTO,
  subgrupo: TEXTO,
  profesor: TEXTO,
  clases: lista(TEXTO, "Día · hora · tipo o subgrupo · aula"),
});

const PREFERENCIAS = objeto({
  turno: TURNO,
  solo_turno: SI_NO,
  menos_dias: SI_NO,
  profesores_solo: { type: "object", additionalProperties: lista(TEXTO), description: "Por codasig" },
  profesores_evitados: lista(TEXTO),
  fijas: lista(ENTERO, "codhora"),
  excluidas: lista(ENTERO, "codhora"),
});

const ESTADO = objeto({
  pantalla: objeto({
    paso: { type: "string", enum: ["materias", "opciones"] },
    opcion: { type: ["integer", "null"], description: "Número de la opción en pantalla" },
  }),
  grupos: lista(objeto({
    id: { type: "string", description: "Para quitar_grupos" },
    grupo: TEXTO,
    periodo: TEXTO,
    sede: TEXTO,
    a_mano: SI_NO,
    materias: ENTERO,
  })),
  materias: lista(objeto({
    codasig: TEXTO,
    asignatura: TEXTO,
    elegida: { type: "boolean", description: "Se va a inscribir" },
    secciones: lista(SECCION),
  })),
  preferencias: PREFERENCIAS,
});

const HORARIOS = objeto({
  estado: {
    type: "string",
    enum: ["ok", "sin_secciones", "sin_horario"],
    description: "sin_secciones: las preferencias dejan materias sin secciones. sin_horario: todo choca",
  },
  materias: lista(TEXTO, "sin_secciones: las materias afectadas"),
  choques: lista(lista(TEXTO), "sin_horario: pares de materias que siempre chocan"),
  parcial: { type: "boolean", description: "La búsqueda se cortó antes de revisar todo" },
  total: ENTERO,
  opciones: lista(objeto({
    numero: { type: "integer", description: "Para mostrar_horario" },
    dias: ENTERO,
    huecos: ENTERO,
    materias: lista(objeto({
      asignatura: TEXTO,
      codasig: TEXTO,
      ...SECCION.properties,
      plan_b: lista(TEXTO, "C.HORA que la reemplazan sin mover nada más si el grupo se llena. Vacío: inscribirla primero"),
    })),
  })),
});

const BLOQUE = objeto({
  dia: { type: "integer", minimum: 0, maximum: 6, description: "0 = lunes" },
  inicio: { type: "integer", description: "Minutos desde las 0:00 (7:00 = 420)" },
  fin: { type: "integer", description: "Minutos desde las 0:00" },
  tipo: { type: "string", enum: ["C", "L"], default: "C", description: "C = clase, L = laboratorio" },
  aula: TEXTO,
}, ["dia", "inicio", "fin"]);

// ---------- Ayudas ----------

/** @param {App} app */
const hayGrupos = (app) => app.estado.grupos.length > 0;
/** @param {App} app */
const hayMaterias = (app) => app.secciones.length > 0;
/** @param {App} app */
const hayElegidas = (app) => app.estado.requeridas.length > 0;

/** @param {App} app @param {number} codhora */
function buscarSeccion(app, codhora) {
  const s = app.secciones.find((x) => x.codhora === codhora);
  if (!s) throw new Error(`No hay sección con codhora ${codhora}.`);
  return s;
}

/** @param {{dia: number, inicio: number, fin: number, tipo?: string, aula?: string}} b */
function bloqueManual({ dia, inicio, fin, tipo = "C", aula = "" }) {
  const entero = (/** @type {unknown} */ n, /** @type {number} */ max) => Number.isInteger(n) && n >= 0 && n <= max;
  if (!entero(dia, 6) || !entero(inicio, 1440) || !entero(fin, 1440) || fin <= inicio) {
    throw new Error(`Bloque inválido: día ${dia}, ${inicio}–${fin}.`);
  }
  return /** @type {import("./modelo.js").Bloque} */ ([dia, inicio, fin, tipo === "L" ? "L" : "C", aula.trim()]);
}

// ---------- Herramientas ----------

/** @param {App} app @returns {Herramienta[]} */
function herramientas(app) {
  return [
    {
      name: "cargar_horario",
      title: "Cargar horario",
      description: "Carga el horario de un grupo de la UTP: el HTML completo de la página del portal de Matrícula "
        + "(Grupos por Asignatura → Horario del Grupo), o JSON de grupos: [{grupo, periodo, materias: [{codasig, codhora, "
        + "asignatura, profesor, email, bloques: [[dia 0=lunes, inicio y fin en minutos desde las 0:00, \"C\"|\"L\"|\"CL\", aula, subgrupo opcional]]}]}]. "
        + "Se pueden cargar varios grupos; sus materias quedan elegidas.",
      inputSchema: objeto({
        html: { type: "string", description: "HTML de la página Horario del Grupo" },
        json: { description: "Un grupo o lista de grupos, como objeto o texto JSON" },
      }),
      outputSchema: ESTADO,
      si: () => true,
      execute: (/** @type {{html?: string, json?: unknown}} */ { html, json }) => {
        if (html) agregarGrupos(app, [grupoDesdeHtml(html)]);
        else if (json) agregarGrupos(app, gruposDesdeJson(typeof json === "string" ? JSON.parse(json) : json));
        else throw new Error("Falta html o json.");
        return estado(app);
      },
    },
    {
      name: "agregar_materia",
      title: "Agregar materia a mano",
      description: "Agrega una materia que no está en el portal, con sus días y horas. Queda elegida.",
      inputSchema: objeto({
        asignatura: TEXTO,
        profesor: TEXTO,
        grupo: TEXTO,
        bloques: lista(BLOQUE),
      }, ["asignatura", "bloques"]),
      outputSchema: ESTADO,
      si: () => true,
      execute: (/** @type {{asignatura: string, profesor?: string, grupo?: string, bloques: any[]}} */ e) => {
        const datos = { asignatura: e.asignatura, profesor: e.profesor ?? "", grupo: e.grupo ?? "", bloques: e.bloques.map(bloqueManual) };
        agregarGrupos(app, [grupoManual(datos, app.estado.grupos)]);
        return estado(app);
      },
    },
    {
      name: "ver_estado",
      title: "Ver estado",
      description: "Lo que hay en pantalla, los grupos cargados, las materias con sus secciones y las preferencias.",
      inputSchema: objeto({}),
      outputSchema: ESTADO,
      annotations: { readOnlyHint: true },
      si: () => true,
      execute: () => estado(app),
    },
    {
      name: "quitar_grupos",
      title: "Quitar grupos",
      description: "Quita grupos cargados o materias agregadas a mano. El usuario lo puede deshacer en pantalla por unos segundos.",
      inputSchema: objeto({ ids: lista(TEXTO, "id de ver_estado → grupos") }, ["ids"]),
      outputSchema: ESTADO,
      si: hayGrupos,
      execute: (/** @type {{ids: string[]}} */ { ids }) => {
        const hay = new Set(app.estado.grupos.map(idGrupo));
        const faltan = ids.filter((id) => !hay.has(id));
        if (faltan.length) throw new Error(`No están cargados: ${faltan.join(", ")}`);
        const n = new Set(ids).size;
        conDeshacer(app, n === 1 ? "1 grupo quitado" : `${n} grupos quitados`, () => {
          app.estado.grupos = app.estado.grupos.filter((g) => !ids.includes(idGrupo(g)));
          cambio(app);
          repintar(app);
        });
        return estado(app);
      },
    },
    {
      name: "elegir_materias",
      title: "Elegir materias",
      description: "Define qué materias se van a inscribir (reemplaza la selección). Usa los codasig de ver_estado.",
      inputSchema: objeto({ codasig: lista(TEXTO) }, ["codasig"]),
      outputSchema: ESTADO,
      si: hayMaterias,
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
      title: "Ajustar preferencias",
      description: "Cambia solo lo que se pase. turno ordena; con solo_turno, descarta lo de otros turnos. "
        + "menos_dias prefiere ir menos días.",
      inputSchema: objeto({ turno: TURNO, solo_turno: SI_NO, menos_dias: SI_NO }),
      outputSchema: PREFERENCIAS,
      si: hayMaterias,
      execute: (/** @type {{turno?: string, solo_turno?: boolean, menos_dias?: boolean}} */ e) => {
        aplicar(app, () => {
          const p = app.estado.prefs;
          if (e.turno !== undefined) ponerTurno(p, e.turno);
          if (e.solo_turno !== undefined) p.soloTurno = !!e.solo_turno && !!p.horario;
          if (e.menos_dias !== undefined) p.menosDias = !!e.menos_dias;
        });
        return preferencias(app);
      },
    },
    {
      name: "marcar_secciones",
      title: "Fijar o excluir secciones",
      description: "fija: la sección debe salir (una por materia; reemplaza otra fija de la misma materia). "
        + "excluida: no debe salir. normal: quita la marca.",
      inputSchema: objeto({
        codhora: lista(ENTERO, "codhora de ver_estado"),
        como: { type: "string", enum: ["fija", "excluida", "normal"] },
      }, ["codhora", "como"]),
      outputSchema: PREFERENCIAS,
      si: hayMaterias,
      execute: (/** @type {{codhora: number[], como: string}} */ { codhora, como }) => {
        const secciones = codhora.map((c) => buscarSeccion(app, c));
        if (como === "fija") {
          const materias = secciones.map((s) => s.codasig);
          if (new Set(materias).size < materias.length) throw new Error("Solo una fija por materia.");
        }
        aplicar(app, () => {
          const p = app.estado.prefs;
          for (const s of secciones) {
            if (como === "excluida") excluir(app, s);
            else {
              p.excluidas = p.excluidas.filter((c) => c !== s.codhora);
              if (p.fijas.includes(s.codhora) !== (como === "fija")) alternarFija(app, s);
            }
          }
        });
        return preferencias(app);
      },
    },
    {
      name: "marcar_profesor",
      title: "Elegir o evitar profesor",
      description: "quiero: en esa materia solo salen sus secciones (pide codasig). "
        + "no: sale de todas sus materias. da_igual: quita la marca (en esa materia o, sin codasig, en todas). "
        + "Nombre exacto como en ver_estado.",
      inputSchema: objeto({
        profesor: TEXTO,
        como: { type: "string", enum: ["quiero", "no", "da_igual"] },
        codasig: TEXTO,
      }, ["profesor", "como"]),
      outputSchema: PREFERENCIAS,
      si: hayMaterias,
      execute: (/** @type {{profesor: string, como: string, codasig?: string}} */ { profesor, como, codasig }) => {
        const suyas = [...new Set(app.secciones.filter((s) => s.profesor === profesor).map((s) => s.codasig))];
        if (!suyas.length) throw new Error(`No hay secciones de "${profesor}".`);
        if (codasig && !profesoresDe(app, codasig).includes(profesor)) {
          throw new Error(`"${profesor}" no da ${codasig}.`);
        }
        if (como === "quiero" && !codasig) throw new Error("Falta codasig.");
        if (como === "no" && sinSalida(app, profesor)) {
          throw new Error(`Sin "${profesor}", alguna materia elegida se queda sin profesores.`);
        }
        aplicar(app, () => {
          if (como === "quiero") ponerEnMateria(app, /** @type {string} */ (codasig), profesor, "quiero");
          else if (como === "no") {
            if (!app.estado.prefs.evitados.includes(profesor)) ponerEnMateria(app, suyas[0], profesor, "no");
          } else for (const c of codasig ? [codasig] : suyas) ponerEnMateria(app, c, profesor, "");
        });
        return preferencias(app);
      },
    },
    {
      name: "ver_horarios",
      title: "Ver horarios",
      description: "Busca las mejores combinaciones sin choques de las materias elegidas, de mejor a peor según las preferencias.",
      inputSchema: objeto({ cuantas: { type: "integer", minimum: 1, maximum: K_POR_DEFECTO, default: 5 } }),
      outputSchema: HORARIOS,
      annotations: { readOnlyHint: true },
      si: hayElegidas,
      execute: (/** @type {{cuantas?: number}} */ { cuantas = 5 }) => {
        const { requeridas, prefs } = app.estado;
        if (!requeridas.length) throw new Error("No hay materias elegidas.");
        const r = resolver(app.secciones, requeridas, prefs);
        const nombre = (/** @type {string} */ c) => app.secciones.find((s) => s.codasig === c)?.asignatura ?? c;
        if (r.estado === "FALTAN") return { estado: "sin_secciones", materias: r.faltan.map(nombre) };
        if (r.estado === "SIN_SOLUCION") {
          return { estado: "sin_horario", choques: r.choques.map((par) => par.map(nombre)), parcial: r.parcial };
        }
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
                asignatura: s.asignatura,
                codasig: s.codasig,
                ...seccion(s),
                plan_b: (planes.get(s.codhora) ?? []).map((x) => cHora(x) ?? x.grupo),
              })),
            };
          }),
        };
      },
    },
    {
      name: "mostrar_horario",
      title: "Mostrar horario",
      description: "Lleva la pantalla al horario y muestra la opción con ese número (el de ver_horarios), para que el usuario la vea.",
      inputSchema: objeto({ numero: { type: "integer", minimum: 1, default: 1 } }),
      outputSchema: objeto({ numero: ENTERO }),
      si: hayElegidas,
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
    {
      name: "borrar_datos",
      title: "Borrar datos",
      description: "Borra grupos, materias y preferencias. No se puede deshacer: confirma antes con el usuario.",
      inputSchema: objeto({}),
      outputSchema: ESTADO,
      annotations: { consequentialHint: true },
      si: hayGrupos,
      execute: () => {
        borrarGuardado();
        Object.assign(app.estado, cargar());
        cambio(app);
        if (pasoActual() === "materias") repintar(app);
        else location.hash = "#materias";
        return estado(app);
      },
    },
  ];
}

// ---------- Registro ----------

const contexto = () => /** @type {any} */ (document).modelContext ?? /** @type {any} */ (navigator).modelContext;

/**
 * El error como resultado: si se lanza, WebMCP lo cambia por "Tool execution failed".
 * @param {(e: any) => unknown} execute
 */
const conError = (execute) => async (/** @type {any} */ e) => {
  try {
    return await execute(e);
  } catch (err) {
    return { error: /** @type {Error} */ (err).message };
  }
};

/**
 * Solo las que sirven en este momento; el resto se quita.
 * @param {any} mc @param {Herramienta[]} lista @param {App} app @param {Map<string, AbortController>} vivas
 */
function sincronizar(mc, lista, app, vivas) {
  for (const { si, ...t } of lista) {
    const ya = vivas.get(t.name);
    if (si(app) === !!ya) continue;
    if (ya) {
      ya.abort();
      vivas.delete(t.name);
      continue;
    }
    const c = new AbortController();
    vivas.set(t.name, c);
    try {
      const registro = mc.registerTool({ ...t, execute: conError(t.execute) }, { signal: c.signal });
      Promise.resolve(registro).catch(() => vivas.delete(t.name));
    } catch {
      vivas.delete(t.name); // otra versión de la API
    }
  }
}

/** @param {App} app */
export async function iniciarAgentes(app) {
  const lista = herramientas(app);
  /** @type {any} */ (globalThis).horautp = Object.fromEntries(lista.map((t) => [t.name, t.execute]));
  // Sin WebMCP nativo: polyfill, para extensiones que leen document.modelContext.
  if (!contexto() && isSecureContext) {
    try { await import("./vendor/webmcp-polyfill.js"); } catch { /* sin red */ }
  }
  const mc = contexto();
  if (!mc?.registerTool) return;
  /** @type {Map<string, AbortController>} */
  const vivas = new Map();
  sincronizar(mc, lista, app, vivas);
  document.addEventListener("estado", () => sincronizar(mc, lista, app, vivas));
}

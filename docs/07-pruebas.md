# 7. Pruebas

Para correr las pruebas:

```bash
node --test tests/
```

## 7.1 Archivos

| Archivo | Prueba |
|---|---|
| `tests/entrada.test.js` | El parser con grupos del portal: 4GS111, 1LB421, una maestría con horas de 55 minutos, subgrupos y varias clases por celda. |
| `tests/nucleo.test.js` | Horas, unidades, huecos, subgrupos, choques, preferencias, plan B y el solver comparado con la fuerza bruta. |
| `tests/rendimiento.test.js` | Tres casos grandes. Cada uno debe terminar antes de `MS_MAX`. |
| `tests/bruta.js` | La fuerza bruta y los generadores de datos al azar. |

## 7.2 Fuerza bruta

`bruta(secciones, requeridas, prefs)` prueba todas las combinaciones y da la lista de penalidades en orden. No usa máscaras ni cotas:

- Calcula las unidades de cada bloque con $\lfloor \text{inicio}/10 \rfloor$ a $\lceil \text{fin}/10 \rceil - 1$.
- Aplica las mismas reglas de choque ([Choques](03-modelo.md#34-choques)).
- Calcula las unidades libres de cada día como $(\text{última} - \text{primera} + 1) - |\text{ocupadas}|$.

La prueba exige que las $K$ primeras penalidades del solver sean iguales a las de la fuerza bruta.

| Generador | Datos |
|---|---|
| `sinteticos` | Bloques al azar en la rejilla A. Puede haber choques dentro de un grupo. |
| `sinteticosUtp` | Un turno por grupo y sin choques dentro del grupo, como en la UTP. |
| `sinteticosMixtos` | Rejilla A, rejilla H y materias con subgrupos A y B. |

| Prueba | Casos |
|---|---|
| `tests/datos.json` × 4 grupos de preferencias × $K \in \{1, 3, 1000\}$ | 12 |
| `sinteticos` × 8 grupos de preferencias | 400 |
| `sinteticosMixtos` × 8 grupos de preferencias | 240 |

## 7.3 Datos reales

El motor se probó con el scrape del portal de noviembre de 2026 (`utp_horarios_raw_2026-11-20-02-17.json`):

| Medida | Resultado |
|---|---|
| Grupos con horario | 1145 de 1255. Los otros 110 no tienen grilla. |
| Clases en el HTML / clases que lee el motor | 25 136 / 25 136 |
| Código de grupo igual al del portal | 1145 de 1145 |
| Sede igual a la del portal | 1145 de 1145 |
| Grupos cuyo horario propio no tiene solución | 0 |
| Tiempo con 132 grupos y 675 secciones de una sede | menos de 5 ms |

Para medir las clases leídas, cuenta los `<p>` de las celdas de la grilla. Después, para cada bloque, cuenta las filas de la grilla cuyo inicio está dentro del bloque. Los dos totales deben ser iguales.

## 7.4 Valores para otro motor

Un motor nuevo debe dar estos resultados.

**Horas:** la tabla de [Hora de una fila](02-tiempo.md#22-hora-de-una-fila).

**Huecos:** la tabla de [Huecos](02-tiempo.md#24-huecos).

**Celdas:** las tablas de [Bloques](01-entrada.md#bloques).

**Grupo 4GS111** (Veraguas, rejilla A). Bloques por C.ASIG:

| C.ASIG | Bloques |
|---|---|
| 0599 | `[0,420,515,C,4C1]`, `[4,420,465,C,4C1]` |
| 1474 | `[2,420,515,C,4C1]`, `[3,570,615,C,4C1]`, `[3,620,715,L,4C1]` |
| 1489 | `[2,520,615,C,4C1]`, `[4,570,615,L,4C1]` |
| 8362 | `[0,520,565,C,4C1]`, `[0,570,665,L,4fis]`, `[4,470,565,C,4C1]` |
| 8393 | `[1,470,515,C,4C1]`, `[1,520,615,L,4fis]`, `[3,470,565,C,4C1]` |
| 8398 | `[1,620,765,C,4C1]`, `[4,620,715,L,4fis]` |

**Maestría 11D234** (rejilla H). `PLANIF. FINANC.` el miércoles y el viernes de 6:00 a 9:55pm, en el aula P307:

```
[2, 1080, 1315, "C", "P307"], [4, 1080, 1315, "C", "P307"]
```

**Subgrupos 1TB221.** Con MICRO (teoría + lab B) y ÓPTICA (teoría + lab A) a la misma hora, el solver da 2 opciones: `AA` y `BB`.

**Mismo grupo 2GP211.** Dos materias del grupo a la misma hora y en la misma aula tienen solución. Las mismas materias en grupos distintos dan `SIN_SOLUCION`.

**Mismo grupo 1GS134.** Dos materias del grupo a la misma hora en aulas distintas dan `SIN_SOLUCION`.

# Optimizador de Horarios UTP

TUI que arma el horario semanal desde `data/horarios.csv` usando
[OR-Tools](https://developers.google.com/optimization/) para
encontrar todas las combinaciones de secciones sin choques, ordenadas
según qué tanto cumplen tus preferencias.

## Stack

`ortools` , `pandas` `textual` / `rich` 

## Archivos

| Archivo              | Qué hace                                  |
| -------------------- | ----------------------------------------- |
| `data/horarios.csv`  | input                                     |
| `src/parser.py`      | CSV → `Slot[]`                            |
| `src/model.py`       | agrupa slots en secciones, modelo CP-SAT  |
| `src/preferences.py` | DSL de preferencias y penalización        |
| `src/grid.py`        | pivotea secciones en grilla período x día |
| `src/tui.py`         | las 4 pantallas                           |
| `main.py`            | entry point                               |

## Slot vs Sección

Cada fila del CSV es un bloque (`Slot`): materia, día, hora. Lo que se
elige es una **sección**: todas las filas que comparten
`(grupo, codasig, codhora)`. Clase y Lab de la misma materia comparten
`codhora`, así que quedan pegadas en una sola sección. Por eso no hace
falta una regla aparte de "si hay Lab, tomar su Clase".

## Restricciones duras

$x_s \in \{0,1\}$: se eligió la sección $s$. $S_c$: secciones candidatas
de la materia $c$.

Una sección por materia:

$$\sum_{s \in S_c} x_s = 1$$

Dos bloques chocan si son del mismo día y:

$$\text{inicio}_a < \text{fin}_b \quad \text{y} \quad \text{inicio}_b < \text{fin}_a$$

Si dos secciones de materias distintas chocan, son excluyentes:

$$x_a + x_b \le 1$$

## Enumeración de todas las combinaciones

`solve_all_schedules` arma el modelo solo con las restricciones duras
(sin objetivo) y le pide a CP-SAT enumerar todas las soluciones factibles:
`enumerate_all_solutions = True`, `num_search_workers = 1` (la
enumeración completa requiere un solo hilo).

Límite de seguridad: corta en `MAX_SOLUTIONS = 500` o `30s`, lo que
pase primero. Si corta, marca `capped: True`.

## Preferencias y penalización

```python
prefs = {
  "1474": {"horario": "tarde", "profesor": "ZURITA"},
  "global": {"dias_max": 4, "weights": {...}},   # weights opcional
}
```

Franja horaria según hora de inicio $h$:

$$
\text{franja}(h) =
\begin{cases}
\text{mañana} & h < 12{:}00 \\
\text{tarde}  & 12{:}00 \le h < 17{:}00 \\
\text{noche}  & h \ge 17{:}00
\end{cases}
$$

Una sección cumple la preferencia $h^{*}_{c}$ solo si todos sus bloques
caen en esa franja, es decir para cada bloque $b$ de la sección
$\text{franja}(b) = h^{*}_{c}$.

Penalización de una sección (0 si cumple, el peso si no):

$$
\text{pen}(s) = w_{\text{horario}} \cdot [\text{horario no cumple}] + w_{\text{profesor}} \cdot [\text{profesor no cumple}]
$$

Exceso de días, si hay `dias_max` y $D(c)$ es el set de días usados:

$$
\text{exceso}(c) = \max(0, |D(c)| - d_{\text{max}})
$$

Penalización total de una combinación (así se ordenan las opciones):

$$
P(c) = \sum_{s \in c} \text{pen}(s) + w_{\text{dias}} \cdot \text{exceso}(c)
$$

### Pesos por defecto

| Peso | Valor | Penaliza |
|---|---|---|
| $w_{\text{horario}}$ | 10 | fuera de la franja preferida |
| $w_{\text{profesor}}$ | 15 | profesor distinto al preferido |
| $w_{\text{dias}}$ | 20 | cada día extra sobre `dias_max` |

Sobreescribibles con `prefs["global"]["weights"]`.

## Grilla semanal

La pantalla 3 pivotea los bloques en una grilla período x día, igual al
formato de UTP. Los 11 períodos (12:50pm-1:35pm, ..., 9:10pm-9:55pm) se
derivaron de las duraciones reales de bloque en el CSV: 95 min son 2
períodos, 145 min son 3, etc. Un bloque entra en un período si el período
cabe completo dentro del bloque:

$$
b_s \le p_s \quad \text{y} \quad p_e \le b_e
$$

Si un CSV distinto trae bloques que no encajan en esta tabla, igual se
muestran en filas aparte con su hora exacta.

## Uso

```bash
python3 -m venv .venv
.venv/bin/pip install -r legacy/requirements.txt
.venv/bin/python legacy/main.py   # desde la raíz del repo (lee data/horarios.csv)
```

## Pantallas

1. Materias: checklist de materias requeridas.
2. Preferencias: franja (Mañana/Tarde/Noche/Cualquiera) y profesor por
   materia, `dias_max` global.
3. Resolver: grilla semanal, tabla de materias asignadas, validación de
   preferencias, navegación entre opciones.
4. Exportar: CSV o `.ics` de la opción actual.


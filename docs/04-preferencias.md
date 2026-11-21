# 4. Preferencias

Código: `js/preferencias.js` y `candidatas` en `js/solver.js`.

## 4.1 Campos

| Campo | Tipo | Efecto |
|---|---|---|
| `horario` | `"manana"`, `"tarde"` o `"noche"` | Turno preferido. Suma penalidad. |
| `soloTurno` | boolean | Quita las secciones fuera del turno. |
| `menosDias` | boolean | Suma penalidad por cada día de clase después del primero. |
| `solo` | `{codasig: [profesor]}` | En esa materia, deja solo esos profesores. |
| `evitados` | `[profesor]` | Quita las secciones de esos profesores en todas las materias. |
| `fijas` | `[codhora]` | En su materia, deja solo esas secciones. |
| `excluidas` | `[codhora]` | Quita esas secciones. |

## 4.2 Secciones descartadas

`descartada(s, prefs)` revisa en este orden:

1. Si `s.codhora` está en `excluidas`, la sección queda fuera.
2. Si `s.profesor` está en `evitados`, la sección queda fuera.
3. Si `s.codhora` está en `fijas`, la sección queda dentro.
4. Si la materia tiene una lista `solo` y el profesor no está en ella, la sección queda fuera.
5. Si `soloTurno` está activo y la sección no cumple `horario`, la sección queda fuera.
6. En otro caso, la sección queda dentro.

Una sección fija queda dentro aunque no cumpla los pasos 4 y 5.

## 4.3 Candidatas

`candidatas(secciones, requeridas, prefs)` da, para cada materia requerida, una lista de `{s, p}`:

1. Toma las secciones de la materia que no están descartadas.
2. Calcula $p = \text{penalSeccion}(s)$.
3. Si alguna sección de la lista es fija, deja solo las fijas.
4. Ordena la lista por $p$, de menor a mayor.

Las secciones fijas comparan el C.HORA. Por eso, si fijas un C.HORA con subgrupos, todos sus subgrupos quedan como candidatas.

## 4.4 Penalidad

| Peso | Valor | Se suma por |
|---|---|---|
| `horario` | 10 | cada sección que no cumple el turno preferido |
| `dias` | 20 | cada día de clase después del primero, si `menosDias` está activo |
| `hueco` | 1 | cada unidad libre de 10 minutos ([Huecos](02-tiempo.md#25-huecos)) |

$$
\text{penalSeccion}(s) = \begin{cases} 10 & \text{si hay } \texttt{horario} \text{ y } s \text{ no lo cumple} \\ 0 & \text{otro caso} \end{cases}
$$

$$
P(\text{opción}) = \sum_{s} \text{penalSeccion}(s) \;+\; 20 \cdot \max(0,\ |D| - 1) \cdot [\texttt{menosDias}] \;+\; 1 \cdot U
$$

- $D$ es el conjunto de días con clase. Es la unión de `s.dias`.
- $U$ es la cantidad de unidades libres de la semana. El motor une las `masks` de todas las secciones con OR y aplica `huecosDia` a cada día.

Un período libre de 50 minutos vale 5 unidades. Así, la penalidad es igual a la del modelo viejo, con 5 por período.

`penalidad(secciones, prefs)` calcula $P$ fuera del solver. Para la misma opción, el resultado es igual al del solver.

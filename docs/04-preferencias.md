# 4. Preferencias

Código: `js/preferencias.js` y `candidatas` en `js/solver.js`.

## 4.1 Campos

| Campo | Tipo | Efecto |
|---|---|---|
| `dias` | 0, 1, 2 o 3 | Nivel de "menos días". Suma penalidad por cada día de clase después del primero. 0 = sin penalidad. La pantalla usa 0 y 2. |
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
5. En otro caso, la sección queda dentro.

Una sección fija queda dentro aunque no cumpla el paso 4.

## 4.3 Candidatas

`candidatas(secciones, requeridas, prefs)` da, para cada materia requerida, una lista de secciones:

1. Toma las secciones de la materia que no están descartadas.
2. Si alguna sección de la lista es fija, deja solo las fijas.

Las secciones fijas comparan el C.HORA. Por eso, si fijas un C.HORA con subgrupos, todos sus subgrupos quedan como candidatas.

## 4.4 Penalidad

| Peso | Valor | Se suma por |
|---|---|---|
| `dias` | $w_d$ = 0, 5, 20 o 60, según el nivel `dias` | cada día de clase después del primero |
| `hueco` | 1 | cada unidad libre de 10 minutos ([Huecos](02-tiempo.md#24-huecos)) |

$$
P(\text{opción}) = w_d \cdot \max(0,\ |D| - 1) \;+\; 1 \cdot U
$$

- $D$ es el conjunto de días con clase. Es la unión de `s.dias`.
- $w_d$ es `pesoDias(prefs)`. El interruptor "Ir menos días" pone el nivel 2. La pantalla no muestra $w_d$.
- $U$ es la cantidad de unidades libres de la semana. El motor une las `masks` de todas las secciones con OR y aplica `huecosDia` a cada día.

Un período libre de 50 minutos vale 5 unidades. Con el nivel 1, un día de clase vale lo mismo que un período libre.

`costo(nDias, U, w_d)` es la única fórmula de $P$. `penalidad(secciones, prefs)` la usa fuera del solver. El solver la usa en la hoja y en la cota.

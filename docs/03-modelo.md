# 3. Modelo

Código: `js/modelo.js`.

## 3.1 Tipos

```mermaid
classDiagram
  class Grupo {
    grupo: string
    periodo: string
    sede?: string
    manual?: boolean
    materias: Materia[]
  }
  class Materia {
    codasig: string
    codhora: number
    asignatura: string
    profesor: string
    email: string
    bloques: Bloque[]
  }
  class Bloque {
    dia: 0..6, lunes = 0
    inicio: minutos
    fin: minutos
    tipo: C, L o CL
    aula: string
    sub?: A..F
  }
  class Seccion {
    id: number
    grupo: string
    codasig: string
    codhora: number
    sub: string
    asignatura, profesor, email
    bloques: Bloque[]
    masks: 35 números
    usos: number[]
    dias: 7 bits
  }
  Grupo *-- Materia
  Materia *-- Bloque
  Materia ..> Seccion : construirSecciones
```

| Campo de `Seccion` | Valor |
|---|---|
| `masks` | Las 35 partes de unidades ocupadas ([Unidades de 10 minutos](02-tiempo.md#23-unidades-de-10-minutos)). |
| `usos` | Pares `[posición, parte]`, solo de las partes con algún bit. |
| `dias` | El bit $d$ indica clase el día $d$. El lunes es 0. |
| `sub` | Letra del subgrupo, o `""`. |
| `id` | Posición en la lista de secciones. |

Ejemplo de grupo en JSON:

```json
{"grupo": "1GS232", "periodo": "II-2026", "materias": [
  {"codasig": "8408", "codhora": 2679, "asignatura": "DES. SOFT. VIII",
   "profesor": "CALDERON, TOMAS", "email": "tomas.calderon@utp.ac.pa",
   "bloques": [[1, 1070, 1165, "C", "3-301"], [3, 1070, 1165, "L", "3-403"]]}
]}
```

## 3.2 Subgrupos

Un subgrupo es parte del **grupo completo**. Un estudiante tiene la misma letra en todas las materias del grupo. Ejemplo del grupo `1TB221`, el lunes a las 5:00pm: el subgrupo B está en `MICROCONTROLADO`, y el subgrupo A está en `ÓPTICA BIOMÉD.`

$L_g$ es el conjunto de letras de todos los bloques del grupo $g$. Cada materia $m$ de $g$ da estas secciones:

$$
\text{secciones}(m) = \begin{cases}
\{\ \text{teoría}(m) \cup \text{bloques}_x(m) : x \in L_g\ \} & \text{si } m \text{ tiene bloques con letra} \\
\{\ \text{bloques}(m),\ \text{sub} = \texttt{""}\ \} & \text{otro caso}
\end{cases}
$$

$\text{teoría}(m)$ son los bloques sin letra. Si una materia no tiene laboratorio para una letra, la sección de esa letra tiene solo la teoría.

```mermaid
flowchart LR
  M1["MICRO: teoría + lab B"] --> S1A["MICRO·A: teoría"]
  M1 --> S1B["MICRO·B: teoría + lab B"]
  M2["ÓPTICA: teoría + lab A"] --> S2A["ÓPTICA·A: teoría + lab A"]
  M2 --> S2B["ÓPTICA·B: teoría"]
```

## 3.3 Construir las secciones

`construirSecciones(grupos)`:

1. Para cada grupo, lista sus letras en orden.
2. Para cada materia, haz una sección por letra, o una sección sin letra ([Subgrupos](#32-subgrupos)).
3. Para cada sección:
   1. Marca sus bloques en `masks`.
   2. Marca sus días en `dias`.
   3. Ordena sus bloques por día y por inicio.
   4. Haz `usos` con las partes que tienen algún bit.
4. Guarda cada sección con la llave `codhora|sub`. Si la llave se repite, queda la última.
5. Pon `id` igual a la posición de cada sección en la lista.

## 3.4 Choques

Dos secciones son del **mismo grupo** si las dos son del portal ($\text{codhora} > 0$) y tienen el mismo código de grupo.

$$
\text{chocan}(a, b) = \begin{cases}
(a.\text{sub} \ne \texttt{""} \wedge b.\text{sub} \ne \texttt{""} \wedge a.\text{sub} \ne b.\text{sub}) \;\vee\; \text{pisan}_{\text{aula}}(a, b) & \text{mismo grupo} \\[4pt]
\displaystyle\bigvee_{i=0}^{34} \big(a.\text{masks}[i] \;\&\; b.\text{masks}[i] \ne 0\big) & \text{otro caso}
\end{cases}
$$

$\text{pisan}_{\text{aula}}(a, b)$: un bloque de $a$ y un bloque de $b$ están el mismo día, sus horas se pisan y sus aulas son distintas (o el aula está vacía).

En un mismo grupo:

- Dos letras distintas siempre chocan. Un estudiante no puede estar en A y en B.
- Dos bloques a la misma hora en aulas distintas chocan. Ejemplo: en `1GS134`, SO Lab (3-408) y Redes Clase (3-315) el martes a las 3:20.
- Dos bloques a la misma hora en la misma aula no chocan. Son módulos de posgrado. Ejemplo: el grupo `2GP211` tiene dos módulos de maestría a la misma hora en la misma aula.

Las materias a mano ($\text{codhora} < 0$) siempre chocan por horas.

## 3.5 Lista de materias

`listarMaterias(secciones)` da una entrada por C.ASIG, en orden alfabético. El campo `secciones` cuenta los C.HORA distintos. Los subgrupos de un C.HORA cuentan una vez.

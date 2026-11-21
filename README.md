# Horario

Web estática que arma tu horario sin choques, ordenado según
tus preferencias. HTML, CSS y JS vanilla: sin build, sin dependencias,
todo corre en el navegador.

La versión anterior (TUI en Python con OR-Tools) está en [`legacy/`](legacy/).

## Iniciar el servidor

Hace falta servirlo por HTTP: abrir `index.html` con doble clic no funciona
(los ES modules y el Web Worker no cargan desde `file://`).

Desde la raíz del repo:

```bash
cd prototipo-horautp
python3 -m http.server 8000
```

Abrir <http://localhost:8000>. Para detenerlo, `Ctrl+C`.

Cualquier servidor estático sirve; alternativas:

```bash
npx serve -l 8000 .        # Node
php -S localhost:8000      # PHP
```

Si el puerto 8000 está ocupado, usa otro (`python3 -m http.server 8080`) y
abre esa URL. Para publicarlo basta con GitHub Pages apuntando a la raíz
del repo.

## Uso

1. **Materias:** en el portal de Matrícula abre *Grupos por Asignatura →
   Horario del Grupo*, copia toda la página y pégala (o sube el `.html`
   o un `.json`). Sus materias quedan marcadas; desmarca las que no vas a inscribir.
2. **Horario:** las 50 mejores combinaciones sin choques. Arriba, filtros de
   turno, días y horas libres que reordenan al toque. En la tabla se fija o
   excluye cada sección, y al tocar el profesor se prefiere o evita a otro.
   Si no hay solución, dice qué materias chocan siempre.
3. **Inscribirse:** cada materia muestra su grupo y su C.HORA, lo que se
   escribe en *Matrícula del Período*. Bajo el C.HORA va el plan B (↳): el que
   la reemplaza sin mover nada más si el grupo se llena.

Funciona sin conexión después de la primera visita (service worker
network-first: con internet siempre usa la versión más nueva).

## Archivos

| Archivo | Qué hace |
|---|---|
| `js/periodos.js` | horas del portal, franjas, normalización de texto |
| `js/bits.js` | celdas de 10 min: marcar, huecos, popcount |
| `js/modelo.js` | grupos → secciones (con subgrupos) y máscaras por día |
| `js/calendario.js` | grilla semanal y vista por día |
| `js/preferencias.js` | pesos y penalización por sección |
| `js/solver.js` | búsqueda con poda, top-K exacto, plan B por sección |
| `js/worker.js` | corre el solver fuera del hilo principal |
| `js/entrada.js` | tabla HTML del portal → grupo |
| `js/estado.js` | localStorage |
| `js/ajustes.js` | vista del horario en el celular (compacta, lateral o lista) |
| `js/atajos.js` | atajos de teclado y su ayuda (`?`) |
| `js/main.js`, `js/ui.js` | arranque, navegación por hash y estado de la app |
| `js/materias.js`, `js/manual.js` | paso 1: cargar grupos, materia a mano, elegir materias |
| `js/horario.js`, `js/carrusel.js`, `js/filtros.js` | paso 2: opciones, carrusel y filtros |
| `js/busqueda.js` | solver en el hilo principal o en el Worker |
| `js/elecciones.js` | fijar, excluir y profesores (lo quiero / no) |
| `js/deshacer.js` | aviso con "Deshacer" |
| `js/dom.js` | `h()`, `$`, `llenar` y localStorage sin errores en modo privado |
| `js/agentes.js` | herramientas WebMCP para el agente del usuario (ver `llms.txt`) |
| `sw.js`, `manifest.webmanifest` | uso sin conexión / instalable |
| `tools/csv-a-json.js` | `data/horarios.csv` → `data/ejemplo.json` |

## Datos

### Horas

La UTP usa dos rejillas: períodos de 45 min cada 50 min desde las 7:00
(7:00–7:45, 7:50–8:35…) y, en algunos posgrados, horas de 55 min
(6:00–6:55pm, 7:00–7:55pm…). Un bloque guarda inicio y fin en minutos desde
las 0:00: `[dia, inicio, fin, tipo, aula, subgrupo?]`. Las filas seguidas de
la misma clase (con ≤ 10 min de recreo) se unen en un bloque.

Franjas por hora de inicio: mañana antes de 12:50, tarde antes de 5:00pm,
noche después. Los bloques del formato anterior (`[dia, k, n, …]` en
períodos) se convierten solos al cargar.

### Formato de un grupo

```json
{"grupo": "1GS232", "periodo": "II-2026", "sede": "PANAMA", "materias": [
  {"codasig": "1481", "codhora": 2682, "asignatura": "SISTEMAS OPERATIVOS",
   "profesor": "ZURITA, ARMANDO", "email": "...",
   "bloques": [[0, 1070, 1165, "L", "3-401"], [1, 1170, 1265, "C", "3-301"]]}
]}
```

Una **sección** es una materia de un grupo y se identifica por `codhora`.
Clase y Lab de la misma materia comparten `codhora`, así que van juntos.

**Subgrupos.** En el portal, `MÉTODOS NUMÉRIC(A )` y `(B )` son mitades del
grupo con laboratorios a horas distintas. Son del grupo entero: mientras B
está en una materia, A puede estar en otra a la misma hora. Cada materia
con subgrupos da una sección por letra del grupo (teoría + lo de esa letra),
y dos secciones del mismo grupo con letras distintas chocan.

**Mismo grupo.** Lo que se pisa en el horario oficial de un grupo (módulos
de maestría a la misma hora) no cuenta como choque entre sus secciones.

### Códigos

- `grupo` `1GS232` = sede (1 Panamá, 4 Veraguas) · carrera (GS) · turno
  (1 diurno, 2 nocturno) · año · número de grupo. También hay `11D234`,
  `1EG1010` o `V1R122`.
- `codhora` es correlativo: cada grupo recibe un bloque seguido, con las
  materias siempre en el mismo orden del plan.

## Modelo

Cada día se parte en celdas de 10 min desde las 7:00 (3 palabras de 32
bits, hasta las 11:00pm). Los inicios de las dos rejillas caen en múltiplos
de 10 y el fin se redondea hacia arriba, así que 7:45 y 7:50 o 6:55 y 7:00
quedan pegadas, sin hueco ni choque. Dos secciones chocan si alguna palabra
da `a[i] & b[i] ≠ 0` (con las reglas de subgrupos y mismo grupo de arriba).

Restricciones duras: exactamente una sección por materia y sin choques.

Penalidad de una combinación $c$:

$$P(c) = \sum_{s \in c} \text{pen}(s) + w_d \max(0, |D| - 1)\,[\text{menos días}] + w_h \cdot \text{celdas libres}$$

| Peso | Valor | Penaliza |
|---|---|---|
| horario | 10 | sección fuera del turno pedido |
| dias | 20 | cada día después del primero (con "Ir menos días") |
| hueco | 1 | cada celda de 10 min libre entre clases del mismo día (un período = 5) |

### Búsqueda

Búsqueda en profundidad con poda que guarda las $K = 50$ mejores. En cada
nodo revisa, para cada materia pendiente, qué secciones todavía caben
(*forward checking*):

- si una materia se quedó sin secciones, la rama se corta ahí;
- se ramifica primero por la materia con menos secciones que caben;
- la cota suma lo mínimo que todavía puede costar cada componente:
  la mejor sección que cabe en cada materia pendiente; los días actuales
  más los que alguna materia obliga a agregar; y los huecos actuales que
  ninguna sección pendiente puede llenar.

Si la cota no mejora a la peor del top-K, la rama se poda. El resultado es
exacto, salvo que la búsqueda pase de 1.5 s: entonces devuelve lo mejor que
encontró y la UI avisa que es parcial. Corre en un Web Worker, así que la
página nunca se congela.

Secciones fijadas: de esa materia solo se considera la fijada. Excluidas:
no se consideran.

## Tests

```bash
node --test tests/
```

El solver se compara contra una fuerza bruta independiente (datos de
ejemplo y 300 instancias aleatorias). `tests/rendimiento.test.js` fija los
casos que antes tardaban más de 20 s: tienen que terminar exactos.

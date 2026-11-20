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
| `js/periodos.js` | grilla de períodos, franjas, normalización de texto |
| `js/bits.js` | popcount y huecos sobre máscaras |
| `js/modelo.js` | grupos → secciones con máscaras por día |
| `js/preferencias.js` | pesos y penalización por sección |
| `js/solver.js` | búsqueda con poda, top-K exacto, plan B por sección |
| `js/worker.js` | corre el solver fuera del hilo principal |
| `js/entrada.js` | tabla HTML del portal → grupo |
| `js/estado.js` | localStorage |
| `js/ajustes.js` | vista del horario en el celular (compacta, lateral o lista) |
| `js/atajos.js` | atajos de teclado y su ayuda (`?`) |
| `js/ui.js`, `js/main.js` | pantallas y navegación por hash |
| `js/agentes.js` | herramientas WebMCP para el agente del usuario (ver `llms.txt`) |
| `sw.js`, `manifest.webmanifest` | uso sin conexión / instalable |
| `tools/csv-a-json.js` | `data/horarios.csv` → `data/ejemplo.json` |

## Datos

### Grilla de períodos

Todas las clases de la UTP caen en períodos de 45 min que arrancan cada
50 min desde las 7:00:

$$\text{inicio}(k) = 7{:}00 + 50k \qquad \text{fin} = \text{inicio} + 45$$

Un bloque son $n$ períodos seguidos (dura $50n - 5$ min). Por eso un bloque
se guarda como `[dia, k, n, tipo, aula]` y no hacen falta horas en ningún
cálculo. Franjas: mañana $k \le 6$ (7:00–12:45), tarde $7 \le k \le 11$
(12:50–4:55), noche $k \ge 12$.

### Formato de un grupo

```json
{"grupo": "1GS232", "periodo": "II-2026", "sede": "PANAMA", "materias": [
  {"codasig": "1481", "codhora": 2682, "asignatura": "SISTEMAS OPERATIVOS",
   "profesor": "ZURITA, ARMANDO", "email": "...",
   "bloques": [[0, 13, 2, "L", "3-401"], [1, 15, 2, "C", "3-301"]]}
]}
```

Una **sección** es una materia de un grupo y se identifica por `codhora`.
Clase y Lab de la misma materia comparten `codhora`, así que van juntos.

### Códigos

- `grupo` `1GS232` = sede (1 Panamá, 4 Veraguas) · carrera (GS) · turno
  (1 diurno, 2 nocturno) · año · número de grupo.
- `codhora` es correlativo: cada grupo recibe un bloque seguido, con las
  materias siempre en el mismo orden del plan.

## Modelo

Cada sección tiene una máscara de 32 bits por día (un bit por período).
Dos secciones chocan si para algún día `a[d] & b[d] ≠ 0`.

Restricciones duras: exactamente una sección por materia y sin choques.

Penalidad de una combinación $c$:

$$P(c) = \sum_{s \in c} \text{pen}(s) + w_d \max(0, |D| - d_{\max}) + w_h \cdot \text{huecos} + w_g \max(0, |G| - 1)$$

| Peso | Valor | Penaliza |
|---|---|---|
| horario | 10 | sección fuera de la franja pedida |
| profesor | 15 | profesor distinto al pedido |
| dias | 20 | cada día por encima del máximo |
| hueco | 5 | cada período libre entre clases del mismo día (si se activa) |
| grupo | 10 | cada grupo distinto después del primero (si se activa) |

### Búsqueda

Búsqueda en profundidad con poda que guarda las $K = 50$ mejores. En cada
nodo revisa, para cada materia pendiente, qué secciones todavía caben
(*forward checking*):

- si una materia se quedó sin secciones, la rama se corta ahí;
- se ramifica primero por la materia con menos secciones que caben;
- la cota suma lo mínimo que todavía puede costar cada componente:
  la mejor sección que cabe en cada materia pendiente; los días actuales
  más los que alguna materia obliga a agregar; un grupo más si alguna
  materia no cabe en ningún grupo ya usado; y los huecos actuales que
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

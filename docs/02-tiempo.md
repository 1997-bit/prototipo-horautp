# 2. Tiempo

Código: `js/periodos.js` y `js/bits.js`.

## 2.1 Rejillas

El motor guarda cada hora en minutos desde las 0:00. La UTP usa dos rejillas:

| Rejilla | Inicio | Fin | Ejemplo |
|---|---|---|---|
| A (períodos) | $420 + 50k$ | inicio + 45 | 7:00–7:45, 7:50–8:35 … 10:00–10:45pm |
| H (horas) | $60h$ | inicio + 55 | 6:00–6:55pm, 7:00–7:55pm |

La mayoría de los grupos usa la rejilla A. Algunos grupos de posgrado usan la rejilla H.

$$
\text{inicioMin}(k) = 420 + 50k \qquad \text{finMin}(k, n) = \text{inicioMin}(k + n - 1) + 45
$$

El motor usa `inicioMin` y `finMin` solo en el formulario a mano y en el formato viejo.

## 2.2 Hora de una fila

`minDesdeTexto(t)` lee la primera hora `H:MM` del texto. Si el texto tiene `A.M.` o `P.M.`, aplica esta regla:

$$
h' = \begin{cases} h + 12 & \text{P.M. y } h < 12 \\ 0 & \text{A.M. y } h = 12 \\ h & \text{otro caso} \end{cases}
\qquad \text{minutos} = 60h' + m
$$

Si el texto no tiene hora, el resultado es `NaN`.

`rangoDesdeTexto(t)` da `[inicio, fin]` o `null`:

1. Lee el inicio con `minDesdeTexto(t)`. El `A.M.`/`P.M.` del final vale para las dos horas.
2. Si no hay inicio, da `null`.
3. Lee el fin en el texto después del primer `-` o `–`.
4. Si no hay fin, usa inicio + 45. Esto pasa con el PDF: `05:50:00 PM`.
5. Si el inicio es mayor que el fin y es 720 o más, resta 720 al inicio.
6. Si el inicio es menor que el fin, da `[inicio, fin]`. Si no, da `null`.

| Etiqueta | Resultado |
|---|---|
| `7:00-7:45A.M.` | `[420, 465]` |
| `12:50-1:35P.M.` | `[770, 815]` |
| `6:00-6:55P.M.` | `[1080, 1135]` |
| `10:00-10:45P.M.` | `[1320, 1365]` |
| `11:30-12:15P.M.` | `[690, 735]` |
| `05:50:00 PM` | `[1070, 1115]` |
| `HORA` | `null` |

## 2.3 Unidades de 10 minutos

El motor divide cada día en 144 unidades de 10 minutos, de 0:00 a 24:00. Guarda las unidades en 5 números de 32 bits por día. Una sección tiene $7 \times 5 = 35$ números. El número del día $d$ y la parte $w$ está en la posición $5d + w$.

```mermaid
flowchart LR
  W0["parte 0<br/>unidades 0–31<br/>0:00–5:20"] --- W1["parte 1<br/>unidades 32–63<br/>5:20–10:40"] --- W2["parte 2<br/>unidades 64–95<br/>10:40–4:00pm"] --- W3["parte 3<br/>unidades 96–127<br/>4:00pm–9:20pm"] --- W4["parte 4<br/>unidades 128–143<br/>9:20pm–12:00"]
```

Para marcar un bloque `[inicio, fin)` del día $d$ (`marcar`):

$$
u(t) = \tfrac{t}{10},\qquad
a = \lfloor u(\text{inicio}) \rfloor,\qquad
b = \lceil u(\text{fin}) \rceil - 1
$$

1. Marca las unidades $a$ a $b$.
2. La unidad $x$ es el bit $x \bmod 32$ de la parte $\lfloor x/32 \rfloor$.

Para marcar los bits $lo$ a $hi$ de una parte, usa esta máscara de 32 bits:

$$
\text{tramo}(lo, hi) = (\texttt{-1} \ggg (31 - hi)) \;\&\; (\texttt{-1} \ll lo)
$$

Las dos rejillas no dan choques falsos. Todos los inicios son múltiplos de 10, y el motor redondea el fin hacia arriba:

| Clase | Última unidad | La clase siguiente empieza en |
|---|---|---|
| 7:00–7:45 | 46 (7:40–7:50) | unidad 47 (7:50) |
| 6:00–6:55pm | 113 (6:50–7:00) | unidad 114 (7:00pm) |

Un choque real entre las dos rejillas sí aparece. Por ejemplo, 6:00–6:55pm (unidades 108–113) choca con 5:50–6:35pm (107–111).

Las unidades cubren el día entero. Una clase a cualquier hora choca bien con las otras. Los datos reales van de 7:00 a 10:45pm.

## 2.4 Huecos

Una unidad libre está entre la primera y la última unidad ocupada del mismo día. Un hueco es una serie de unidades libres seguidas.

`huecosDia(partes, i0, salida)` usa las 5 partes del día:

$$
p = \text{primera unidad ocupada},\quad q = \text{última unidad ocupada},\quad
\text{libre}_w = \text{tramo}_w(p, q) \;\&\; \lnot\,\text{parte}_w
$$

1. Escribe las 5 máscaras $\text{libre}_w$ en `salida`.
2. Da la cantidad de unidades libres: $\sum_w \operatorname{popcount}(\text{libre}_w)$.

`tramosLibres(libre)` da la cantidad de huecos. Cuenta cada unidad libre cuya unidad anterior está ocupada:

$$
\text{huecos} = \sum_{w=0}^{4} \operatorname{popcount}\big(\text{libre}_w \;\&\; \lnot((\text{libre}_w \ll 1) \mid c_w)\big),\qquad c_0 = 0,\quad c_{w+1} = \text{libre}_w \ggg 31
$$

| Día | Unidades libres | Huecos |
|---|---|---|
| 7:00–7:45 y 7:50–8:35 | 0 | 0 |
| 7:00–7:45 y 8:40–9:25 | 5 | 1 |
| 7:00–7:45 y 10:00–10:45pm | 85 | 1 |
| 7:00–7:45, 8:40–9:25 y 10:00–10:45pm | 80 | 2 |

La penalidad usa las unidades libres. La pantalla muestra los huecos.

`popcount` cuenta los bits de un número de 32 bits:

```
x = x - ((x >>> 1) & 0x55555555)
x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
return imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
```

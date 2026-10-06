# Línea base de rendimiento de búsqueda (GoPersonal resolver)

> **Estado: línea base PARCIAL / PRELIMINAR.** La campaña completa (32 rondas × 22 escenarios) se cortó en la ronda 2 por un fallo del runner y, a pedido, no se relanzó. Los números de abajo tienen **n = 1 por escenario y condición**. Sirven para describir el flujo, ver dónde se va el tiempo y dejar el procedimiento listo. **No sirven** como p90 ni para comparar antes/después con significancia. La campaña corta propuesta está en §9.

## 1. Resumen de hallazgos

- **Escala del tiempo percibido.** Ver productos reales tarda **~7-12 s** en la búsqueda tipeada (SPA) y **~10-22 s** en la carga directa (SSR). El resolver tarda **1-2,5 s** en un *miss* y **~0,05-0,13 s** en un *hit*. La mayor parte del tiempo percibido está **fuera del resolver**:
  - `__pickRuntime` / SSR de VTEX IO;
  - el render del theme;
  - el TTFB del HTML: 6,5 s y 9,7 s hasta el HTML completo en `jbl direct-nocache`.

  Esto se midió con Resource Timing frente a los spans del resolver. Las causas exactas dentro de VTEX/theme **no se descompusieron**; son hipótesis.
- **Dentro del resolver (miss).** Las dos esperas externas dominan, en secuencia:
  - GoPersonal `/search`: 0,7-1,4 s;
  - hidratación de catálogo: 0,13-1,3 s, en 5 lotes paralelos de 50 donde el más lento marca el total.

  El procesamiento propio (settings, facetas, filtro, paginado) es ≤ ~110 ms.
- **La caché del result set funciona.** En un hit, `productSearch` del resolver baja de ~250-2800 ms a 46-58 ms. Aun así, en el navegador el *repeat* sigue en 6-10 s, así que el cuello percibido no es el resolver.
- **Entorno inestable.** El harness re-ejecuta `vtex link` cada 60-105 s (§2.3). Eso provoca 500/504 intermitentes y reinicios del proceso. Es la causa principal de que la muestra sea chica.

## 2. Entorno

| Campo | Valor |
|---|---|
| Fecha | 2026-10-06 (15:54-18:11 UTC) |
| Rama | `feature/analisis-y-fix-de-tiempo_1791231210706` |
| Commit medido | `b168e273d66e681ba1fae3c0d75acadce02fe22a` (código linkeado). `2373e05` es un auto-commit del harness que no toca código. |
| Cuenta / workspace | `coolboxpe` / `buscador`, https://buscador--coolboxpe.myvtex.com |
| App | `coolboxpe.gopersonal-search-resolver@2.0.0` (linkeada). `service.json`: timeout 12 s, workers 2, memory 2048, ttl 30 |
| Theme | `coolboxpe.store-search@0.2.0`, `vtex.search-result@3.150.2` |
| Origen de las pruebas | Contenedor de desarrollo (Linux), hacia el storefront público vía CloudFront |
| Navegador | Chromium 155.0.8059.12 headless, Playwright 1.64.0-alpha, Node v24.14.0, viewport 1366×900, concurrencia 1 (un paso medido a la vez) |
| Auth | Token VTEX ID obtenido en tiempo de ejecución (appkey/apptoken → `vtexid/apptoken/login`) e inyectado como cookie. **No se guarda en el repo ni en los datos.** |
| Logs | Logger propio, `GET /api/logs` (ver `loggerUrl` en `scenarios.json`). Mensajes `timing:productSearch` y `timing:facets` con spans. La correlación se hace por el header `x-perf-run` que agrega el runner. |

### 2.1 Instrumentación (commits)

Son solo logs; no cambia ninguna respuesta:

- `d3cf3de`: bootId, pid y uptime del worker en cada log de timing; span `local.page` con hydrated, recordsFiltered y returned; span `filterableFields.memoryHit`.
- `b168e27`: número de request por worker (detecta el proceso frío).

El único cambio "funcional" en `productSearch.ts` es extraer `filtered.slice(from, to+1)` a una variable para loguear su largo. La salida es idéntica.

### 2.2 Archivos de esta línea base (sin cambios funcionales)

| Archivo | Qué es |
|---|---|
| `docs/perf/baseline.js` | Runner Playwright |
| `docs/perf/scenarios.json` | Escenarios y tiempos, sin secretos |
| `docs/perf/analyze.js` | Clasificación, estadísticas, CSV y tablas |
| `docs/perf/restart_probe.py` | Sondeo de reinicios |
| `docs/perf/data/` | Datos crudos (§8) |

No se tocó configuración del entorno, ni `.env`, ni `manifest.json`/`service.json`. No se hizo `vtex link` ni `publish`.

**Nota de integridad.** El 2026-10-06 a las 18:11 UTC el directorio `docs/perf/` (todavía no commiteado) desapareció del disco, en el mismo minuto que el auto-commit `2373e05` del harness. Eso mató al runner con `ENOENT`. Los scripts se **reconstruyeron** reaplicando las ediciones registradas en la sesión. La versión final difiere en 1-2 líneas de numeración respecto de la que corrió, según el stack trace. Los datos de smoke1-3, de la corrida abortada y del probe estaban copiados en `/tmp` y se recuperaron. **Se perdieron** los `runs.jsonl` y `logs.jsonl` de la campaña `bl20261006`; de ella solo queda la salida de consola.

### 2.3 Limitación principal: reinicios del link

El harness (`app.js`, cada 15 s) relanza `vtex link` cuando nadie escucha en :8000. Hay un build log en `/tmp/.server-logs` cada 60-105 s; entre las 18:00 y las 18:15 hubo 15.

El probe (`data/restart-probe/`: 96 requests, 93 logs, 8 reinicios) mostró:

- la primera request del nuevo proceso llega **29-36 s** después del build log;
- los 500 caen a 25,8 / 28,0 / 33,9 s.

**Sí, los reinicios persisten.** Las corridas afectadas se separan (§5).

## 3. Matriz de escenarios

Términos (`scenarios.json`):

| id | Término | URL efectiva | Ruta efectiva | Total | Visibles p1 | Filtro | Resultado del filtro |
|---|---|---|---|---|---|---|---|
| jbl | `jbl` | `/jbl?_q=jbl&map=ft` | **Marca** (`map=b`, sin fullText): `map=ft` no implica texto | 250 | 48 | `category-2-parlantes` | 125 |
| audifonos | `audifonos` | `/audifonos?_q=audifonos&map=ft` | Texto (fullText) | 44 | 44 (sin página 2) | `brand-jbl` | 6 |
| smart-tv | `smart tv` | `/smart%20tv?_q=smart%20tv&map=ft` | Texto | 107 | 48 | `brand-samsung` | 38 |

- **Orden:** relevancia por defecto, sin sort.
- **Página:** 48 productos (`from 0..47`; página 2 = `48..95`).
- **Hidratados:** el resolver pide a GoPersonal e hidrata el set completo (hasta 250), que es el `hydrated` del log. Visibles = tarjetas `.coolboxpe-store-search-0-x-galleryItem` con product summary.

Condiciones. Cada término abre contextos A-D en la home; E es un contexto nuevo por carga directa:

| Condición | Acción | Estado de caché buscado |
|---|---|---|
| `first` (A) | Tipear el término en el input de la home + Enter (navegación SPA) | **Sin caché**: result set expirado (> 35 s desde el último toque del término) |
| `repeat` (B) | Misma búsqueda tipeada en otro contexto, inmediatamente después | **Con caché** (< 27 s) |
| `page2` (A) | Clic en página 2 | Con caché |
| `filter` (B) | Clic en el checkbox del filtro | Con caché |
| `prep` (C, D) | Búsqueda tipeada para preparar la página; no se mide | — |
| `page2-nocache` (C) | Esperar la expiración y luego página 2 | Sin caché |
| `filter-nocache` (D) | Esperar la expiración y luego el filtro | Sin caché |
| `direct-nocache` / `direct-cache` (E) | `goto` de la URL (SSR) en un contexto nuevo | Sin caché / con caché |

**Condición de éxito.** La galería muestra los productos de **esa** respuesta: el primer href de la galería coincide con la respuesta, y la marca de DOM es posterior al `responseEnd` (así no cuenta una galería vieja). Además:

- el contador coincide con `recordsFiltered`;
- en un filtro, todos los productos cumplen el filtro;
- en página 2, la respuesta es `from=48`.

Contadores o skeletons solos no cuentan.

## 4. Caché: capas y cómo se verificó el estado

| Capa | Dónde | TTL | La vacía… |
|---|---|---|---|
| Result set (ids de GP + productos hidratados) | Memoria del worker, máx. 20 por worker | 30 s | La expiración (se espera 35 s) o un reinicio del proceso |
| In-flight (dedupe) | Memoria | Mientras dure la carga | — |
| `knownFields` (campos filtrables) | Memoria | 10 min | Reinicio |
| Campos filtrables | VBase | Persistente | No se vacía en las pruebas |
| Settings de la app | Memoria/app settings | — | — |
| CDN/CloudFront y caché de VTEX IO/SSR | Fuera del app | Desconocido | **No controlable**. Recargar o abrir un contexto nuevo **no** vacía cachés del servidor. |

- **"Sin caché"** significa: result set expirado, con el mismo proceso ya caliente. No se vacían VBase ni `knownFields`, para no mezclar un *miss* del result set con un arranque en frío o un rebuild de VBase.
- **"Con caché"**: menos de 27 s desde el último toque del término.
- **Preparación de página 2 y filtro sin caché:** el contexto C/D hace la búsqueda (prep), se espera a que expire y luego se hace clic.

**Verificación en logs.** Cada paso se correlaciona con sus logs por `perfRun` (en el SSR, por tiempo y término):

| Estado observado | Spans en el log |
|---|---|
| Miss | `resultSet.load` (con `gopersonal.search` y `catalog.hydrate` adentro) o `resultSet.awaitInflight` |
| Hit | Solo `resultSet.cacheHit` |

El análisis marca **inválida** una corrida si:

- el estado observado difiere del buscado (`cache-miss` / `cache-not-expired`);
- cae en la ventana de reinicio (20-40 s tras un build log; 15-50 s con `--wide`);
- está entre las primeras 3 requests del worker (`cold-process`);
- no tiene log del resolver.

## 5. Ejecuciones: intentos, éxitos, errores y timeouts

Parámetros fijados de antemano:

- **Timeouts:** home 90 s, paso SPA 60 s, carga directa 90 s.
- **Ritmo:** concurrencia 1; espera de expiración 35 s; *gate* de 42 s tras el último build log antes de cada fase sin caché.
- **Reintentos:** ninguno. Una falla queda registrada y no se reemplaza; si falla el paso previo de ese contexto, el siguiente queda `skipped`.

| Corrida | Hora (UTC) | Pasos | Medidos (sin prep) | Éxito | Error | Timeout | Saltado | Uso |
|---|---|---|---|---|---|---|---|---|
| smoke1 | 17:00-17:07 | 28 | 22 | 18 | 3 | 0 | 1 | Depurar el runner; sus errores exponen bugs del runner ya corregidos (filtro no montado) y 500 reales. **No comparable.** |
| smoke2 | 17:16-17:29 | 28 | 22 | 11 | 4 | 4 | 3 | Igual que smoke1. **No comparable.** |
| smoke3 | 17:32-17:40 | 28 | 22 | 21 | 0 | 1 | 0 | Runner final. **Única fuente de cifras**, n=1. |
| aborted-bl20261006 | 17:45-17:51 | 56 | — | 17 (warmup) | 39 | 0 | 1 | Abortada a mano para corregir el runner. Los errores son `browser has been closed` (del runner, no de la app), salvo un 500. **Excluida.** |
| bl20261006 | 17:52-18:11 | 39 | 29 | 21 | 4 | 3 | 1 | Ronda 1 = warmup (excluida); ronda 2 cortada por `ENOENT` (§2.2). Solo hay consola (`data/bl20261006-console-runs.csv`), sin logs del resolver, así que el estado de caché **no es verificable**. |

Ronda 2 de bl20261006 (la única medida, incompleta):

- jbl: `first` éxito 10,2 s; `repeat` 504; `page2` 504; `filter` saltado; prep C/D 500.
- audifonos: `first` 12,9 s, `repeat` 6,8 s, `filter` 6,5 s.

Esa ronda cayó justo en la ventana de reinicio de las 18:07:18.

### 5.1 "26 pasos correctos" frente a "22 ejecuciones y un timeout"

Ambos se refieren a smoke3 y no se contradicen; cuentan cosas distintas:

- **"26 pasos correctos"** se escribió **mientras smoke3 todavía corría**: eran las líneas de éxito impresas hasta ese momento.
- La corrida terminó con **28 pasos: 27 éxitos y 1 timeout** (`smart-tv direct-nocache`).
- **6** de esos pasos son `prep` (preparación, no medidos). Quedan **22 pasos medidos: 21 éxitos + 1 timeout**. Ese es el número del análisis; el "22 de 23" que se dijo antes estaba mal.
- De esos 22, el análisis solo considera **limpias 5**: smart-tv first y repeat, audifonos filter y filter-nocache, jbl direct-nocache. Las otras 17 caen en ventanas de reinicio (15) o en proceso frío (2). Éxito del paso ≠ medición comparable.

### 5.2 ¿La espera de 42 s da estabilidad?

**No se verificó estabilidad real.** El gate solo garantiza que **el comienzo** de una fase esté a ≥ 42 s del último build log, es decir, pasada la ventana de 25-36 s donde se observaron los 500 y el proceso nuevo.

El próximo reinicio llega 60-105 s después del anterior, o sea 18-63 s después de iniciada la fase. Como un paso dura 7-20 s y una fase encadena varios, **los pasos siguientes pueden caer en la siguiente ventana**. Eso pasó en la ronda 2: 504/500 en jbl entre 18:06:47 y 18:07:50.

Además, el reinicio vacía la memoria (result set y `knownFields`), así que el estado "con caché" puede romperse a mitad de fase. La única defensa es la invalidación a posteriori por logs (bootId y ventana).

## 6. Resultados (smoke3, n = 1 por celda)

Percentiles: interpolación lineal (R-7). Con n=1, mediana = p90 = media = mín = máx, por eso **no se informa p90**. Con n < 10, el p90 está determinado por el 1-2 valores más altos y no debe usarse.

### 6.1 Navegador: tiempo hasta ver productos reales (ms), todos los pasos exitosos de smoke3

"Limpia" = fuera de la ventana de reinicio, caché verificada y proceso caliente.

| Término | Condición | ms | Limpia | Visibles / total | Filtro/página OK |
|---|---|---|---|---|---|
| smart-tv | first (sin caché) | **11163** | sí | 48 / 107 | — |
| jbl | first | 12236 | no (reinicio) | 48 / 250 | — |
| audifonos | first | 11429 | no (reinicio) | 44 / 44 | — |
| smart-tv | repeat (con caché) | **9797** | sí | 48 / 107 | — |
| jbl | repeat | 7431 | no | 48 / 250 | — |
| audifonos | repeat | 8589 | no | 44 / 44 | — |
| jbl | page2 (caché) | 7155 | no | 48 / 250 | sí |
| smart-tv | page2 (caché) | 7783 | no | 48 / 107 | sí |
| jbl | page2-nocache | 12857 | no | 48 / 250 | sí |
| smart-tv | page2-nocache | 11258 | no (proceso frío) | 48 / 107 | sí |
| audifonos | filter (caché) | **6979** | sí | 6 / 6 | sí |
| jbl | filter | 1444 | no | 48 / 125 | sí |
| smart-tv | filter | 7259 | no | 38 / 38 | sí |
| audifonos | filter-nocache | **5947** | sí | 6 / 6 | sí |
| jbl | filter-nocache | 8340 | no (proceso frío) | 48 / 125 | sí |
| smart-tv | filter-nocache | 3260 | no | 38 / 38 | sí |
| jbl | direct-nocache (SSR) | **18624** (TTFB 6515, HTML 9698) | sí | 48 / – | — |
| audifonos | direct-nocache | 12530 | no | 44 | — |
| smart-tv | direct-nocache | **timeout 90 s** | no | — | — |
| jbl / audifonos / smart-tv | direct-cache | 18217 / 9864 / 21954 | no | 48 / 44 / 48 | — |

Sumando smoke1-3 (pasos exitosos no-prep, **mezcla de condiciones de entorno: solo orientativo**), las medianas son:

| Condición | Mediana | n |
|---|---|---|
| first | 10,7 s | 8 |
| repeat | 7,7 s | 8 |
| page2 | 7,5 s | 4 |
| filter | 3,9 s | 5 |
| page2-nocache | 12,0 s | 4 |
| filter-nocache | 4,8 s | 7 |
| direct-nocache | 18,2 s | 6 |
| direct-cache | 19,1 s | 8 |

### 6.2 Navegador frente al resolver (corridas limpias, ms)

| Escenario | Request que entrega productos | Productos visibles | Resolver `productSearch` | `resultSet.load` | GoPersonal | Hidratación (lote máx) | Propio (settings+facetas+filtro) |
|---|---|---|---|---|---|---|---|
| smart-tv first (miss) | pickRuntime 3715 (client pS 1022) | 11163 | 252* | 2114 | 1361 | 752 (749) | 7+53 |
| smart-tv repeat (hit) | pickRuntime 1353 | 9797 | 58 | — (cacheHit) | — | — | 5+52 |
| audifonos filter (hit) | client pS 376 / facets 460 | 6979 | 46 | — | — | — | 6+19+2 |
| audifonos filter-nocache (miss) | client pS 1742 / facets 3945 | 5947 | 1178 | 1110 | 981 | 129 (127) | 6+20+1 |
| jbl direct-nocache (miss, SSR) | TTFB 6515 | 18624 | 2789 | 2027 | 745 | 1280 (1279) | 6+104 |

\* En smart-tv first, la request que medimos esperó al *in-flight* (`awaitInflight` 2114) de otra llamada paralela del mismo término. Las etapas son anidadas, `resultSet.load` ⊃ {GP → hidratación → filterableFields}, y paralelas entre `productSearch` y `facets`, que comparten la misma carga.

**Medido frente a estimado.** La diferencia "visibles − request" (por ejemplo, 11,2 s − 3,7 s en smart-tv first) es tiempo de navegador, theme y otras requests, **medido como total**. No está descompuesto, así que atribuirlo a "overhead de VTEX" sería una estimación. En un hit, el resolver tarda 58 ms y aun así el usuario espera ~9,8 s. Lo que sí está medido es que ese tiempo no está en el resolver.

## 7. Diferencia prod 10-13 s frente a 0,9-2 s

No midieron lo mismo:

- Los **10-13 s** eran cargas completas de página con Playwright MCP, cronometradas con `date` alrededor de las llamadas a la herramienta. Incluyen el SSR, el render y 1-3 s de overhead de la herramienta.
- Los **0,9-2 s** eran duraciones de la request GraphQL o del resolver.

Esta línea base confirma ambos órdenes de magnitud en la misma corrida: request/resolver de 0,05-2,8 s frente a productos visibles de 6-22 s.

## 8. Datos

En `docs/perf/data/`:

- **`smoke3/`**: `runs.jsonl` (cada paso, con timings, requests y conteos), `logs.jsonl` (logs de timing sanitizados), `runs.csv`, `spans.csv`, `summary.json` y `tables.md`, más sus variantes `-wide`.
- **`smoke1/`, `smoke2/`, `aborted-bl20261006/`**: crudos y su análisis. No comparables.
- **`bl20261006-campaign.log`** y **`bl20261006-console-runs.csv`**: lo único que queda de la campaña cortada.
- **`restart-probe/`**: requests del probe, logs y horas de los build logs.

Los datos no contienen tokens, cookies ni appkeys (se verificó con grep).

## 9. Cómo repetir y campaña corta propuesta

### Requisitos

- Node ≥ 20 y `playwright-core` con Chromium. En este contenedor: `NODE_PATH=/opt/playwright-cli/node_modules PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright-cli`.
- Acceso de lectura a `/tmp/.server-logs` (horas de reinicio) y al logger.

### Comandos

```bash
# token en tiempo de ejecución (no se guarda): o VTEX_ID_TOKEN, o appkey/apptoken
export VTEX_APP_KEY=...  VTEX_APP_TOKEN=...
node docs/perf/baseline.js --campaign=after-<fecha> --iterations=10 --warmups=1 \
     [--terms=jbl,audifonos] [--conditions=first,repeat,page2,filter]
node docs/perf/analyze.js docs/perf/data/after-<fecha>          # tablas.md, summary.json, runs.csv
node docs/perf/analyze.js docs/perf/data/after-<fecha> --wide   # ventana de reinicio 15-50 s
```

### Procedimiento por ronda

Lo hace el runner; ver `runRound` en `baseline.js`. Por término:

1. Esperar la expiración (35 s desde el último toque del término) y luego el gate (42 s tras el último build log).
2. **first (A)**: en la home, escribir en `input[placeholder*="Qué estás buscando"]` y pulsar Enter.
3. **repeat (B)**: lo mismo en otro contexto.
4. **page2 (A)**: clic en el control de página 2; se espera `productSearchV3` con `from=48`.
5. **filter (B)**: esperar a que monte el `input#<filtro>` y hacer clic en su label.
6. **prep C/D**: búsquedas tipeadas.

Después:

- tras la expiración y el gate, **page2-nocache (C)**;
- tras la expiración y el gate, **filter-nocache (D)**;
- para cerrar, **direct-nocache** y **direct-cache** en un contexto nuevo (E).

Cada paso manda `x-perf-run=<campaña>-rNN-<term>-<cond>-<slot>` para correlacionarlo con los logs.

### Campaña corta propuesta (pendiente)

- **Alcance:** jbl y audifonos × {first, repeat, page2 (solo jbl), filter, filter-nocache, direct-nocache}, con **10 rondas medidas + 1 warmup**. Una ronda de 2 términos dura ~9 min, así que el total es **~1 h 40 min**.
- **Qué se puede reportar:** con n=10 limpias por celda, la mediana es usable. El p90 solo como indicativo (interpolado entre los 2 valores más altos). Para un p90 confiable harían falta ≥ 30.
- **Requisito de estabilidad (imprescindible):** que el harness deje de relanzar `vtex link`, es decir, un link estable o un proceso escuchando en :8000.
  - Verificarlo antes de empezar: **ningún** `/tmp/.server-logs/build-*.log` nuevo en 10 min, y el `bootId` de los logs constante.
  - Si no se cumple, la tasa de corridas limpias observada (5/22) haría falta ~4× más tiempo y aun así quedaría sesgada.
- **Otros requisitos:**
  - No correr con el directorio de salida sin commitear cerca de un auto-commit; usar `--out=/tmp/...` y copiar al final.
  - No tocar la app durante la campaña.

### Tabla para la comparación posterior

| Escenario / condición | Mediana antes | p90 antes | Mediana después | p90 después | Reducción abs. | Reducción % | Error antes | Error después | Visibles antes/después | Total antes/después | Hidratados antes/después |
|---|---|---|---|---|---|---|---|---|---|---|---|
| jbl first | 12236 (n=1, no limpia) | – | | | | | | | 48 / | 250 / | 250 / |
| audifonos first | 11429 (n=1, no limpia) | – | | | | | | | 44 / | 44 / | 44 / |
| smart-tv first | 11163 (n=1) | – | | | | | | | 48 / | 107 / | 107 / |
| smart-tv repeat | 9797 (n=1) | – | | | | | | | 48 / | 107 / | 107 / |
| jbl page2 | 7155 (n=1, no limpia) | – | | | | | | | 48 / | 250 / | |
| audifonos filter | 6979 (n=1) | – | | | | | | | 6 / | 6 / | 44 / |
| audifonos filter-nocache | 5947 (n=1) | – | | | | | | | 6 / | 6 / | 44 / |
| jbl direct-nocache | 18624 (n=1) | – | | | | | | | 48 / | – | 250 / |

Antes de dar por buena una mejora, comprobar en `runs.csv`:

- que `visible`, `recordsFiltered` y `hydrated` no bajaron;
- que `filterCorrect` y `pageCorrect` son `true`;
- que `visibleMatchesResponse` se cumple.

Una baja en hidratados o en el total explicaría una "mejora" falsa.

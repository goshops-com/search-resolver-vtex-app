# Línea base de rendimiento de búsqueda (referencia inicial)

> Referencia **orientativa**, no verificada estadísticamente. Junta dos fuentes que no deben mezclarse: el informe anterior (§1) y observaciones nuevas (§2). Para una comparación estricta antes/después hay que repetir también la versión anterior con el mismo procedimiento y en el mismo momento.

Entorno común: cuenta/workspace `coolboxpe` / `buscador` (https://buscador--coolboxpe.myvtex.com), app `coolboxpe.gopersonal-search-resolver@2.0.0` linkeada. `service.json`: timeout 12 s, 2 workers, TTL 30.

## 1. Fuente A: informe anterior (2026-10-05), posterior al arreglo de VBase

- **Commit:** las mediciones son posteriores a `81af25e` (`fix(facets): guardar los campos filtrables en VBase de verdad`, 2026-10-05 21:18 UTC). La instrumentación es de `84008df`, `ea61516` y `2c67d0b`. El commit exacto desplegado durante la medición **no está registrado**.
- **Datos originales:** **no se conservan**; los logs crudos no están en el repo. Las cifras se transcriben del informe anterior y **no** fueron verificadas por la campaña nueva.

### 19 búsquedas sin caché de resultados (tiempos del resolver)

| Etapa | Mediana | p90 |
|---|---|---|
| Configuración (settings) | 29 ms | 120 ms |
| GoPersonal | 725 ms | 1107 ms |
| Catálogo VTEX (hidratación) | 1609 ms | 2714 ms |
| Campos filtrables (VBase) | 28 ms | 68 ms |
| Armar filtros | 120 ms | 181 ms |
| **Total del resolver** | **2760 ms** | **3797 ms** |

Las etapas no suman exactamente el total, porque las medianas no son aditivas.

### Con caché de resultados

- **Mediana del resolver: 122 ms.** El tamaño de esa muestra no está registrado.

## 2. Fuente B: observaciones nuevas (2026-10-06, corrida smoke3)

- **Commit:** `b168e27`. Respecto de la Fuente A solo agrega logs; no cambia nada funcional.
- **Fiabilidad:** n = 1 por escenario. El harness relanzó `vtex link` cada ~60-105 s y 17 de los 22 pasos cayeron en ventanas de reinicio o con el proceso recién arrancado. Son **observaciones, no referencia**.
- **Datos:** commiteados en `3ef28fa` (`docs/perf/data/smoke3/`). El árbol de trabajo posterior los muestra borrados por el auto-commit del harness; se recuperan con `git show 3ef28fa:<ruta>`.

| Observación (pasos limpios) | Resolver | Productos visibles en el navegador |
|---|---|---|
| audifonos, filtro sin caché | 1178 ms (GoPersonal 981) | 5,9 s |
| jbl, carga directa sin caché (SSR) | 2789 ms (GoPersonal 745, hidratación 1280) | 18,6 s (primer byte del HTML a los 6,5 s) |
| smart-tv, repetición con caché | 58 ms | 9,8 s |

Los demás tiempos de página de smoke3 (de 3 a 22 s, más un timeout de 90 s) están afectados por los reinicios y no deben usarse como referencia.

## 3. Análisis

- **Dónde está el tiempo del resolver sin caché:** sobre todo en la hidratación contra el catálogo VTEX (~58 % de la mediana) y en GoPersonal (~26 %). Lo propio (settings, VBase y filtros) suma ~180 ms en la mediana.
- **Con caché**, el resolver baja a ~0,1 s.
- **Qué incluye la medición del resolver:** desde que entra `productSearch` (o `facets`) hasta que devuelve. Abarca settings, la llamada a GoPersonal, la hidratación, los campos filtrables, el filtrado y el paginado.
- **Qué no incluye:**
  - la red cliente↔VTEX y el edge/CloudFront;
  - `vtex.search-graphql` y el SSR del theme;
  - las otras requests de la página;
  - el render en el navegador.
- **Tiempo de página:** el que ve el usuario (segundos) es muy superior al del resolver, incluso con caché (58 ms frente a 9,8 s). Se observó, pero no está desglosado; atribuirlo a VTEX o al theme es una hipótesis.

## 4. Receta para la comparación futura

| Término | URL | Ruta | Total | Visibles en la página 1 | Filtro documentado | Resultado del filtro |
|---|---|---|---|---|---|---|
| jbl | https://buscador--coolboxpe.myvtex.com/jbl?_q=jbl&map=ft | Marca (sin fullText) | 250 | 48 | `category-2-parlantes` (Parlantes) | 125 |
| audifonos | https://buscador--coolboxpe.myvtex.com/audifonos?_q=audifonos&map=ft | Texto | 44 | 44 (sin página 2) | `brand-jbl` (JBL) | 6 |

- **Orden:** relevancia por defecto, sin sort.
- **Página:** 48 productos.
- **Paginación** (solo jbl): clic en página 2, que dispara `productSearchV3` con `from=48` (productos 48 a 95).
- **Totales:** son de 2026-10-06. GoPersonal no es determinista y el total puede variar unos pocos productos.

**Sin caché de resultados:**
1. Esperar **más de 30 s** (TTL del result set; usar 35 s) desde la última búsqueda del mismo término, o reiniciar el proceso.
2. Abrir la URL o hacer la búsqueda.
3. Confirmar en los logs `timing:productSearch` que aparezca el span `resultSet.load`.

**Con caché de resultados:**
1. Repetir la misma búsqueda **dentro de los 30 s**.
2. Confirmar que aparezca `resultSet.cacheHit`.

Límites de la caché:
- Recargar la página no vacía las cachés del servidor.
- El CDN y la caché de VTEX IO o del SSR no se pueden controlar (su TTL no está registrado).

**Medición:**
- **Inicio:** el clic o el Enter de la búsqueda, o el `goto` de la URL en una carga directa.
- **Fin en el navegador:** hay tarjetas `.coolboxpe-store-search-0-x-galleryItem` visibles con datos de producto reales.
- **Fin en el resolver:** el total que reporta `timing:productSearch`.

**Antes de medir:**
- No debe haber builds ni reinicios en los últimos 10 min, y el `bootId` debe ser el mismo en todos los logs.
- Hacer al menos 10 repeticiones por celda; para un p90 confiable, 30 o más.

**Scripts:**
- `docs/perf/baseline.js`, `scenarios.json` y `analyze.js`, en `3ef28fa`.
- Fueron reconstruidos y pueden diferir levemente de la versión que corrió.

**No registrado:**
- el TTL de la caché CDN/SSR;
- el commit exacto de la Fuente A;
- el n de la mediana con caché de la Fuente A;
- el tiempo de página sin reinicios.

## 5. Antes / después (tiempo del resolver)

| Métrica | Antes (Fuente A) | Después |
|---|---|---|
| Mediana sin caché | 2760 ms | |
| p90 sin caché | 3797 ms | |
| Mediana con caché | 122 ms | |

"Antes" viene de un informe anterior cuyos datos crudos no se conservan. Es orientativo: una comparación estricta requiere repetir la versión anterior con esta misma receta.

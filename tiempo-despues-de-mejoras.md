# Tiempos de búsqueda después de las mejoras

Segunda medición, para comparar con `tiempo-antes-de-mejoras.md`. La mejora es
que GoPersonal devuelve cada producto en `vtex_product`, así que el resolver ya
no lo hidrata desde el catálogo de VTEX.

## Cómo se midió

- 2026-10-16, contra `buscador--coolboxpe.myvtex.com` (app **linkeada**), por
  `/_v/private/graphql/v1`.
- Query `productSearch` (primeros 12 productos, con precio, stock, imágenes y
  cuotas), un término distinto en cada request para medir en frío.
- Tiempo total del cliente, `x-vtex-backend-elapsed-time` (lo que tarda VTEX
  desde el router) y los spans internos del resolver (`services/timing.ts`),
  devueltos por una sonda temporal ya retirada.
- 13 búsquedas válidas: monitor, televisor, smartwatch, impresora, mouse,
  parlante, tablet, laptop, audifonos, refrigeradora, celular, lavadora, drone.
- Se descartaron las requests que fallaron por el reinicio del link (504 y
  `Connection refused`).

## Comparación con la línea base

| Escenario | Antes | Después |
| --- | --- | --- |
| Resolver en frío (p50) | 2.8 s | 2.0 s |
| Hidratación del catálogo | 1.6 s (250 ids, ~6 MB) | 0 s (0 ids) |
| GoPersonal `/search` | 0.7 s | 1.9 s |
| Request completa en frío (p50) | ~4.3 s (productSearch + facets, "laptop") | 2.9 s (productSearch) |
| Página completa, productSearch + facets en paralelo | ~4.3 s | 2.1–3.9 s |
| Cache hit (mismo set en 30 s) | 0.5–0.9 s | 0.6–1.0 s (resolver 0.12–0.13 s) |
| Producción `www.coolbox.pe` (VTEX IS, sin el resolver) | 0.4–2.4 s la página | sin cambios |

## Desglose del tiempo total, en frío (p50 de 13 búsquedas)

| Tramo | p50 | Rango | % del total |
| --- | --- | --- | --- |
| Red y CDN (cliente → router VTEX y vuelta) | 0.51 s | 0.17–0.57 s | 18 % |
| Otras apps de VTEX (router, graphql-server, `vtex.search-graphql`) | 0.28 s | 0.20–1.26 s | 10 % |
| **Nuestra app (resolver)** | **2.05 s** | **1.40–2.96 s** | **72 %** |
| **Total** | **2.86 s** | **2.05–4.01 s** | 100 % |

## Desglose dentro de nuestra app (p50)

| Etapa | p50 | Rango | Qué es |
| --- | --- | --- | --- |
| GoPersonal `/search` | 1.94 s | 1.02–2.42 s | Llamada HTTP más parseo de `vtex_product` (~0.25 s para 250) |
| Facets locales (`local.buildFacets`) | 0.11 s | 0.01–0.16 s | Facets armados desde los 250 productos |
| Specs filtrables (`catalog.filterableFields`) | 0 s | 0–0.58 s | Cache en memoria; cuesta 0.4–0.6 s cuando aparecen specs no vistas |
| Settings de la app | 5 ms | 4–64 ms | |
| Hidratación del catálogo | 0 s | 0 s | 250 de 250 vienen en `vtex_product` |
| Resto (argumentos, filtrar, paginar) | 8 ms | 6–17 ms | |

GoPersonal es el 95 % del tiempo de nuestra app y ~68 % del total.

## GoPersonal `/search` medido directo (sin VTEX)

| Búsqueda | `page_size` | Tiempo | Respuesta (gzip) |
| --- | --- | --- | --- |
| laptop | 12 | 1.2–1.8 s | 72 KB |
| laptop | 50 | 1.7–1.9 s | 278 KB |
| laptop | 250 | 2.2–2.3 s | 1.4 MB (9.5 MB sin comprimir) |
| mouse / silla / tablet / audifonos | 250 | 1.6–2.3 s | 0.5–1.1 MB |

La mayor parte es la propia búsqueda de GoPersonal: con 12 hits ya tarda más
de 1.2 s. Pasó de 0.7–1.2 s (2026-10-01) a 1.0–2.4 s.

## Conclusiones

- Ya no se hidrata nada del catálogo: el resolver bajó de 2.8 s a 2.0 s y la
  request de 4.3 s a 2.9 s.
- El cuello pasó a ser GoPersonal `/search`. Lo que queda del lado de VTEX es
  ~0.8 s fijo (red, router y graphql) y no lo controlamos.
- Lo que más ayudaría ahora, del lado de GoPersonal:
  1. Bajar la latencia de `/search` (antes era 0.7 s).
  2. Devolver solo `vtex_product`: el resto del payload es el 46 % de la
     respuesta y no se usa.
  3. No pasar a minúscula `vtex_product`, para ahorrar el mapeo de claves
     (~0.25 s).
- Del lado de la app, alargar la cache de 30 s convierte más búsquedas en el
  caso de ~0.6 s.
- Las mediciones son contra una app linkeada (instancia única, se reinicia
  con cada build); conviene repetirlas con la app instalada.

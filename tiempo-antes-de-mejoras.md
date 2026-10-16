# Tiempos de búsqueda antes de las mejoras

Referencia para comparar la latencia de la búsqueda con el resolver de GoPersonal
antes de usar `vtex_product` (sin hidratar productos desde el catálogo de VTEX).

## Cómo se midió

- Query GraphQL `productSearch` + `facets` (como la página de búsqueda), contra
  `buscador--coolboxpe.myvtex.com`.
- GoPersonal `/search` con `limit: 250` y `return_all_ids: true`.
- Cada producto rankeado se hidrataba con `pub/products/search` en lotes de 50.

## Línea base

| Escenario | Tiempo |
| --- | --- |
| Producción `www.coolbox.pe` (VTEX IS, sin el resolver) | productSearch 0.4–1.1 s, página 0.4–2.4 s |
| `buscador` con el resolver, primeras mediciones (2026-10-01) | productSearch 2.4–7.2 s; ~1 de cada 4 daba 500 |
| `buscador` en frío tras compartir el set y arreglar el bucket VBase (2026-10-05, n=19) | p50 2.8 s en el resolver |
| `buscador` con cache hit (mismo set en 30 s) | 0.12 s en el resolver; 0.5–0.9 s la request |
| `buscador` "laptop", productSearch + facets (2026-10-16, antes de `vtex_product`) | ~4.3 s |

## Desglose en frío (2026-10-05, p50)

| Etapa | Tiempo |
| --- | --- |
| GoPersonal `/search` | 0.7 s |
| Hidratación del catálogo (250 ids, 5 lotes de 50 en paralelo, ~1 MB cada uno) | 1.6 s |
| Facets locales | 0.12 s |
| Overhead de VTEX fuera del resolver (router, graphql-server, red) | 0.7–0.9 s |

La hidratación era la etapa más cara: ~6 MB de JSON por búsqueda. 12 ids
costaban 0.4 s y 230 KB; 50 ids, 2.7–3.5 s y 1 MB.

## Después de usar `vtex_product` (2026-10-16)

Primera medición, para comparar con la línea base:

| Búsqueda | Productos hidratados | Tiempo productSearch + facets |
| --- | --- | --- |
| tablet | 0 de 250 | 3.9 s |
| audifonos | 0 de 250 | 3.6 s |

Las mediciones son contra una app linkeada (instancia única, inestable); hay que
volver a medir con la app instalada antes de sacar conclusiones sobre producción.

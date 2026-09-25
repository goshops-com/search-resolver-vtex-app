# Evidencia: búsqueda de un término que también es marca

Capturas de tráfico real en el workspace `buscador` (cuenta `coolboxpe`) para el
término `jbl`. Los logs por `requestId` salen de la instrumentación temporal
(`services/debugLog.ts`); el endpoint se pierde con cada rebuild, así que los
números quedan acá.

## Recorridos comparados

| | URL | `page` | `queryString` | Variables que llegan al resolver |
|---|---|---|---|---|
| A | input → `/jbl?_q=jbl&map=ft` | `store.home` → PLP | `{}` | `query:"jbl/jbl"`, `map:""`, `selectedFacets:[{b,jbl}]` |
| B | recarga de `/jbl?_q=jbl&map=ft` | `store.search#brand` | `{_q:"jbl", map:"b"}` | `query:"jbl"`, `map:"b"`, `selectedFacets:[{b,jbl}]` |
| C | `/mundo-jbl` | `store.custom#mundo-jbl` | `{}` | 4 × `GetProductsByCategory` sin `fullText` |
| D | `/jbl` | `store.search#brand` | `{map:"b"}` | `query:"jbl"`, `map:"b"`, `selectedFacets:[{b,jbl}]` |

`/mundo-jbl` **sí** pasa por nuestro resolver: son cuatro consultas de vitrina
con `productClusterIds:1382` y con `category-N` + `brandId:2000045`, todas sin
`fullText`, así que resuelven por VTEX. No es una página que nos esquive.

## 1. Filtro de marca impuesto por el ruteo

En A el término llega como `jbl/jbl` y el motor **ya era GoPersonal**, pero el
`b=jbl` que agrega el ruteo recortaba el resultado:

```
motor elegido      engine=gopersonal fullText="jbl" query="jbl/jbl" map="b"
gopersonal: conteos rankedIds=90 hydrated=90 afterFilter=80
```

Los 10 productos descartados eran de otras marcas que GoPersonal rankeó para el
término. Después del arreglo:

```
productSearch: transformacion fullText="jbl" hadExplicitFullText=false
                              selectedFacets=[{ft,jbl}]
gopersonal: conteos rankedIds=90 hydrated=90 afterFilter=90
```

### Cómo se distingue del filtro que elige la persona

Una marca elegida en la barra lateral viaja **con su propio segmento `ft`**:

| origen | `map` | `selectedFacets` |
|---|---|---|
| impuesto por el ruteo | `b` (el `ft` sólo aparece tras la capa de compatibilidad) | `[{b,jbl}]` |
| elegido por la persona | `ft,b` | `[{ft,audifonos},{b,jbl}]` |

Ese es el discriminante que usa `dropRoutedBrandFacet`, y además sólo descarta
la marca cuyo slug coincide con el término, así que otra marca sobre la misma
búsqueda se conserva.

### Validación (GraphQL directo contra el workspace)

| caso | `recordsFiltered` | marcas en la página |
|---|---|---|
| búsqueda `jbl` ruteada | 90–91 | JBL + Philips, Skullcandy, Izuum, Miccell (pág. 2) |
| marca JBL elegida sobre la búsqueda | 80 | sólo JBL |
| marca Bose elegida sobre `audifonos` | 1 | sólo Bose |
| `/jbl` pelada (página de marca) | 228 (VTEX) | sólo JBL |
| vitrina `productClusterIds:1382` de `/mundo-jbl` | 42 | sólo JBL |
| vitrina `category+brandId` de `/mundo-jbl` | 40 | sólo JBL |

El 90–91 se mueve entre llamadas idénticas porque el rerank de GoPersonal no es
determinista; no se compara contra los 228 de la página de marca, que es otra
consulta y otro motor.

## 2. Motor al recargar: por qué no se resuelve acá

B y D llegan al resolver con **variables idénticas**. Diff completo de las 15
variables de `productSearch`: **0 diferencias**.

La única diferencia en la petición del navegador es el header `referer`, y ese
header no sobrevive: de los 41 headers que llegan al resolver ninguno lo trae.

```
accept, accept-encoding, content-length, content-type, host, priority,
sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, sec-fetch-dest,
sec-fetch-mode, sec-fetch-site, traceparent, uber-trace-id, user-agent, via,
x-amz-cf-id, x-amzn-trace-id, x-forwarded-for, x-forwarded-host,
x-forwarded-path, x-forwarded-port, x-forwarded-proto, x-request-id,
x-vtex-account, x-vtex-account-id, x-vtex-allowed-actions, x-vtex-binding,
x-vtex-caller, x-vtex-caller-role, x-vtex-credential, x-vtex-forbidden-actions,
x-vtex-keep-metas, x-vtex-locale, x-vtex-operation-id, x-vtex-product,
x-vtex-provider, x-vtex-segment, x-vtex-tenant, x-vtex-workspace,
x-vtex-workspace-is-production
```

`x-forwarded-path` apunta al endpoint GraphQL
(`/_v/segment/graphql/v1?workspace=...`), no a la página.

El `_q` sobrevive en un solo lugar: `window.__RUNTIME__.route.queryString`, que
vive en el render-runtime. Es decir, la señal existe en el navegador pero se
pierde antes de llegar acá, y por eso el arreglo del punto 2 necesita que
alguien la ponga en las variables de la consulta.

Un SDK que inyecte JavaScript tampoco alcanza: en la carga directa el HTML del
servidor ya trae `$ROOT_QUERY.productSearch(...)` resuelto en `__STATE__`, así
que la primera consulta ocurre antes de que corra cualquier script del
navegador. Sólo podría reemplazar resultados después, que es justamente lo que
no se quiere.

### Prueba dirigida: ¿sirve leer la ruta desde los headers? (2026-09-25)

La captura anterior de headers salía del XHR del navegador, así que quedaba
abierta la posibilidad de que el render del servidor sí trajera la ruta real.
Se instrumentó un probe temporal que volcaba todos los headers (sin cookie,
authorization, credential, token ni segment) y se forzaron cargas frescas
(`x-cache: Miss from cloudfront`).

Resultado: **no sirve**. La petición que resuelve la búsqueda al recargar llega
con `user-agent: Amazon CloudFront` y estos son todos sus headers de ruta:

```
x-forwarded-host: buscador--coolboxpe.myvtex.com
x-forwarded-path: /_v/segment/graphql/v1?workspace=buscador&...
                  &operationName=productSearchV3&variables=%7B%7D
                  &extensions=%7B%22persistedQuery%22...
referer: (ausente)
```

`x-forwarded-path` apunta al endpoint GraphQL y su `variables` viene vacío
(`%7B%7D`): las variables reales viajan en el body, ya sin `_q`. No hay ningún
header con la URL de la página. La opción de deducir la intención desde los
headers queda **descartada con evidencia**, no por suposición.

El mismo probe dejó dos datos útiles:

| término | ¿marca? | variables en la carga directa | dónde resuelve |
|---|---|---|---|
| `audifonos` | no | `fullText:"audifonos"`, `selectedFacets:[{ft,audifonos}]` | cliente (`recordsFiltered` 0 en el HTML) |
| `jbl` | sí | sin `fullText`, `selectedFacets:[{b,jbl}]` | servidor (`recordsFiltered` 227 en el HTML) |

Es decir: para un término que no es marca el `_q` **sí** llega como `fullText`.
El problema es exclusivo del ruteo a `store.search#brand`, que reemplaza la
intención de búsqueda por la de página de marca antes de armar las variables.

## 3. La regla que activa GoPersonal (2026-09-25)

Como la intención de búsqueda no sobrevive al ruteo, la página de marca se
interpreta como lo que la persona escribió: **si el `map` empieza por `b` (o su
alias `brand`) y no hay ninguna clave de navegación curada, el primer segmento
del `query` se toma como término de texto**. Eso deja `/jbl` y
`/jbl?_q=jbl&map=ft` en el mismo motor, que es la decisión que se tomó.

El alcance es angosto a propósito:

| solicitud | `map` | ¿GoPersonal? | por qué |
|---|---|---|---|
| `/jbl` | `b` / `brand` | sí | marca sola al frente |
| `/jbl?_q=jbl&map=ft` | `b` / `brand` | sí | el ruteo la vuelve indistinguible de la anterior |
| categoría filtrada por marca | `c,b` / `category-2,brand` | no | el `b` no va primero: es navegación |
| vitrina de colección | `b,productClusterIds` | no | clave curada presente |
| vitrina de `/mundo-jbl` | `category-N` + `brandId` | no | clave curada presente |

Las claves curadas que bloquean la regla son `productClusterIds`, `brandId` y
`collection`, que son justamente las que arman las vitrinas de `/mundo-jbl`.

### El `ft` tiene que reemplazar a la marca, no sólo borrarla

El primer intento quitaba la marca ruteada y dejaba `selectedFacets` vacío. El
grid salía bien, pero **al tocar cualquier filtro la búsqueda se perdía**: el
theme reconstruye cada enlace de faceta a partir del `queryArgs` que devolvemos,
y con `map:""` volvía a `map=brand&query=/jbl`, o sea a la página de marca por
VTEX (228).

```
antes   queryArgs = {query:"jbl", map:"",   selectedFacets:[]}        -> clic en un filtro = 228 (VTEX)
después queryArgs = {query:"jbl", map:"ft", selectedFacets:[{ft,jbl}]} -> clic en un filtro = 80 (GoPersonal)
```

Por eso `replaceRoutedBrandWithTerm` deja el segmento `ft` en lugar de la marca,
y `services/facets.ts` arma `queryArgs` desde las facetas ya transformadas.

### El alias `brand` también llega crudo

Los logs del navegador mostraron `map:"brand"`, no `b`: la capa de
compatibilidad de VTEX normaliza `brand`→`b` pero sale antes en los pares de un
solo segmento. Reconocer sólo `b` hacía que la página cargara por VTEX (228)
mientras la consulta GraphQL directa con `b` daba 90. Ambas grafías se tratan
igual.

## 4. Validación en el navegador (2026-09-25)

Workspace `buscador`. Conteos de GoPersonal varían entre llamadas por el rerank
no determinista; lo que se compara es el motor y los criterios.

| caso | URL final | resultados | marcas en el grid |
|---|---|---|---|
| buscar `jbl` en el input | `/jbl?_q=jbl&map=ft` | 90 | JBL + 1Hora, Izuum, Philips, Sony |
| recargar esa URL | igual, sin redirección | 90 | JBL + 1Hora, Izuum, Miccell |
| misma URL en pestaña nueva | igual | 91 | JBL + 1Hora, Izuum, Miccell |
| `/jbl` directo | `/jbl` | 91 | JBL + 1Hora, Izuum, Philips, Sony |
| `/sony` directo | `/sony` | 95 | Sony + 1Hora, Izuum, QCY, Philips… |
| `/hp?_q=hp&map=ft` | igual | 64 | HP + Epson, Canon, Brother |
| `audifonos` (no es marca) | `/audifonos?_q=audifonos&map=ft` | 83 | mezcla |

Filtros y paginación sobre la búsqueda `jbl`:

| acción | resultados | estado |
|---|---|---|
| marcar JBL a mano | 80 | chip `JBL`, checkbox marcado |
| quitarla | 92 | sin chips, vuelve la mezcla |
| marcar Sony | 1 | único Sony que el motor rankea para `jbl` |
| Sony + categoría Parlantes | 0 | correcto: ese Sony es audífono, no parlante |
| JBL + categoría Parlantes | 50 | chips `JBL`, `Parlantes` |
| esa misma URL recargada | 50 | filtros conservados |
| esa misma URL en pestaña nueva | 50 | filtros conservados |
| `&page=2` | 50 de 50 | paginador en 2, chips conservados |
| Atrás / Adelante | 48 de 50 / 50 de 50 | historial coherente |

### `/mundo-jbl` quedó intacta

Se capturó la página antes del cambio (entrando directo y desde el enlace de la
home) y se volvió a capturar después: **los mismos 60 productos, en el mismo
orden, en las tres capturas**. Sus consultas siguen resolviendo por VTEX.

| vitrina | antes | después |
|---|---|---|
| `productClusterIds:1382` | 42 | 42 |
| `category-1:audio` + `brandId:2000045` | 227 | 227 |

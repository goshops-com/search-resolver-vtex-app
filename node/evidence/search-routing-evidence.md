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

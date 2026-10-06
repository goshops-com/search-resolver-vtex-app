### Intentos y resultado por escenario

| Término | Condición | Intentos | Éxito | Error | Timeout | Saltado | Limpias | Inválidas (motivo) | Tasa de error | Tasa de error fuera de reinicios | Caché observada (éxitos) | Origen productos |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| audifonos | first | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"pickRuntime":1} |
| jbl | first | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"pickRuntime":1} |
| smart-tv | first | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0% | 0% | {"miss":1} | {"pickRuntime":1} |
| audifonos | repeat | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"client":1} |
| jbl | repeat | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"hit":1} | {"pickRuntime":1} |
| smart-tv | repeat | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0% | 0% | {"hit":1} | {"pickRuntime":1} |
| jbl | page2 | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"hit":1} | {"client":1} |
| smart-tv | page2 | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"hit":1} | {"client":1} |
| audifonos | filter | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0% | 0% | {"hit":1} | {"client":1} |
| jbl | filter | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"hit":1} | {"client":1} |
| smart-tv | filter | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"client":1} |
| jbl | page2-nocache | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"client":1} |
| smart-tv | page2-nocache | 1 | 1 | 0 | 0 | 0 | 0 | 1 cold-process | 0% | – | {"miss":1} | {"client":1} |
| audifonos | filter-nocache | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0% | 0% | {"miss":1} | {"client":1} |
| jbl | filter-nocache | 1 | 1 | 0 | 0 | 0 | 0 | 1 cold-process | 0% | – | {"miss":1} | {"client":1} |
| smart-tv | filter-nocache | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"client":1} |
| audifonos | direct-nocache | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"undefined":1} |
| jbl | direct-nocache | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0% | 0% | {"miss":1} | {"undefined":1} |
| smart-tv | direct-nocache | 1 | 0 | 0 | 1 | 0 | 0 | 1 restart-window | 100% | – | {} | {} |
| audifonos | direct-cache | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"hit":1} | {"undefined":1} |
| jbl | direct-cache | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"undefined":1} |
| smart-tv | direct-cache | 1 | 1 | 0 | 0 | 0 | 0 | 1 restart-window | 0% | – | {"miss":1} | {"undefined":1} |

### Navegador: hasta ver los productos (corridas limpias, ms)

| Término | Condición | n | Mediana | p90 | Media | Mín | Máx | Mediana con todas las exitosas (n) | Visibles | Total | Hidratados | Filtro/página correctos |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| audifonos | first | 0 | – | – | – | – | – | 11429 (1) |  |  |  | – |
| jbl | first | 0 | – | – | – | – | – | 12236 (1) |  |  |  | – |
| smart-tv | first | 1 | 11163 | 11163 | 11163 | 11163 | 11163 | 11163 (1) | 48 | 107 | 107 | – |
| audifonos | repeat | 0 | – | – | – | – | – | 8589 (1) |  |  |  | – |
| jbl | repeat | 0 | – | – | – | – | – | 7431 (1) |  |  |  | – |
| smart-tv | repeat | 1 | 9797 | 9797 | 9797 | 9797 | 9797 | 9797 (1) | 48 | 107 | 107 | – |
| jbl | page2 | 0 | – | – | – | – | – | 7155 (1) |  |  |  | – |
| smart-tv | page2 | 0 | – | – | – | – | – | 7783 (1) |  |  |  | – |
| audifonos | filter | 1 | 6979 | 6979 | 6979 | 6979 | 6979 | 6979 (1) | 6 | 6 | 44 | {"true":1} |
| jbl | filter | 0 | – | – | – | – | – | 1444 (1) |  |  |  | – |
| smart-tv | filter | 0 | – | – | – | – | – | 7259 (1) |  |  |  | – |
| jbl | page2-nocache | 0 | – | – | – | – | – | 12857 (1) |  |  |  | – |
| smart-tv | page2-nocache | 0 | – | – | – | – | – | 11258 (1) |  |  |  | – |
| audifonos | filter-nocache | 1 | 5947 | 5947 | 5947 | 5947 | 5947 | 5947 (1) | 6 | 6 | 44 | {"true":1} |
| jbl | filter-nocache | 0 | – | – | – | – | – | 8340 (1) |  |  |  | – |
| smart-tv | filter-nocache | 0 | – | – | – | – | – | 3260 (1) |  |  |  | – |
| audifonos | direct-nocache | 0 | – | – | – | – | – | 12530 (1) |  |  |  | – |
| jbl | direct-nocache | 1 | 18624 | 18624 | 18624 | 18624 | 18624 | 18624 (1) | 48 |  | 250 | – |
| smart-tv | direct-nocache | 0 | – | – | – | – | – | – |  |  |  | – |
| audifonos | direct-cache | 0 | – | – | – | – | – | 9864 (1) |  |  |  | – |
| jbl | direct-cache | 0 | – | – | – | – | – | 18217 (1) |  |  |  | – |
| smart-tv | direct-cache | 0 | – | – | – | – | – | 21954 (1) |  |  |  | – |

### Navegador: requests y documento (corridas limpias, ms)

| Término | Condición | Métrica | n | Mediana | p90 | Media | Mín | Máx |
|---|---|---|---|---|---|---|---|---|
| smart-tv | first | responseEndMs | 1 | 3840 | 3840 | 3840 | 3840 | 3840 |
| smart-tv | first | counterSettledMs | 1 | 11163 | 11163 | 11163 | 11163 | 11163 |
| smart-tv | first | pickRuntimeMs | 1 | 3715 | 3715 | 3715 | 3715 | 3715 |
| smart-tv | first | productSearchMs | 1 | 1022 | 1022 | 1022 | 1022 | 1022 |
| smart-tv | first | facetsMs | 1 | 493 | 493 | 493 | 493 | 493 |
| smart-tv | repeat | responseEndMs | 1 | 1469 | 1469 | 1469 | 1469 | 1469 |
| smart-tv | repeat | counterSettledMs | 1 | 9797 | 9797 | 9797 | 9797 | 9797 |
| smart-tv | repeat | pickRuntimeMs | 1 | 1353 | 1353 | 1353 | 1353 | 1353 |
| smart-tv | repeat | productSearchMs | 1 | 1288 | 1288 | 1288 | 1288 | 1288 |
| smart-tv | repeat | facetsMs | 1 | 509 | 509 | 509 | 509 | 509 |
| audifonos | filter | responseEndMs | 1 | 2986 | 2986 | 2986 | 2986 | 2986 |
| audifonos | filter | counterSettledMs | 1 | 6979 | 6979 | 6979 | 6979 | 6979 |
| audifonos | filter | productSearchMs | 1 | 376 | 376 | 376 | 376 | 376 |
| audifonos | filter | facetsMs | 1 | 460 | 460 | 460 | 460 | 460 |
| audifonos | filter-nocache | responseEndMs | 1 | 2062 | 2062 | 2062 | 2062 | 2062 |
| audifonos | filter-nocache | counterSettledMs | 1 | 5947 | 5947 | 5947 | 5947 | 5947 |
| audifonos | filter-nocache | productSearchMs | 1 | 1742 | 1742 | 1742 | 1742 | 1742 |
| audifonos | filter-nocache | facetsMs | 1 | 3945 | 3945 | 3945 | 3945 | 3945 |
| jbl | direct-nocache | ttfbMs | 1 | 6515 | 6515 | 6515 | 6515 | 6515 |
| jbl | direct-nocache | htmlReceivedMs | 1 | 9698 | 9698 | 9698 | 9698 | 9698 |

### Resolver (logs de timing, corridas limpias, ms)

| Término | Condición | Métrica | n | Mediana | p90 | Media | Mín | Máx |
|---|---|---|---|---|---|---|---|---|
| smart-tv | first | resolverCalls | 1 | 9 | 9 | 9 | 9 | 9 |
| smart-tv | first | resolverLoadTotalMs | 1 | 2439 | 2439 | 2439 | 2439 | 2439 |
| smart-tv | first | resultSetLoadMs | 1 | 2114 | 2114 | 2114 | 2114 | 2114 |
| smart-tv | first | gopersonalMs | 1 | 1361 | 1361 | 1361 | 1361 | 1361 |
| smart-tv | first | hydrateMs | 1 | 752 | 752 | 752 | 752 | 752 |
| smart-tv | first | batchMinMs | 1 | 315 | 315 | 315 | 315 | 315 |
| smart-tv | first | batchMaxMs | 1 | 749 | 749 | 749 | 749 | 749 |
| smart-tv | first | filterableFieldsMs | 1 | 1 | 1 | 1 | 1 | 1 |
| smart-tv | first | settingsMs | 1 | 7 | 7 | 7 | 7 | 7 |
| smart-tv | first | buildFacetsMs | 1 | 53 | 53 | 53 | 53 | 53 |
| smart-tv | first | filterMs | 1 | 0 | 0 | 0 | 0 | 0 |
| smart-tv | first | awaitInflightMs | 1 | 2114 | 2114 | 2114 | 2114 | 2114 |
| smart-tv | first | resolverProductSearchMs | 1 | 252 | 252 | 252 | 252 | 252 |
| smart-tv | first | resolverFacetsMs | 1 | 80 | 80 | 80 | 80 | 80 |
| smart-tv | repeat | resolverCalls | 1 | 7 | 7 | 7 | 7 | 7 |
| smart-tv | repeat | settingsMs | 1 | 5 | 5 | 5 | 5 | 5 |
| smart-tv | repeat | buildFacetsMs | 1 | 52 | 52 | 52 | 52 | 52 |
| smart-tv | repeat | filterMs | 1 | 0 | 0 | 0 | 0 | 0 |
| smart-tv | repeat | resolverProductSearchMs | 1 | 58 | 58 | 58 | 58 | 58 |
| smart-tv | repeat | resolverFacetsMs | 1 | 78 | 78 | 78 | 78 | 78 |
| audifonos | filter | resolverCalls | 1 | 5 | 5 | 5 | 5 | 5 |
| audifonos | filter | settingsMs | 1 | 6 | 6 | 6 | 6 | 6 |
| audifonos | filter | buildFacetsMs | 1 | 19 | 19 | 19 | 19 | 19 |
| audifonos | filter | filterMs | 1 | 2 | 2 | 2 | 2 | 2 |
| audifonos | filter | resolverProductSearchMs | 1 | 46 | 46 | 46 | 46 | 46 |
| audifonos | filter | resolverFacetsMs | 1 | 28 | 28 | 28 | 28 | 28 |
| audifonos | filter-nocache | resolverCalls | 1 | 3 | 3 | 3 | 3 | 3 |
| audifonos | filter-nocache | resolverLoadTotalMs | 1 | 1178 | 1178 | 1178 | 1178 | 1178 |
| audifonos | filter-nocache | resultSetLoadMs | 1 | 1110 | 1110 | 1110 | 1110 | 1110 |
| audifonos | filter-nocache | gopersonalMs | 1 | 981 | 981 | 981 | 981 | 981 |
| audifonos | filter-nocache | hydrateMs | 1 | 129 | 129 | 129 | 129 | 129 |
| audifonos | filter-nocache | batchMinMs | 1 | 127 | 127 | 127 | 127 | 127 |
| audifonos | filter-nocache | batchMaxMs | 1 | 127 | 127 | 127 | 127 | 127 |
| audifonos | filter-nocache | filterableFieldsMs | 1 | 0 | 0 | 0 | 0 | 0 |
| audifonos | filter-nocache | settingsMs | 1 | 6 | 6 | 6 | 6 | 6 |
| audifonos | filter-nocache | buildFacetsMs | 1 | 20 | 20 | 20 | 20 | 20 |
| audifonos | filter-nocache | filterMs | 1 | 1 | 1 | 1 | 1 | 1 |
| audifonos | filter-nocache | awaitInflightMs | 1 | 1038 | 1038 | 1038 | 1038 | 1038 |
| audifonos | filter-nocache | resolverProductSearchMs | 1 | 1178 | 1178 | 1178 | 1178 | 1178 |
| audifonos | filter-nocache | resolverFacetsMs | 1 | 1104 | 1104 | 1104 | 1104 | 1104 |
| jbl | direct-nocache | resolverCalls | 1 | 4 | 4 | 4 | 4 | 4 |
| jbl | direct-nocache | resolverLoadTotalMs | 1 | 2386 | 2386 | 2386 | 2386 | 2386 |
| jbl | direct-nocache | resultSetLoadMs | 1 | 2027 | 2027 | 2027 | 2027 | 2027 |
| jbl | direct-nocache | gopersonalMs | 1 | 745 | 745 | 745 | 745 | 745 |
| jbl | direct-nocache | hydrateMs | 1 | 1280 | 1280 | 1280 | 1280 | 1280 |
| jbl | direct-nocache | batchMinMs | 1 | 445 | 445 | 445 | 445 | 445 |
| jbl | direct-nocache | batchMaxMs | 1 | 1279 | 1279 | 1279 | 1279 | 1279 |
| jbl | direct-nocache | filterableFieldsMs | 1 | 0 | 0 | 0 | 0 | 0 |
| jbl | direct-nocache | settingsMs | 1 | 6 | 6 | 6 | 6 | 6 |
| jbl | direct-nocache | buildFacetsMs | 1 | 104 | 104 | 104 | 104 | 104 |
| jbl | direct-nocache | filterMs | 1 | 0 | 0 | 0 | 0 | 0 |
| jbl | direct-nocache | awaitInflightMs | 1 | 2417 | 2417 | 2417 | 2417 | 2417 |
| jbl | direct-nocache | resolverProductSearchMs | 1 | 2789 | 2789 | 2789 | 2789 | 2789 |
| jbl | direct-nocache | resolverFacetsMs | 1 | 2771 | 2771 | 2771 | 2771 | 2771 |

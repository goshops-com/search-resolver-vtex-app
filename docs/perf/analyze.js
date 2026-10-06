#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Joins a campaign's browser runs with the resolver timing logs, classifies
 * every attempt (cache state, restart overlap) and computes the statistics.
 *
 *   node docs/perf/analyze.js docs/perf/data/<campaign>
 *
 * Writes runs.csv, spans.csv and summary.json next to the input files.
 */
const fs = require('fs')
const path = require('path')

const dir = process.argv[2]

if (!dir) {
  console.error('usage: analyze.js <campaign dir>')
  process.exit(1)
}

/**
 * Window, relative to a harness build log, in which the app is swapped. In the
 * probe run before the campaign (data/restart-probe) the last request of the
 * old worker came 23-31s after the log, the first of the new one 29-36s after,
 * and the three 500s at 26, 28 and 34s. `--wide` uses 15-50s instead, to show
 * how sensitive the results are to this choice.
 */
const RESTART_WINDOW = process.argv.includes('--wide') ? { fromMs: 15000, toMs: 50000 } : { fromMs: 20000, toMs: 40000 }

/**
 * The server-side render calls the resolver without the `x-perf-run` header,
 * so logs without it are attributed to the step running at the time (steps run
 * one at a time) when they are about the same term.
 */
const ATTRIBUTION_SLACK_MS = { before: 500, after: 3000 }

/** A worker this young is still warming its in-memory caches. */
const COLD_PROCESS_REQUESTS = 3

const readJSONL = (file) =>
  fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : []

const runs = readJSONL(path.join(dir, 'runs.jsonl'))
const logs = readJSONL(path.join(dir, 'logs.jsonl')).filter((l) => /^timing:/.test(l.message))
const restarts = JSON.parse(fs.readFileSync(path.join(dir, 'restarts.json'), 'utf8')).map(Date.parse)
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'))

const logsByRun = new Map()
const unmatched = []

for (const log of logs) {
  const id = log.context?.perfRun

  if (id) {
    if (!logsByRun.has(id)) logsByRun.set(id, [])
    logsByRun.get(id).push(log)
  } else {
    unmatched.push(log)
  }
}

const termOf = (log) => {
  const c = log.context || {}

  return [c.fullText, ...(c.query || '').split('/')].filter(Boolean)
}

const attributed = new Set()

for (const run of runs) {
  if (!run.startedAt) continue
  const from = Date.parse(run.startedAt) - ATTRIBUTION_SLACK_MS.before
  const to = Date.parse(run.endedAt) + ATTRIBUTION_SLACK_MS.after

  for (const log of unmatched) {
    const at = Date.parse(log.createdAt)

    if (at >= from && at <= to && termOf(log).includes(run.termText)) {
      if (!logsByRun.has(run.perfRun)) logsByRun.set(run.perfRun, [])
      logsByRun.get(run.perfRun).push({ ...log, attributedByTime: true })
      attributed.add(log)
    }
  }
}

const rows = runs.filter((r) => r.condition !== 'prep').map(classify)
const prepRows = runs.filter((r) => r.condition === 'prep').map(classify)

writeCSV('runs.csv', rows, [
  'perfRun', 'round', 'warmup', 'term', 'condition', 'slot', 'action', 'startedAt', 'outcome', 'status',
  'invalidReason', 'error', 'expectedCache', 'observedCache', 'productsSource', 'productsVisibleMs',
  'counterSettledMs', 'responseEndMs', 'productSearchMs', 'facetsMs', 'pickRuntimeMs', 'ttfbMs',
  'htmlReceivedMs', 'cloudfrontRetry', 'visible', 'returned', 'recordsFiltered', 'hydrated', 'requestedFromGP',
  'filterCorrect', 'pageCorrect', 'visibleMatchesResponse', 'resolverProductSearchMs', 'resolverFacetsMs',
  'gopersonalMs', 'hydrateMs', 'batches', 'batchMinMs', 'batchMaxMs', 'vbaseMs', 'unknownFields',
  'unknownFieldsMs', 'buildFacetsMs', 'filterMs', 'awaitInflightMs', 'settingsMs', 'msSinceRestart',
  'workerBootId', 'workerRequestNumber', 'logsMatched', 'logsByTime', 'resolverCalls', 'resolverLoads',
  'resolverLoadTotalMs', 'resultSetLoadMs', 'filterableFieldsMs', 'knownFieldsSource',
])

const spanRows = []

for (const row of rows) {
  for (const log of row.logs) {
    for (const span of log.context.spans || []) {
      spanRows.push({
        perfRun: row.perfRun,
        term: row.term,
        condition: row.condition,
        status: row.status,
        operation: log.message.replace('timing:', ''),
        span: span.name,
        startMs: span.startMs,
        durationMs: span.durationMs,
        meta: span.meta ? JSON.stringify(span.meta) : '',
      })
    }
  }
}

writeCSV('spans.csv', spanRows, ['perfRun', 'term', 'condition', 'status', 'operation', 'span', 'startMs', 'durationMs', 'meta'])

const summary = {
  campaign: meta.campaign,
  startedAt: meta.startedAt,
  finishedAt: meta.finishedAt,
  percentileMethod: 'linear interpolation between closest ranks (R-7, numpy default, Excel PERCENTILE.INC)',
  restartWindow: RESTART_WINDOW,
  restartsDuringCampaign: restarts.filter((t) => t >= Date.parse(meta.startedAt) && t <= Date.parse(meta.finishedAt)).length,
  logs: {
    timing: logs.length,
    withPerfRun: logs.length - unmatched.length,
    withoutPerfRunAttributedByTime: attributed.size,
    withoutPerfRunUnattributed: unmatched.length - attributed.size,
  },
  prepSteps: countBy(prepRows, (r) => r.outcome),
  groups: [],
}

const groups = groupBy(rows.filter((r) => !r.warmup), (r) => `${r.term}|${r.condition}`)

for (const [key, list] of groups) {
  const [term, condition] = key.split('|')
  const clean = list.filter((r) => r.status === 'clean')
  const metric = (name, subset = clean) => stats(subset.map((r) => r[name]).filter((v) => typeof v === 'number'))

  summary.groups.push({
    term,
    condition,
    attempts: list.length,
    outcomes: countBy(list, (r) => r.outcome),
    status: countBy(list, (r) => r.status),
    invalidReasons: countBy(list.filter((r) => r.invalidReason), (r) => r.invalidReason),
    errorRate: rate(list, (r) => r.outcome === 'error' || r.outcome === 'timeout'),
    errorRateOutsideRestarts: rate(
      list.filter((r) => r.invalidReason !== 'restart-window' && r.invalidReason !== 'cold-process'),
      (r) => r.outcome === 'error' || r.outcome === 'timeout'
    ),
    observedCache: countBy(list.filter((r) => r.outcome === 'success'), (r) => r.observedCache),
    productsSource: countBy(list.filter((r) => r.outcome === 'success'), (r) => r.productsSource),
    visible: distinct(clean.map((r) => r.visible)),
    recordsFiltered: distinct(clean.map((r) => r.recordsFiltered)),
    hydrated: distinct(clean.map((r) => r.hydrated)),
    requestedFromGP: distinct(clean.map((r) => r.requestedFromGP)),
    knownFieldsSource: countBy(clean.filter((r) => r.knownFieldsSource), (r) => r.knownFieldsSource),
    unknownFields: distinct(clean.map((r) => r.unknownFields)),
    filterCorrect: countBy(clean.filter((r) => r.filterCorrect != null), (r) => r.filterCorrect),
    pageCorrect: countBy(clean.filter((r) => r.pageCorrect != null), (r) => r.pageCorrect),
    clean: {
      productsVisibleMs: metric('productsVisibleMs'),
      counterSettledMs: metric('counterSettledMs'),
      responseEndMs: metric('responseEndMs'),
      productSearchMs: metric('productSearchMs'),
      facetsMs: metric('facetsMs'),
      pickRuntimeMs: metric('pickRuntimeMs'),
      ttfbMs: metric('ttfbMs'),
      htmlReceivedMs: metric('htmlReceivedMs'),
      resolverProductSearchMs: metric('resolverProductSearchMs'),
      resolverFacetsMs: metric('resolverFacetsMs'),
      resolverLoadTotalMs: metric('resolverLoadTotalMs'),
      resultSetLoadMs: metric('resultSetLoadMs'),
      filterableFieldsMs: metric('filterableFieldsMs'),
      resolverCalls: metric('resolverCalls'),
      gopersonalMs: metric('gopersonalMs'),
      hydrateMs: metric('hydrateMs'),
      batchMaxMs: metric('batchMaxMs'),
      batchMinMs: metric('batchMinMs'),
      vbaseMs: metric('vbaseMs'),
      unknownFieldsMs: metric('unknownFieldsMs'),
      buildFacetsMs: metric('buildFacetsMs'),
      filterMs: metric('filterMs'),
      awaitInflightMs: metric('awaitInflightMs'),
      settingsMs: metric('settingsMs'),
    },
    allSuccesses: {
      productsVisibleMs: metric('productsVisibleMs', list.filter((r) => r.outcome === 'success')),
    },
  })
}

const suffix = process.argv.includes('--wide') ? '-wide' : ''

fs.writeFileSync(path.join(dir, `summary${suffix}.json`), `${JSON.stringify(summary, null, 2)}\n`)
console.log(`runs: ${rows.length}, logs: ${logs.length} (${unmatched.length} without perfRun)`)
for (const g of summary.groups) {
  const s = g.clean.productsVisibleMs

  console.log(
    `${g.term.padEnd(10)} ${g.condition.padEnd(15)} n=${String(g.attempts).padStart(2)} clean=${String(g.status.clean || 0).padStart(2)} ` +
      `err=${(g.errorRate * 100).toFixed(0)}% p50=${s.median ?? '-'} p90=${s.p90 ?? '-'} cache=${JSON.stringify(g.observedCache)}`
  )
}

function classify(run) {
  const runLogs = (logsByRun.get(run.perfRun) || []).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const start = Date.parse(run.startedAt || run.endedAt)
  const end = Date.parse(run.endedAt || run.startedAt)
  const lastRestart = restarts.filter((t) => t <= start).pop()
  const overlapsRestart = restarts.some((t) => t + RESTART_WINDOW.fromMs <= end && t + RESTART_WINDOW.toMs >= start)
  const spans = (log) => log?.context?.spans || []
  const has = (log, name) => spans(log).some((s) => s.name === name)

  // Only GoPersonal-backed calls about this term matter; the theme also sends
  // unrelated product searches (shelves, empty queries).
  const gpLogs = runLogs.filter((l) => termOf(l).includes(run.termText) && spans(l).some((s) => s.name.startsWith('resultSet.')))
  const loadLog = gpLogs.find((l) => has(l, 'resultSet.load'))
  const delivering = pickDelivering(gpLogs, run)
  const ps = delivering?.message === 'timing:productSearch' ? delivering : gpLogs.filter((l) => l.message === 'timing:productSearch').pop()
  const fc = gpLogs.filter((l) => l.message === 'timing:facets').pop()

  // A step is a miss if any of its calls loaded the result set (the others then
  // wait on it or hit it); a hit if all of them were served from it.
  let observed = null

  if (gpLogs.length) {
    observed = loadLog ? 'miss' : gpLogs.some((l) => has(l, 'resultSet.awaitInflight')) ? 'inflight' : 'hit'
  }

  const work = loadLog || delivering
  const span = (name, log = work) => spans(log).find((s) => s.name === name)
  const batches = spans(loadLog).filter((s) => /^catalog\.batch\d+$/.test(s.name))
  const page = spans(delivering).find((s) => s.name === 'local.page')
  const worker = (loadLog || delivering)?.context?.worker

  let invalidReason = null

  if (run.outcome === 'skipped') invalidReason = 'prior-step-failed'
  else if (overlapsRestart) invalidReason = 'restart-window'
  else if (worker && worker.requestNumber <= COLD_PROCESS_REQUESTS) invalidReason = 'cold-process'
  else if (run.outcome === 'success' && !gpLogs.length) invalidReason = 'no-resolver-log'
  else if (run.outcome === 'success' && run.expectedCache === 'miss' && observed !== 'miss') invalidReason = 'cache-not-expired'
  else if (run.outcome === 'success' && run.expectedCache === 'hit' && observed === 'miss') invalidReason = 'cache-miss'

  const status = run.outcome !== 'success' ? run.outcome : invalidReason ? 'invalid' : 'clean'

  return {
    ...run,
    logs: runLogs,
    status,
    invalidReason,
    observedCache: observed,
    resolverCalls: gpLogs.length,
    resolverLoads: gpLogs.filter((l) => has(l, 'resultSet.load')).length,
    productSearchMs: run.productSearchRequest?.durationMs ?? null,
    facetsMs: run.facetsRequest?.durationMs ?? null,
    pickRuntimeMs: run.pickRuntimeRequest?.durationMs ?? null,
    hydrated: page?.meta?.hydrated ?? span('catalog.hydrate', loadLog)?.meta?.found ?? null,
    requestedFromGP: span('gopersonal.search', loadLog)?.meta?.ids ?? null,
    resolverProductSearchMs: ps?.context?.totalMs ?? null,
    resolverFacetsMs: fc?.context?.totalMs ?? null,
    resolverLoadTotalMs: loadLog?.context?.totalMs ?? null,
    resultSetLoadMs: span('resultSet.load', loadLog)?.durationMs ?? null,
    gopersonalMs: span('gopersonal.search', loadLog)?.durationMs ?? null,
    hydrateMs: span('catalog.hydrate', loadLog)?.durationMs ?? null,
    batches: batches.length || null,
    batchMinMs: batches.length ? Math.min(...batches.map((b) => b.durationMs)) : null,
    batchMaxMs: batches.length ? Math.max(...batches.map((b) => b.durationMs)) : null,
    filterableFieldsMs: span('catalog.filterableFields', loadLog)?.durationMs ?? null,
    vbaseMs: span('vbase.filterableFields', loadLog)?.durationMs ?? null,
    knownFieldsSource: !loadLog ? null : has(loadLog, 'filterableFields.memoryHit') ? 'memory' : has(loadLog, 'vbase.filterableFields') ? 'vbase' : 'none',
    unknownFields: span('catalog.unknownFields', loadLog)?.meta?.unknown ?? null,
    unknownFieldsMs: span('catalog.unknownFields', loadLog)?.durationMs ?? null,
    settingsMs: span('settings', work)?.durationMs ?? null,
    buildFacetsMs: span('local.buildFacets', delivering)?.durationMs ?? null,
    filterMs: span('local.filter', delivering)?.durationMs ?? null,
    awaitInflightMs: gpLogs.map((l) => spans(l).find((s) => s.name === 'resultSet.awaitInflight')?.durationMs).filter((v) => v != null).sort((a, b) => b - a)[0] ?? null,
    msSinceRestart: lastRestart ? start - lastRestart : null,
    workerBootId: worker?.bootId ?? null,
    workerRequestNumber: worker?.requestNumber ?? null,
    logsMatched: runLogs.length,
    logsByTime: runLogs.filter((l) => l.attributedByTime).length,
  }
}

/** The log of the request that returned the rendered products: same query, facets and page. */
function pickDelivering(gpLogs, run) {
  const v = run.response?.variables

  if (!v) return gpLogs.filter((l) => l.message === 'timing:productSearch').pop() || gpLogs[gpLogs.length - 1] || null

  const same = gpLogs.filter(
    (l) =>
      l.message === 'timing:productSearch' &&
      l.context.query === v.query &&
      (l.context.from ?? 0) === (v.from ?? 0) &&
      l.context.selectedFacets === (v.selectedFacets || []).length
  )

  return same[same.length - 1] || null
}

function stats(values) {
  if (!values.length) return { n: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const q = (p) => {
    const h = (sorted.length - 1) * p
    const lo = Math.floor(h)

    return round(sorted[lo] + (h - lo) * ((sorted[Math.ceil(h)] ?? sorted[lo]) - sorted[lo]))
  }

  return {
    n: sorted.length,
    median: q(0.5),
    p90: q(0.9),
    mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
  }
}

function writeCSV(name, data, columns) {
  const esc = (v) => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)

    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  fs.writeFileSync(path.join(dir, name), `${[columns.join(','), ...data.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n')}\n`)
}

function groupBy(list, fn) {
  const map = new Map()

  for (const item of list) {
    const k = fn(item)

    if (!map.has(k)) map.set(k, [])
    map.get(k).push(item)
  }

  return map
}

function countBy(list, fn) {
  return list.reduce((acc, item) => {
    const k = String(fn(item))

    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
}

function distinct(values) {
  return [...new Set(values.filter((v) => v != null))].sort((a, b) => a - b)
}

function rate(list, fn) {
  return list.length ? round(list.filter(fn).length / list.length, 3) : null
}

function round(n, digits = 0) {
  const f = 10 ** digits

  return Math.round(n * f) / f
}

writeMarkdown()

/** Tables pasted into docs/search-performance-baseline.md. */
function writeMarkdown() {
  const order = ['first', 'repeat', 'page2', 'filter', 'page2-nocache', 'filter-nocache', 'direct-nocache', 'direct-cache']
  const sorted = [...summary.groups].sort(
    (a, b) => order.indexOf(a.condition) - order.indexOf(b.condition) || a.term.localeCompare(b.term)
  )
  const fmt = (s) => (s && s.n ? `${s.median} | ${s.p90} | ${s.mean} | ${s.min} | ${s.max}` : '– | – | – | – | –')
  const pct = (v) => (v == null ? '–' : `${(v * 100).toFixed(0)}%`)
  const lines = []

  lines.push('### Intentos y resultado por escenario', '')
  lines.push('| Término | Condición | Intentos | Éxito | Error | Timeout | Saltado | Limpias | Inválidas (motivo) | Tasa de error | Tasa de error fuera de reinicios | Caché observada (éxitos) | Origen productos |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const g of sorted) {
    const o = g.outcomes
    const inv = Object.entries(g.invalidReasons).filter(([k]) => k !== 'prior-step-failed').map(([k, v]) => `${v} ${k}`).join(', ') || '0'

    lines.push(`| ${g.term} | ${g.condition} | ${g.attempts} | ${o.success || 0} | ${o.error || 0} | ${o.timeout || 0} | ${o.skipped || 0} | ${g.status.clean || 0} | ${inv} | ${pct(g.errorRate)} | ${pct(g.errorRateOutsideRestarts)} | ${JSON.stringify(g.observedCache)} | ${JSON.stringify(g.productsSource)} |`)
  }

  lines.push('', '### Navegador: hasta ver los productos (corridas limpias, ms)', '')
  lines.push('| Término | Condición | n | Mediana | p90 | Media | Mín | Máx | Mediana con todas las exitosas (n) | Visibles | Total | Hidratados | Filtro/página correctos |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const g of sorted) {
    const s = g.clean.productsVisibleMs
    const all = g.allSuccesses.productsVisibleMs
    const ok = { ...g.filterCorrect, ...g.pageCorrect }

    lines.push(`| ${g.term} | ${g.condition} | ${s.n || 0} | ${fmt(s)} | ${all.n ? `${all.median} (${all.n})` : '–'} | ${g.visible.join('/')} | ${g.recordsFiltered.join('/')} | ${g.hydrated.join('/')} | ${Object.keys(ok).length ? JSON.stringify(ok) : '–'} |`)
  }

  const block = (title, metrics) => {
    lines.push('', `### ${title}`, '')
    lines.push('| Término | Condición | Métrica | n | Mediana | p90 | Media | Mín | Máx |')
    lines.push('|---|---|---|---|---|---|---|---|---|')
    for (const g of sorted) {
      for (const m of metrics) {
        const s = g.clean[m]

        if (s && s.n) lines.push(`| ${g.term} | ${g.condition} | ${m} | ${s.n} | ${fmt(s)} |`)
      }
    }
  }

  block('Navegador: requests y documento (corridas limpias, ms)', [
    'responseEndMs', 'counterSettledMs', 'pickRuntimeMs', 'productSearchMs', 'facetsMs', 'ttfbMs', 'htmlReceivedMs',
  ])
  block('Resolver (logs de timing, corridas limpias, ms)', [
    'resolverCalls', 'resolverLoadTotalMs', 'resultSetLoadMs', 'gopersonalMs', 'hydrateMs', 'batchMinMs', 'batchMaxMs',
    'filterableFieldsMs', 'vbaseMs', 'unknownFieldsMs', 'settingsMs', 'buildFacetsMs', 'filterMs', 'awaitInflightMs',
    'resolverProductSearchMs', 'resolverFacetsMs',
  ])

  fs.writeFileSync(path.join(dir, `tables${suffix}.md`), `${lines.join('\n')}\n`)
}

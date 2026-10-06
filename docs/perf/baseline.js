#!/usr/bin/env node
/* eslint-disable no-console, no-await-in-loop */
/**
 * Search performance baseline runner (Playwright).
 *
 * Usage: see docs/search-performance-baseline.md, section "Cómo repetir".
 *
 * Secrets are never read from or written to the repo: the VTEX id token comes
 * from VTEX_ID_TOKEN, or is obtained at runtime from VTEX_APP_KEY and
 * VTEX_APP_TOKEN. Cookies and tokens are not stored in the output.
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const args = parseArgs(process.argv.slice(2))
const config = JSON.parse(
  fs.readFileSync(args.config || path.join(__dirname, 'scenarios.json'), 'utf8')
)

const ITERATIONS = Number(args.iterations ?? config.iterations)
const WARMUPS = Number(args.warmups ?? config.warmupIterations)
const TERMS = args.terms
  ? config.terms.filter((t) => args.terms.split(',').includes(t.id))
  : config.terms
const CONDITIONS = args.conditions ? args.conditions.split(',') : null
const CAMPAIGN = args.campaign || `bl${new Date().toISOString().slice(0, 16).replace(/\D/g, '')}`
const OUT_DIR = args.out || path.join(__dirname, 'data', CAMPAIGN)
const RESTART_LOG_DIR = args.restartLogs ?? '/tmp/.server-logs'
const GALLERY_ITEM = '.coolboxpe-store-search-0-x-galleryItem'

fs.mkdirSync(OUT_DIR, { recursive: true })
const runsFile = path.join(OUT_DIR, 'runs.jsonl')

/** Last time each term touched the resolver, to guarantee an expired result set. */
const lastTouch = {}

// Records every change of the gallery, with the page's own clock, so the time
// products appear does not depend on when Playwright happens to poll.
const RECORDER = `(() => {
  try { performance.setResourceTimingBufferSize(10000) } catch (e) {}
  window.__perf = { marks: [], keydown: null }
  let last = ''
  const sig = () => {
    const items = document.querySelectorAll('${GALLERY_ITEM}')
    const withProduct = [...items].filter(i => i.querySelector('.vtex-product-summary-2-x-container'))
    const href = (el) => { const a = el && el.querySelector('a[href]'); return a ? a.getAttribute('href') : null }
    const counter = (document.querySelector('[class*="totalProducts"]') || {}).innerText || null
    return { url: location.pathname + location.search, count: withProduct.length, first: href(withProduct[0]), last: href(withProduct[withProduct.length - 1]), counter }
  }
  const check = () => {
    const s = sig(); const k = JSON.stringify(s)
    if (k !== last) { last = k; window.__perf.marks.push({ t: performance.now(), ...s }) }
  }
  new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true })
  addEventListener('keydown', (e) => { if (e.key === 'Enter') window.__perf.keydown = e.timeStamp }, true)
  addEventListener('popstate', check); setInterval(check, 250)
})()`

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function main() {
  const token = await getToken()
  const browser = await chromium.launch({ headless: true })

  writeJSON('meta.json', {
    campaign: CAMPAIGN,
    startedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    browser: `chromium ${browser.version()} headless`,
    playwright: require('playwright-core/package.json').version,
    node: process.version,
    iterations: ITERATIONS,
    warmups: WARMUPS,
    terms: TERMS,
    conditions: CONDITIONS,
    config: { ...config, terms: undefined },
  })

  const rounds = WARMUPS + ITERATIONS

  for (let round = 0; round < rounds; round++) {
    const warmup = round < WARMUPS

    console.log(`[${new Date().toISOString()}] round ${round + 1}/${rounds}${warmup ? ' (warmup)' : ''}`)
    await runRound({ browser, token, round, warmup })
    // Downloaded every round so a logger with limited retention loses nothing.
    await fetchLogs(Date.now() - 30 * 60 * 1000).catch((error) => console.log(`logs: ${error.message}`))
    writeJSON('restarts.json', listRestarts())
  }

  await browser.close()

  const meta = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'meta.json'), 'utf8'))

  meta.finishedAt = new Date().toISOString()
  writeJSON('meta.json', meta)
  writeJSON('restarts.json', listRestarts())
  // Logs are delivered fire-and-forget; give the last ones time to arrive.
  await sleep(10000)
  await fetchLogs(Date.parse(meta.startedAt) - 60000)
  console.log(`done: ${OUT_DIR}`)
}

const wants = (condition) => !CONDITIONS || CONDITIONS.includes(condition)

async function runRound({ browser, token, round, warmup }) {
  const spa = {}

  // Home pages are opened first and in parallel because they are not measured;
  // every measured step then runs alone (concurrency 1).
  const opened = []

  for (const term of TERMS) {
    spa[term.id] = {}
    for (const slot of ['A', 'B', 'C', 'D']) {
      opened.push({ term, slot })
    }
  }

  await mapLimit(opened, 4, async ({ term, slot }) => {
    spa[term.id][slot] = await openHome(browser, token, term).catch((error) => ({ error }))
  })
  await sleep(2000)

  const step = (term, slot, condition, action, extra) =>
    measure({ round, warmup, term, slot, condition, page: spa[term.id][slot], action, extra })

  // Phase 1: uncached first search, then everything that reuses its result set.
  // Only the start of the chain is gated: pausing inside it would let the
  // result set expire.
  for (const term of TERMS) {
    await waitExpired(term)
    gate = await waitOutsideRestart()
    await step(term, 'A', 'first', 'search', { expectedCache: 'miss' })
    await step(term, 'B', 'repeat', 'search', { expectedCache: 'hit' })
    if (term.paginate && wants('page2')) {
      await step(term, 'A', 'page2', 'page2', { expectedCache: 'hit', requires: 'first' })
    }
    if (wants('filter')) {
      await step(term, 'B', 'filter', 'filter', { expectedCache: 'hit', requires: 'repeat' })
    }
    await step(term, 'C', 'prep', 'search', { expectedCache: 'any' })
    await step(term, 'D', 'prep', 'search', { expectedCache: 'any' })
  }

  // Phase 2 and 3: the same actions after the result set expired.
  for (const term of TERMS) {
    if (!term.paginate || !wants('page2-nocache')) continue
    await waitExpired(term)
    gate = await waitOutsideRestart()
    await step(term, 'C', 'page2-nocache', 'page2', { expectedCache: 'miss', requires: 'prep' })
  }

  for (const term of TERMS) {
    if (!wants('filter-nocache')) continue
    await waitExpired(term)
    gate = await waitOutsideRestart()
    await step(term, 'D', 'filter-nocache', 'filter', { expectedCache: 'miss', requires: 'prep' })
  }

  for (const term of TERMS) {
    for (const slot of Object.values(spa[term.id])) {
      await slot?.context?.close().catch(() => undefined)
    }
  }

  // Phase 4: direct load of the search URL (SSR), uncached then cached.
  for (const term of TERMS) {
    if (wants('direct-nocache')) {
      await waitExpired(term)
      gate = await waitOutsideRestart()
      await measureDirect({ browser, token, round, warmup, term, condition: 'direct-nocache', expectedCache: 'miss' })
    }
    if (wants('direct-cache')) {
      await measureDirect({ browser, token, round, warmup, term, condition: 'direct-cache', expectedCache: 'hit' })
    }
  }
}

/** Pause taken by the last gate; stored in the next measured record. */
let gate = null

/**
 * The dev harness re-runs `vtex link` every 60-105s and swaps the app 20-40s
 * after each build log (see the baseline document). Independent steps start
 * only once the latest swap is over, so they are not measured across it. With
 * no build logs (e.g. a stable environment) this does nothing.
 */
async function waitOutsideRestart() {
  const { quietAfterLogMs } = config.restartAvoidance || {}

  if (!quietAfterLogMs) return null

  const started = Date.now()

  for (;;) {
    const last = Date.parse(listRestarts().pop() || 0)
    const readyAt = last + quietAfterLogMs

    if (readyAt <= Date.now()) break
    await sleep(Math.min(readyAt - Date.now(), 5000))
  }

  const last = listRestarts().pop() || null

  return { waitedMs: Date.now() - started, lastRestart: last }
}

async function waitExpired(term) {
  const readyAt = (lastTouch[term.id] || 0) + config.cacheExpiryWaitMs

  if (readyAt > Date.now()) await sleep(readyAt - Date.now())
}

function perfRunId(round, term, condition, slot) {
  return `${CAMPAIGN}-r${String(round).padStart(2, '0')}-${term.id}-${condition}-${slot}`
}

async function newContext(browser, token, perfRun) {
  const context = await browser.newContext({ viewport: config.viewport })
  const host = new URL(config.baseUrl).hostname

  await context.addCookies(
    [`VtexIdclientAutCookie_${config.account}`, 'VtexIdclientAutCookie'].map((name) => ({
      name,
      value: token,
      domain: '.myvtex.com',
      path: '/',
      httpOnly: true,
      secure: true,
    }))
  )
  await context.addInitScript(RECORDER)

  // The header only goes to the store's GraphQL, so third parties never see a
  // custom header (it would trigger CORS preflights and change their timing).
  const state = { perfRun }

  await context.route(
    (url) => url.hostname === host && (/\/_v\/[^/]+\/graphql\//.test(url.pathname) || url.searchParams.has('__pickRuntime')),
    (route) => route.continue({ headers: { ...route.request().headers(), 'x-perf-run': state.perfRun } })
  )

  return { context, state }
}

async function openHome(browser, token, term) {
  const { context, state } = await newContext(browser, token, `${CAMPAIGN}-home`)
  const page = await context.newPage()
  const responses = collectResponses(page, term)

  await page.goto(`${config.baseUrl}/`, { waitUntil: 'load', timeout: config.timeouts.homeMs })
  await page.locator('input[placeholder*="Qué estás buscando"]:visible').first().waitFor({ timeout: 30000 })

  return { context, page, state, responses, history: [] }
}

/**
 * Captures the store's search responses with their decoded variables and body
 * summary. Any of them touches the resolver, so they also move the term's
 * last-touch time used to let the result set expire.
 */
function collectResponses(page, term) {
  const list = []

  page.on('response', async (response) => {
    const url = response.url()

    if (/[?&]__pickRuntime=/.test(url)) {
      list.push(...(await readPickRuntime(response)))
      lastTouch[term.id] = Date.now()
      return
    }

    const op = (url.match(/operationName=(\w+)/) || [])[1]
    let postOp = null

    if (!op && /\/_v\/[^/]+\/graphql\//.test(url) && response.request().method() === 'POST') {
      postOp = (response.request().postData() || '').match(/"operationName":"(\w+)"/)?.[1]
    }

    const name = op || postOp

    if (!['productSearchV3', 'facetsV2', 'GPSearchAllIds'].includes(name)) return

    lastTouch[term.id] = Date.now()

    const entry = {
      op: name,
      source: 'client',
      receivedAt: Date.now(),
      status: response.status(),
      url,
      variables: decodeVariables(url, response.request().postData()),
      headers: pick(response.headers(), [
        'x-cache',
        'x-router-cache',
        'x-vtex-router-elapsed-time',
        'x-vtex-backend-elapsed-time',
        'cache-control',
      ]),
    }

    try {
      const body = await response.json()
      const data = body.data || {}

      if (name === 'productSearchV3') {
        Object.assign(entry, summarizeProducts(data.productSearch))
      } else if (name === 'facetsV2') {
        entry.recordsFiltered = data.facets?.recordsFiltered ?? null
        entry.facetGroups = (data.facets?.facets || []).length
      } else {
        entry.recordsFiltered = data.productSearch?.recordsFiltered ?? null
        entry.products = (data.productSearch?.products || []).length
      }

      entry.error = body.errors?.[0]?.message?.slice(0, 200) || null
    } catch (error) {
      entry.error = `unreadable body: ${String(error.message).slice(0, 120)}`
    }

    list.push(entry)
  })

  return list
}

function summarizeProducts(ps = {}) {
  const products = ps.products || []

  return {
    recordsFiltered: ps.recordsFiltered ?? null,
    products: products.length,
    links: products.map((p) => p.link),
    brands: products.map((p) => p.brand),
    categories: products.map((p) => (p.categories || []).join('|')),
  }
}

/**
 * The store's client-side navigation fetches the next page's runtime with
 * `__pickRuntime`; when the server managed to resolve the search queries in
 * time they come inside `queryData` and the client does not ask again.
 */
async function readPickRuntime(response) {
  const base = { source: 'pickRuntime', receivedAt: Date.now(), status: response.status(), url: response.url() }
  const entries = []

  try {
    const body = await response.json()
    const queryData = body.queryData || []

    entries.push({ ...base, op: 'pickRuntime', queries: queryData.map((q) => (q.query || '').match(/query (\w+)/)?.[1] || '?') })

    for (const q of queryData) {
      const op = (q.query || '').match(/query (\w+)/)?.[1]

      if (op !== 'productSearchV3' && op !== 'facetsV2') continue

      const data = typeof q.data === 'string' ? JSON.parse(q.data) : q.data || {}
      const variables = typeof q.variables === 'string' ? JSON.parse(q.variables) : q.variables || {}
      const entry = { ...base, op, variables, error: null }

      if (op === 'productSearchV3') Object.assign(entry, summarizeProducts(data.productSearch))
      else entry.recordsFiltered = data.facets?.recordsFiltered ?? null
      entries.push(entry)
    }
  } catch (error) {
    entries.push({ ...base, op: 'pickRuntime', error: `unreadable body: ${String(error.message).slice(0, 120)}` })
  }

  return entries
}

async function measure({ round, warmup, term, slot, condition, page: slotState, action, extra }) {
  if (CONDITIONS && condition !== 'prep' && !CONDITIONS.includes(condition)) return null

  const perfRun = perfRunId(round, term, condition, slot)
  const record = {
    campaign: CAMPAIGN,
    perfRun,
    round,
    warmup,
    term: term.id,
    termText: term.term,
    condition,
    slot,
    action,
    expectedCache: extra.expectedCache,
    gate: takeGate(),
    startedAt: null,
    outcome: null,
  }

  if (!slotState || slotState.error) {
    record.outcome = 'error'
    record.error = `home failed: ${slotState?.error?.message?.slice(0, 200) || 'missing'}`
    return save(record)
  }

  if (extra.requires && !slotState.history.includes(extra.requires)) {
    record.outcome = 'skipped'
    record.error = `prior step "${extra.requires}" did not succeed in this context`
    return save(record)
  }

  const { page, state, responses } = slotState
  const timeout = config.timeouts.spaStepMs

  state.perfRun = perfRun
  responses.length = 0
  record.startedAt = new Date().toISOString()
  record.urlBefore = page.url()

  const started = Date.now()

  try {
    let tStart
    const expectOp = 'productSearchV3'
    let expectVars
    // Other components (e.g. shelves) also send productSearchV3; only the one
    // for this term counts.
    const sameTerm = (v) => v.fullText === term.term || (v.query || '').split('/').includes(term.term)

    if (action === 'search') {
      const input = page.locator('input[placeholder*="Qué estás buscando"]:visible').first()

      await input.click()
      await input.fill(term.term)
      await page.evaluate(() => { window.__perf.keydown = null; window.__perf.marks.length = 0 })
      await input.press('Enter')
      tStart = await page.evaluate(() => window.__perf.keydown)
      expectVars = (v) => sameTerm(v) && (v.from ?? 0) === 0 && (v.selectedFacets || []).length <= 1
    } else if (action === 'page2') {
      tStart = await page.evaluate(() => {
        const button = document.querySelector('button[title="Ir para Página 2"]')

        if (!button) return null
        window.__perf.marks.length = 0
        const t = performance.now()

        button.click()
        return t
      })
      if (tStart == null) throw new Error('page 2 button not found')
      expectVars = (v) => sameTerm(v) && v.from === 48
    } else if (action === 'filter') {
      // The filter sidebar mounts after the grid; waiting for it is not part of
      // the measured action.
      await page
        .waitForFunction((id) => document.getElementById(id), term.filter.inputId, { timeout: 20000 })
        .catch(() => undefined)
      tStart = await page.evaluate((id) => {
        const input = document.getElementById(id)

        if (!input) return null
        window.__perf.marks.length = 0
        const t = performance.now()

        ;(input.closest('label') || input).click()
        return t
      }, term.filter.inputId)
      if (tStart == null) throw new Error(`filter ${term.filter.inputId} not found`)
      expectVars = (v) =>
        sameTerm(v) && (v.selectedFacets || []).some((f) => f.key === term.filter.key && f.value === term.filter.value)
    }

    // The products can come from the runtime fetch of the SPA navigation
    // (`__pickRuntime`, resolved on the server) or from the client's own
    // productSearchV3. The step succeeds when the gallery shows the products of
    // a successful one; it fails when a client request failed and nothing
    // rendered after it.
    const candidates = new Map()
    let failedAt = null
    let failure = null
    let mark = null
    let response = null

    await waitFor(
      async () => {
        for (const r of responses) {
          if (r.op !== expectOp || !expectVars(r.variables || {}) || candidates.has(r)) continue
          if (r.status !== 200 || r.error || !r.links?.length) {
            failure = failure || r
            failedAt = failedAt || Date.now()
            candidates.set(r, null)
            continue
          }

          const from = r.variables?.from ?? 0

          candidates.set(r, {
            first: r.links[0],
            count: r.links.length,
            counter: `${from + r.links.length} de ${r.recordsFiltered}`,
            // Page clock time the response finished; earlier gallery states
            // belong to the previous step even when they show the same product.
            after: await page.evaluate(
              (url) => (performance.getEntriesByName(url).slice(-1)[0] || {}).responseEnd || null,
              r.url
            ),
          })
        }

        for (const [r, expected] of candidates) {
          if (!expected) continue
          const found = await page.evaluate(findMark, { ...expected, needCounter: false })

          if (found) {
            mark = found
            response = r
            return true
          }
        }

        if (failure && Date.now() - failedAt > 5000) {
          throw new Error(`${failure.op} ${failure.status} ${failure.error || 'without products'} (${failure.source})`)
        }

        return false
      },
      timeout,
      'gallery with the response products'
    )

    const expected = candidates.get(response)
    const from = response.variables?.from ?? 0

    record.response = summarizeResponse(response)
    record.responseEndMs = expected.after == null ? null : round1(expected.after - tStart)
    record.failedRequests = [...candidates.entries()].filter(([, e]) => !e).map(([r]) => summarizeResponse(r))

    // The counter can lag the grid by a render; the step is complete once both agree.
    const settled = await waitFor(
      () => page.evaluate(findMark, { ...expected, needCounter: true }),
      5000,
      'counter'
    ).catch(() => null)

    await sleep(300)

    const final = await page.evaluate(() => window.__perf.marks[window.__perf.marks.length - 1])
    const resources = await page.evaluate((t0) =>
      performance
        .getEntriesByType('resource')
        .filter((e) => e.startTime >= t0 - 5 && /\/_v\/[^/]+\/graphql\//.test(e.name))
        .map((e) => ({
          op: (e.name.match(/operationName=(\w+)/) || [])[1] || 'POST',
          startTime: e.startTime,
          requestStart: e.requestStart,
          responseStart: e.responseStart,
          responseEnd: e.responseEnd,
          duration: e.duration,
          transferSize: e.transferSize,
          decodedBodySize: e.decodedBodySize,
        })), tStart)

    const pickRes = await page.evaluate((t0) =>
      performance
        .getEntriesByType('resource')
        .filter((e) => e.startTime >= t0 - 5 && /[?&]__pickRuntime=/.test(e.name))
        .map((e) => ({ startTime: e.startTime, responseStart: e.responseStart, responseEnd: e.responseEnd, duration: e.duration, transferSize: e.transferSize, decodedBodySize: e.decodedBodySize })), tStart)
    const pick = responses.find((r) => r.op === 'pickRuntime')
    const searchRes = resources.filter((r) => r.op === 'productSearchV3')
    const facetsRes = resources.filter((r) => r.op === 'facetsV2')
    const facetsResponse = responses.find((r) => r.op === 'facetsV2')

    Object.assign(record, {
      outcome: 'success',
      tStart,
      productsVisibleMs: round1(mark.t - tStart),
      productsSource: response.source,
      visibleWithoutRerender: Boolean(mark.unchanged),
      pickRuntimeRequest: pickRes[0] ? { ...relative(pickRes[0], tStart), queries: pick?.queries || null } : null,
      counterSettledMs: settled ? round1(settled.t - tStart) : null,
      productSearchRequest: searchRes[0] ? relative(searchRes[0], tStart) : null,
      facetsRequest: facetsRes[0] ? relative(facetsRes[0], tStart) : null,
      facetsResponse: facetsResponse ? summarizeResponse(facetsResponse) : null,
      auxRequests: responses.filter((r) => r.op === 'GPSearchAllIds').map(summarizeResponse),
      visible: final.count,
      returned: expected.count,
      recordsFiltered: response.recordsFiltered,
      counter: final.counter,
      urlAfter: page.url(),
      visibleMatchesResponse: final.count === expected.count && final.first === expected.first,
      filterCorrect: action === 'filter' ? checkFilter(term, response) : null,
      pageCorrect: action === 'page2' ? from === 48 && /[?&]page=2\b/.test(page.url()) : null,
    })
    slotState.history.push(condition)
  } catch (error) {
    record.outcome = /timeout/i.test(error.message) ? 'timeout' : 'error'
    record.error = error.message.slice(0, 300)
    record.urlAfter = page.url()
    record.responsesSeen = responses.map(summarizeResponse)
  }

  record.wallMs = Date.now() - started
  record.endedAt = new Date().toISOString()
  lastTouch[term.id] = Date.now()

  return save(record)
}

async function measureDirect({ browser, token, round, warmup, term, condition, expectedCache }) {
  const perfRun = perfRunId(round, term, condition, 'E')
  const record = {
    campaign: CAMPAIGN,
    perfRun,
    round,
    warmup,
    term: term.id,
    termText: term.term,
    condition,
    slot: 'E',
    action: 'direct',
    expectedCache,
    gate: takeGate(),
    url: config.baseUrl + term.path,
  }

  let context

  try {
    const created = await newContext(browser, token, perfRun)

    context = created.context
    const page = await context.newPage()
    const responses = collectResponses(page, term)
    const navigations = []

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push({ at: Date.now(), url: frame.url() })
    })

    record.startedAt = new Date().toISOString()
    const started = Date.now()
    const timeout = config.timeouts.navigationMs

    await page.goto(record.url, { waitUntil: 'commit', timeout })

    // Server-rendered products: the first gallery mark with products on the
    // final document. A CloudFront error page reloads itself, so marks are read
    // from whichever document is current.
    const mark = await waitFor(
      () =>
        page
          .evaluate(() => {
            const m = window.__perf && window.__perf.marks.find((x) => x.count > 0)

            return m ? { ...m, timeOrigin: performance.timeOrigin } : null
          })
          .catch(() => null),
      timeout - (Date.now() - started),
      'products on direct load'
    )
    const productsAt = Date.now()

    await sleep(300)
    const nav = await page.evaluate(() => {
      const e = performance.getEntriesByType('navigation')[0]

      return {
        requestStart: e.requestStart,
        responseStart: e.responseStart,
        responseEnd: e.responseEnd,
        domContentLoaded: e.domContentLoadedEventStart,
        loadEvent: e.loadEventStart || null,
        transferSize: e.transferSize,
        decodedBodySize: e.decodedBodySize,
        status: e.responseStatus,
      }
    })
    const final = await page.evaluate(() => window.__perf.marks[window.__perf.marks.length - 1])

    Object.assign(record, {
      outcome: 'success',
      navigations: navigations.length,
      cloudfrontRetry: navigations.length > 1,
      // Measured from goto, so a CloudFront error page that reloads itself is included.
      productsVisibleMs: round1(mark.timeOrigin + mark.t - started),
      productsInFinalDocumentMs: round1(mark.t),
      wallToProductsMs: productsAt - started,
      ttfbMs: round1(nav.responseStart),
      htmlReceivedMs: round1(nav.responseEnd),
      domContentLoadedMs: round1(nav.domContentLoaded),
      htmlBytes: nav.decodedBodySize,
      htmlStatus: nav.status,
      visible: final.count,
      counter: final.counter,
      clientSearchResponses: responses.map(summarizeResponse),
      urlAfter: page.url(),
    })
    record.wallMs = Date.now() - started
  } catch (error) {
    record.outcome = /timeout/i.test(error.message) ? 'timeout' : 'error'
    record.error = error.message.slice(0, 300)
  }

  record.endedAt = new Date().toISOString()
  lastTouch[term.id] = Date.now()
  await context?.close().catch(() => undefined)

  return save(record)
}

/**
 * Runs in the page. The first gallery state after the response with the
 * response's products; when the gallery already showed them (nothing to
 * re-render), the response end is used and flagged.
 */
function findMark({ first, count, counter, after, needCounter }) {
  const marks = window.__perf.marks
  const ok = (m) => m.count > 0 && m.first === first && (!needCounter || ((m.counter || '').startsWith(counter) && m.count === count))
  const hit = marks.find((m) => (after == null || m.t >= after) && ok(m))

  if (hit) return hit

  const last = marks[marks.length - 1]

  if (after != null && last && last.t < after && ok(last) && performance.now() - after > 3000) {
    return { ...last, t: after, unchanged: true }
  }

  return null
}

function takeGate() {
  const taken = gate

  gate = null
  return taken
}

function checkFilter(term, response) {
  const value = term.filter.value.toLowerCase()

  if (term.filter.check === 'brand') {
    return response.brands.every((b) => (b || '').toLowerCase().replace(/\s+/g, '-') === value)
  }

  return response.categories.every((c) => c.toLowerCase().includes(`/${value}/`))
}

function summarizeResponse(r) {
  const v = r.variables || {}

  return {
    op: r.op,
    source: r.source,
    status: r.status,
    error: r.error || null,
    recordsFiltered: r.recordsFiltered ?? null,
    products: r.products ?? null,
    facetGroups: r.facetGroups ?? null,
    firstLink: r.links?.[0] ?? null,
    headers: r.headers,
    variables: {
      query: v.query,
      map: v.map,
      fullText: v.fullText,
      from: v.from,
      to: v.to,
      orderBy: v.orderBy,
      selectedFacets: v.selectedFacets,
    },
  }
}

function relative(entry, t0) {
  return {
    startMs: round1(entry.startTime - t0),
    ttfbMs: round1(entry.responseStart - entry.startTime),
    durationMs: round1(entry.duration),
    endMs: round1(entry.responseEnd - t0),
    transferBytes: entry.transferSize,
    bodyBytes: entry.decodedBodySize,
  }
}

function decodeVariables(url, postData) {
  try {
    const ext = new URL(url).searchParams.get('extensions')

    if (ext) {
      const parsed = JSON.parse(ext)

      if (typeof parsed.variables === 'string') {
        return JSON.parse(Buffer.from(parsed.variables, 'base64').toString())
      }
    }

    const vars = new URL(url).searchParams.get('variables')

    if (vars) return JSON.parse(vars)
    if (postData) return JSON.parse(postData).variables || {}
  } catch {
    // Unknown encodings are reported as empty variables.
  }

  return {}
}

async function getToken() {
  if (process.env.VTEX_ID_TOKEN) return process.env.VTEX_ID_TOKEN

  const { VTEX_APP_KEY: appkey, VTEX_APP_TOKEN: apptoken } = process.env

  if (!appkey || !apptoken) {
    throw new Error('Set VTEX_ID_TOKEN, or VTEX_APP_KEY and VTEX_APP_TOKEN')
  }

  const response = await fetch(
    `https://vtexid.vtex.com.br/api/vtexid/apptoken/login?an=${config.account}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appkey, apptoken }) }
  )
  const body = await response.json()

  if (!body.token) throw new Error(`apptoken login failed: ${response.status} ${body.authStatus || ''}`)

  return body.token
}

/** Build logs of the dev harness: each file marks a `vtex link` restart. */
function listRestarts() {
  if (!RESTART_LOG_DIR || !fs.existsSync(RESTART_LOG_DIR)) return []

  return fs
    .readdirSync(RESTART_LOG_DIR)
    .map((f) => f.match(/^build-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)\.(\d{3})Z\.log$/))
    .filter(Boolean)
    .map((m) => `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`)
    .sort()
}

const seenLogs = new Set()

/**
 * Appends the debug logger's entries newer than `since` to logs.jsonl, once
 * each. Every entry of the app is kept, also those without `perfRun`: the
 * server-side render does not forward the header and has to be matched by time.
 */
async function fetchLogs(since) {
  if (!config.loggerUrl) return

  const file = path.join(OUT_DIR, 'logs.jsonl')

  if (!seenLogs.size && fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) seenLogs.add(JSON.parse(line).id)
  }

  let page = 1
  let added = 0

  for (;;) {
    const response = await fetch(`${config.loggerUrl}/api/logs?limit=500&page=${page}`, {
      headers: { 'User-Agent': 'curl/8.5.0' },
    })
    const body = await response.json()
    const rows = body.data || []
    let older = false

    for (const row of rows) {
      if (Date.parse(row.createdAt) < since) {
        older = true
      } else if (!seenLogs.has(row.id)) {
        seenLogs.add(row.id)
        fs.appendFileSync(file, `${JSON.stringify(row)}\n`)
        added++
      }
    }

    if (older || page >= (body.pagination?.totalPages || 1) || !rows.length) break
    page++
  }

  console.log(`  logs added: ${added}`)
}

async function waitFor(fn, timeout, what) {
  const deadline = Date.now() + timeout

  for (;;) {
    const value = await fn()

    if (value) return value
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`)
    await sleep(100)
  }
}

async function mapLimit(items, limit, fn) {
  const queue = [...items]

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (queue.length) await fn(queue.shift())
    })
  )
}

function save(record) {
  fs.appendFileSync(runsFile, `${JSON.stringify(record)}\n`)
  const ms = record.productsVisibleMs != null ? `${record.productsVisibleMs}ms` : record.error
  console.log(`  ${record.term} ${record.condition}/${record.slot}: ${record.outcome} ${ms}`)
  return record
}

function writeJSON(name, data) {
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`)
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj[k] != null).map((k) => [k, obj[k]]))
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((a) => a.replace(/^--/, '').split('=')).map(([k, ...v]) => [k, v.length ? v.join('=') : true])
  )
}

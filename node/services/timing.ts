import { debugLog } from './debugLog'

type Span = {
  name: string
  startMs: number
  durationMs: number
  meta?: Record<string, unknown>
}

type RequestTimings = {
  startedAt: number
  spans: Span[]
}

const timingsByContext = new WeakMap<Context, RequestTimings>()

/**
 * Identifies the worker process behind each log, so a baseline can tell a
 * request answered by a freshly started process (empty in-memory caches) from
 * one answered by a warm worker, and spot every restart of the linked app.
 */
const bootId = Math.random().toString(36).slice(2, 10)
const bootedAt = Date.now()

/**
 * Temporary instrumentation for the latency investigation: collects how long
 * each stage of a search takes and ships them as one log once the response has
 * been written, so the gap between the last stage and the flush shows what
 * GraphQL field resolution and serialization cost on top.
 */
export function startRequestTiming(
  ctx: Context,
  operation: string,
  context?: Record<string, unknown>
) {
  if (timingsByContext.has(ctx)) {
    return
  }

  const timings: RequestTimings = { startedAt: Date.now(), spans: [] }

  timingsByContext.set(ctx, timings)

  // Lets the baseline script tie a log to the browser run that caused it,
  // when the header survives the router (the segment route strips cookies).
  const perfRun = ctx.get?.('x-perf-run') || undefined

  const flush = () => {
    const totalMs = Date.now() - timings.startedAt

    debugLog(ctx, `timing:${operation}`, {
      ...context,
      ...(perfRun ? { perfRun } : {}),
      totalMs,
      responseBytes: bodyBytes(ctx),
      spans: timings.spans,
      worker: {
        bootId,
        pid: process.pid,
        uptimeMs: Date.now() - bootedAt,
      },
    })
  }

  // Not every test context carries a raw response.
  ctx.res?.once?.('finish', flush)
}

export async function timed<T>(
  ctx: Context,
  name: string,
  fn: () => Promise<T>,
  describe?: (result: T) => Record<string, unknown>
): Promise<T> {
  const started = Date.now()

  try {
    const result = await fn()

    record(ctx, name, started, describe?.(result))

    return result
  } catch (error) {
    record(ctx, name, started, { error: (error as Error)?.message })
    throw error
  }
}

export function timedSync<T>(ctx: Context, name: string, fn: () => T): T {
  const started = Date.now()
  const result = fn()

  record(ctx, name, started)

  return result
}

export function recordSpan(
  ctx: Context,
  name: string,
  started: number,
  meta?: Record<string, unknown>
) {
  record(ctx, name, started, meta)
}

function record(
  ctx: Context,
  name: string,
  started: number,
  meta?: Record<string, unknown>
) {
  const timings = timingsByContext.get(ctx)

  if (!timings) {
    return
  }

  timings.spans.push({
    name,
    startMs: started - timings.startedAt,
    durationMs: Date.now() - started,
    ...(meta ? { meta } : {}),
  })
}

function bodyBytes(ctx: Context) {
  const { body } = ctx

  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return Buffer.byteLength(body)
  }

  return Number(ctx.response?.length) || undefined
}

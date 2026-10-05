import type { DebugLogPayload } from '../clients/debugLogger'

const APP_NAME = 'gopersonal-search-resolver'

/**
 * Temporary instrumentation for the search-engine investigation.
 *
 * Only the fields named by each call site are sent: never the context, the
 * headers, the cookies or the token, which an earlier `console.log(ctx)` was
 * dumping whole. Delivery is best effort, so a logging outage can never take
 * the search down with it.
 */
export function debugLog(
  ctx: Context,
  message: string,
  context?: Record<string, unknown>,
  level: DebugLogPayload['level'] = 'info'
): void {
  try {
    const { account, workspace, requestId } = ctx.vtex

    // Awaiting would add the logger's latency to every search.
    void ctx.clients.debugLogger
      .send({
        level,
        message,
        app: APP_NAME,
        account,
        workspace,
        requestId,
        ...(context ? { context } : {}),
      })
      .catch(() => undefined)
  } catch {
    // Instrumentation must never be able to take the search down.
  }
}

/**
 * Resolves the GoPersonal identifiers to personalize a search with.
 *
 * The browser SDK keeps its session in `localStorage['gs-v-1']`, which never
 * reaches this service on its own. Three sources carry it here, in order of
 * precedence: headers forwarded by the storefront, the `gopersonal` cookie
 * written by the bridge snippet, and the SDK's own cookie mirror, which is
 * gated behind an allowlist of client ids and off for everyone else.
 */
const CUSTOMER_ID_HEADER = 'x-gopersonal-customer-id'
const SESSION_ID_HEADER = 'x-gopersonal-session-id'

/** Written by the storefront snippet, which mirrors `gsSDK.getSession()`. */
const BRIDGE_COOKIE = 'gopersonal'
const SESSION_COOKIE = 'gs-v-1'
const VUUID_COOKIE = 'gs_vuuid'

export type GoPersonalSession = {
  customer_id?: string
  session_id?: string
}

type StoredSession = {
  /** Only populated once the shopper goes through `gsSDK.login()`. */
  customer_id?: string
  /** Anonymous visitor id, `_gsVUUID_<uuid>_<epochMs>`. */
  vuuid?: string
  sessionId?: string
  /** The bridge snippet already collapses customer/visitor into this one. */
  customerId?: string
}

function readJsonCookie(ctx: Context, name: string): StoredSession {
  const raw = ctx.cookies.get(name)

  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(decodeURIComponent(raw)) as StoredSession
  } catch {
    return {}
  }
}

export function getGoPersonalSession(ctx: Context): GoPersonalSession {
  const bridge = readJsonCookie(ctx, BRIDGE_COOKIE)
  const stored = readJsonCookie(ctx, SESSION_COOKIE)

  // An anonymous shopper has no `customer_id`; the SDK exports the visitor id
  // in its place, so the same person stays recognizable before logging in.
  const customerId =
    ctx.get(CUSTOMER_ID_HEADER) ||
    bridge.customerId ||
    stored.customer_id ||
    stored.vuuid ||
    ctx.cookies.get(VUUID_COOKIE)

  const sessionId =
    ctx.get(SESSION_ID_HEADER) || bridge.sessionId || stored.sessionId

  return {
    ...(customerId ? { customer_id: customerId } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
  }
}

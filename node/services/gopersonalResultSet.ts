import { hydrateProductsFromCatalog } from './gopersonalCatalog'
import { fetchGoPersonalRankedIds } from './gopersonalSearch'
import { getGoPersonalSession } from './gopersonalSession'
import {
  extractSpecificationFieldIds,
  fetchFilterableFieldIds,
} from './specificationFilters'
import { recordSpan, timed } from './timing'

/**
 * Short enough that prices and stock stay as fresh as the catalog's own cache,
 * long enough to cover a page's two queries and the shopper's next click.
 */
const RESULT_SET_TTL_MS = 30 * 1000

/** A hydrated set weighs several MB, so only a handful are kept per worker. */
const RESULT_SET_MAX_ENTRIES = 20

export type GoPersonalResultSet = {
  productIds: string[]
  searchId?: string
  /** Hydrated catalog products, in GoPersonal's ranking. */
  products: SearchProduct[]
  filterableFieldIds: Set<string>
}

type ResultSetOptions = {
  projectId: string
  query: string
  limit: number
  salesChannel?: string | number | null
}

const recent = new Map<
  string,
  { resultSet: GoPersonalResultSet; expiresAt: number }
>()

const inflight = new Map<string, Promise<GoPersonalResultSet>>()

/**
 * Ranks a query in GoPersonal and hydrates the whole ranked set.
 *
 * The storefront asks for `productSearch` and `facets` in parallel, and both
 * need this same set: without sharing it, every page ranked the query twice
 * and downloaded the full hydration (~6MB for 250 ids) twice. Concurrent
 * callers now await one request, and the result is kept briefly so paging or
 * picking a filter right after does not pay for it again.
 *
 * The key carries everything that changes the answer: the GoPersonal session
 * personalizes the ranking, and the segment and sales channel change prices
 * and availability.
 */
export async function fetchGoPersonalResultSet(
  ctx: Context,
  options: ResultSetOptions
): Promise<GoPersonalResultSet> {
  const session = getGoPersonalSession(ctx)

  const key = JSON.stringify([
    ctx.vtex.account,
    ctx.vtex.workspace,
    options.projectId,
    options.query,
    options.limit,
    session.customer_id,
    session.session_id,
    ctx.vtex.segmentToken,
    options.salesChannel || '',
  ])

  const cached = recent.get(key)

  if (cached && cached.expiresAt > Date.now()) {
    recordSpan(ctx, 'resultSet.cacheHit', Date.now())

    return cached.resultSet
  }

  recent.delete(key)

  const pending = inflight.get(key)

  if (pending) {
    return timed(ctx, 'resultSet.awaitInflight', () => pending)
  }

  const request = timed(ctx, 'resultSet.load', () =>
    loadResultSet(ctx, options, session)
  )
    .then((resultSet) => {
      // An empty set usually means the catalog failed; keeping it would serve
      // an empty grid until it expires.
      if (resultSet.products.length > 0) {
        remember(key, resultSet)
      }

      return resultSet
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, request)

  return request
}

function remember(key: string, resultSet: GoPersonalResultSet) {
  // Maps iterate in insertion order, so the first key is the oldest one.
  if (recent.size >= RESULT_SET_MAX_ENTRIES) {
    recent.delete(recent.keys().next().value as string)
  }

  recent.set(key, {
    resultSet,
    expiresAt: Date.now() + RESULT_SET_TTL_MS,
  })
}

async function loadResultSet(
  ctx: Context,
  options: ResultSetOptions,
  session: ReturnType<typeof getGoPersonalSession>
): Promise<GoPersonalResultSet> {
  const { productIds, searchId } = await timed(
    ctx,
    'gopersonal.search',
    () =>
      fetchGoPersonalRankedIds(ctx, {
        project_id: options.projectId,
        query: options.query,
        limit: options.limit,
        ...session,
      }),
    (ranked) => ({ ids: ranked.productIds.length })
  )

  // GoPersonal only ranks; the catalog is the source of truth for price,
  // stock, sellers and SKUs, so the ranked ids are hydrated into real catalog
  // products and re-sorted back into GoPersonal's ranking.
  const products = await timed(
    ctx,
    'catalog.hydrate',
    () => hydrateProductsFromCatalog(ctx, productIds, options.salesChannel),
    (hydrated) => ({ requested: productIds.length, found: hydrated.length })
  )

  const fieldIds = extractSpecificationFieldIds(products)

  const filterableFieldIds = await timed(
    ctx,
    'catalog.filterableFields',
    () => fetchFilterableFieldIds(ctx, fieldIds),
    (filterable) => ({ fields: fieldIds.length, filterable: filterable.size })
  )

  return { productIds, searchId, products, filterableFieldIds }
}

/** Tests rank different fixtures under the same query. */
export function clearGoPersonalResultSetCache() {
  recent.clear()
  inflight.clear()
}

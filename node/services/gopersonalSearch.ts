import type {
  GoPersonalSearchBody,
  GoPersonalSearchResponse,
} from '../clients/gopersonal/types'

/**
 * `/search` caps this at 100. Only the ids are consumed downstream — products
 * come from the catalog — so the smallest page keeps the ranked ids from
 * arriving alongside a few hundred KB of hit payloads that are thrown away.
 */
const GOPERSONAL_MIN_PAGE_SIZE = 1

export type GoPersonalRankedIds = {
  /** Every ranked product id, in ranking order and without repeats. */
  productIds: string[]
  searchId?: string
  totalResults: number
}

/**
 * Ranks a query and returns every product id GoPersonal matched.
 *
 * `return_all_ids` answers the whole ranked set in the `/search` call itself,
 * so the ids no longer have to be assembled from `/search/page`. That removes
 * both the extra round trips and their race: `/search` stores the ranked set to
 * S3 asynchronously, so a page requested right after it could 404 and silently
 * truncate the result set.
 */
export async function fetchGoPersonalRankedIds(
  ctx: Context,
  body: Omit<GoPersonalSearchBody, 'page_size' | 'return_all_ids'>
): Promise<GoPersonalRankedIds> {
  const { gopersonal } = ctx.clients

  const response: GoPersonalSearchResponse = await gopersonal.search({
    ...body,
    page_size: GOPERSONAL_MIN_PAGE_SIZE,
    return_all_ids: true,
  })

  const searchId = response.search_id
  const productIds = dedupe(response.product_ids ?? [])

  // A project that has not been upgraded yet answers without `product_ids`,
  // which would empty the grid rather than return a shorter one.
  if (!response.product_ids) {
    ctx.vtex.logger.error({
      message:
        'GoPersonal: /search answered without product_ids despite return_all_ids',
      query: body.query,
      searchId,
    })
  }

  return {
    productIds,
    searchId,
    totalResults: response.total_results ?? productIds.length,
  }
}

function dedupe(ids: Array<string | number>): string[] {
  const seen = new Set<string>()

  return ids.reduce<string[]>((unique, id) => {
    const productId = String(id)

    if (productId && !seen.has(productId)) {
      seen.add(productId)
      unique.push(productId)
    }

    return unique
  }, [])
}

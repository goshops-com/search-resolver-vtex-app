import type {
  GoPersonalHit,
  GoPersonalSearchBody,
  GoPersonalSearchResponse,
} from '../clients/gopersonal/types'

/** `/search` answers at most 250 hits in a single page. */
const GOPERSONAL_MAX_PAGE_SIZE = 250

export type GoPersonalRankedIds = {
  /** Every ranked product id, in ranking order and without repeats. */
  productIds: string[]
  searchId?: string
  totalResults: number
  /**
   * Catalog products the sync indexed as `vtex_product`, by product id. Ids
   * missing here (a project whose sync does not index it, or ranked past the
   * first page) still have to be hydrated from the catalog.
   */
  indexedProducts: Map<string, SearchProduct>
}

/**
 * Ranks a query and returns every product id GoPersonal matched.
 *
 * `return_all_ids` answers the whole ranked set in the `/search` call itself,
 * and a single page of up to 250 hits carries each product's `vtex_product`,
 * so a default-sized ranked set is answered without paging or hydrating.
 */
export async function fetchGoPersonalRankedIds(
  ctx: Context,
  body: Omit<GoPersonalSearchBody, 'page_size' | 'return_all_ids'>
): Promise<GoPersonalRankedIds> {
  const { gopersonal } = ctx.clients

  const response: GoPersonalSearchResponse = await gopersonal.search({
    ...body,
    page_size: GOPERSONAL_MAX_PAGE_SIZE,
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

  const indexedProducts = readIndexedProducts(response.hits)

  return {
    productIds,
    searchId,
    totalResults: response.total_results ?? productIds.length,
    indexedProducts,
  }
}

function readIndexedProducts(hits: GoPersonalHit[] = []) {
  const products = new Map<string, SearchProduct>()

  hits.forEach(({ payload }) => {
    if (typeof payload?.vtex_product !== 'string') {
      return
    }

    try {
      const product = JSON.parse(payload.vtex_product) as SearchProduct

      products.set(String(product.productId), product)
    } catch {
      // A malformed payload falls back to the catalog like a missing one.
    }
  })

  return products
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

import type {
  GoPersonalHit,
  GoPersonalSearchBody,
  GoPersonalSearchResponse,
} from '../clients/gopersonal/types'

/** `/search` and `/search/page` cap a page at 100 hits. */
const GOPERSONAL_MAX_PAGE_SIZE = 100

export type GoPersonalRankedIds = {
  /** Every ranked product id, in ranking order and without repeats. */
  productIds: string[]
  searchId?: string
  totalResults: number
  /**
   * Catalog products the sync indexed as `vtex_product`, by product id. Ids
   * missing here still have to be hydrated from the catalog.
   */
  indexedProducts: Map<string, SearchProduct>
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

  // A project whose sync does not index `vtex_product` is hydrated entirely
  // from the catalog, so asking for the rest of its pages would be wasted.
  if (indexedProducts.size > 0 && searchId) {
    const pages = Math.ceil(productIds.length / GOPERSONAL_MAX_PAGE_SIZE)

    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) =>
        gopersonal
          .searchPage({
            project_id: body.project_id,
            search_id: searchId,
            page: index + 2,
            page_size: GOPERSONAL_MAX_PAGE_SIZE,
          })
          // A missing page only costs a catalog hydration for its ids.
          .catch((error) => {
            ctx.vtex.logger.warn({
              message: 'GoPersonal: failed to fetch a /search/page',
              error: error.message,
              searchId,
              page: index + 2,
            })

            return { hits: [] }
          })
      )
    )

    rest.forEach((page) => {
      readIndexedProducts(page.hits).forEach((product, id) => {
        indexedProducts.set(id, product)
      })
    })
  }

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

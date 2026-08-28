/**
 * The catalog `/pub/products/search` endpoint answers at most 50 records per
 * call regardless of how many `fq` clauses are sent, so id lists are split.
 */
const CATALOG_IDS_PER_REQUEST = 50

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
}

/**
 * Rewrites the absolute URLs the catalog proxy builds into store-relative ones.
 *
 * The proxy answers with links pointing at `portal.vtexcommercestable.com.br`,
 * a host that bounces anonymous shoppers to the admin login, so following one
 * lands on an error page instead of the product or the cart. Intelligent Search
 * hands the storefront a relative `link` and an empty `addToCartLink`, letting
 * it build both from the current host; this brings hydrated products in line.
 */
function relativizeProductLinks(product: SearchProduct): SearchProduct {
  return {
    ...product,
    link: product.linkText ? `/${product.linkText}/p` : product.link,
    items: product.items?.map((item) => ({
      ...item,
      sellers: item.sellers?.map((seller) => ({
        ...seller,
        addToCartLink: '',
      })),
    })),
  } as SearchProduct
}

/**
 * Hydrates GoPersonal's ranked ids into full catalog products.
 *
 * GoPersonal returns relevance-ranked ids but the catalog answers in its own
 * order, so results are re-sorted back into the ranking. Ids the catalog does
 * not know (unpublished, out of the sales channel) are dropped rather than
 * rendered as holes in the grid.
 */
export async function hydrateProductsFromCatalog(
  ctx: Context,
  productIds: string[],
  salesChannel?: string | number | null
): Promise<SearchProduct[]> {
  if (productIds.length === 0) {
    return []
  }

  const { search } = ctx.clients
  const vtexSegment = ctx.vtex.segmentToken

  const batches = await Promise.all(
    chunk(productIds, CATALOG_IDS_PER_REQUEST).map((ids) =>
      search.productsById(ids, vtexSegment, salesChannel).catch((error) => {
        ctx.vtex.logger.error({
          message: 'GoPersonal: failed to hydrate products from catalog',
          error: error.message,
          idsCount: ids.length,
        })

        return [] as SearchProduct[]
      })
    )
  )

  const byId = new Map<string, SearchProduct>()

  batches.forEach((products) => {
    products.forEach((product) => {
      byId.set(String(product.productId), product)
    })
  })

  const ordered = productIds.reduce<SearchProduct[]>((products, id) => {
    const product = byId.get(id)

    if (product) {
      products.push(relativizeProductLinks(product))
    }

    return products
  }, [])

  // A total miss means GoPersonal is indexed against a different catalog than
  // the one being queried, which otherwise surfaces only as an empty grid.
  if (ordered.length === 0) {
    ctx.vtex.logger.warn({
      message:
        'GoPersonal: no ranked product was found in the catalog. The GoPersonal project may be indexed against another account.',
      requestedIds: productIds.slice(0, 10),
      idsCount: productIds.length,
    })
  }

  return ordered
}

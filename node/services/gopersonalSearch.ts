import type {
  GoPersonalHit,
  GoPersonalSearchBody,
  GoPersonalSearchResponse,
} from '../clients/gopersonal/types'

/** `/search` answers at most 250 hits in a single page. */
const GOPERSONAL_MAX_PAGE_SIZE = 250

/**
 * GoPersonal lowercases every key of `vtex_product` when indexing it, so the
 * catalog casing is restored from this table. Keys missing here (`brand`,
 * `items`, dynamic specification names…) are already right in lowercase.
 */
const INDEXED_PRODUCT_KEYS: Record<string, string> = {
  productid: 'productId',
  productname: 'productName',
  producttitle: 'productTitle',
  productreference: 'productReference',
  productreferencecode: 'productReferenceCode',
  brandid: 'brandId',
  brandimageurl: 'brandImageUrl',
  linktext: 'linkText',
  categoryid: 'categoryId',
  categoriesids: 'categoriesIds',
  metatagdescription: 'metaTagDescription',
  releasedate: 'releaseDate',
  clusterhighlights: 'clusterHighlights',
  productclusters: 'productClusters',
  searchableclusters: 'searchableClusters',
  allspecifications: 'allSpecifications',
  allspecificationsgroups: 'allSpecificationsGroups',
  completespecifications: 'completeSpecifications',
  itemid: 'itemId',
  namecomplete: 'nameComplete',
  complementname: 'complementName',
  referenceid: 'referenceId',
  measurementunit: 'measurementUnit',
  unitmultiplier: 'unitMultiplier',
  kititems: 'kitItems',
  estimateddatearrival: 'estimatedDateArrival',
  videos: 'Videos',
  imageid: 'imageId',
  imagelabel: 'imageLabel',
  imagetag: 'imageTag',
  imageurl: 'imageUrl',
  imagetext: 'imageText',
  sellerid: 'sellerId',
  sellername: 'sellerName',
  sellerdefault: 'sellerDefault',
  addtocartlink: 'addToCartLink',
  commertialoffer: 'commertialOffer',
  fieldid: 'fieldId',
  isonproductdetails: 'isOnProductDetails',
  listprice: 'listPrice',
  pricewithoutdiscount: 'priceWithoutDiscount',
  rewardvalue: 'rewardValue',
  pricevaliduntil: 'priceValidUntil',
  availablequantity: 'availableQuantity',
  isavailable: 'isAvailable',
  discounthighlight: 'discountHighLight',
  giftskuids: 'giftSkuIds',
  interestrate: 'interestRate',
  totalvalueplusinterestrate: 'totalValuePlusInterestRate',
  numberofinstallments: 'numberOfInstallments',
  paymentsystemname: 'paymentSystemName',
  paymentsystemgroupname: 'paymentSystemGroupName',
}

/**
 * Keys that tell apart the catalog objects written in PascalCase: the
 * commercial offer, its installments, specifications and their values, and
 * reference ids.
 */
const PASCAL_CASE_MARKERS = [
  'availablequantity',
  'numberofinstallments',
  'fieldid',
  'key',
]

/**
 * Display texts GoPersonal also lowercases. Their original casing cannot be
 * recovered, so the first letter is capitalized until the index keeps it.
 */
const CAPITALIZED_FIELDS = new Set([
  'productName',
  'productTitle',
  'brand',
  'name',
  'nameComplete',
  'imageLabel',
  'Name',
  'Value',
])

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
      // Restores the casing GoPersonal drops; an already camelCased payload
      // goes through untouched.
      const product = JSON.parse(payload.vtex_product, (_key, value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return value
        }

        const keys = Object.keys(value)
        const pascalCase =
          PASCAL_CASE_MARKERS.some((marker) => keys.includes(marker)) ||
          (keys.includes('value') && keys.includes('position'))

        return Object.fromEntries(
          keys.map((key) => {
            const camelKey = INDEXED_PRODUCT_KEYS[key] ?? key
            const name =
              pascalCase && camelKey !== key
                ? camelKey.charAt(0).toUpperCase() + camelKey.slice(1)
                : pascalCase && /^[a-z]+$/.test(key)
                ? key.charAt(0).toUpperCase() + key.slice(1)
                : camelKey

            const entry = value[key]

            // A reference id's `Value` is a code, not a display text.
            if (
              typeof entry === 'string' &&
              CAPITALIZED_FIELDS.has(name) &&
              !keys.includes('key')
            ) {
              return [name, entry.charAt(0).toUpperCase() + entry.slice(1)]
            }

            if (name === 'categories' && Array.isArray(entry)) {
              return [
                name,
                entry.map((path: unknown) =>
                  typeof path === 'string'
                    ? path.replace(/\/(\p{L})/gu, (match) => match.toUpperCase())
                    : path
                ),
              ]
            }

            return [name, entry]
          })
        )
      }) as SearchProduct

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

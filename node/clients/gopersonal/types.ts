/** Filters for GoPersonal search: grouped by facet key. */
export type GoPersonalFilters = Record<string, string[]>

/** Request body for `POST /search`. */
export interface GoPersonalSearchBody {
  project_id: string
  query?: string
  /** Size of the ranked set GoPersonal computes and stores. Capped at 2000. */
  limit?: number
  /** Hits returned by this call. Capped at 100. */
  page_size?: number
  reranker?: string
  customer_id?: string
  session_id?: string
  /** Returns `product_ids` with every ranked id, not just the current page. */
  return_all_ids?: boolean
}

/** A single image entry inside a hit payload. */
export interface GoPersonalImage {
  url: string
  position?: number
}

/** A metadata entry inside a hit payload. */
export interface GoPersonalMetadata {
  key: string
  value: string
}

/** Product payload nested in each hit (GoPersonal-specific shape, NOT SearchProduct). */
export interface GoPersonalHitPayload {
  id: number | string
  sku?: number | string
  name?: string
  url?: string
  url_key?: string
  brand?: string
  brandname?: string
  category?: string
  category_ids?: number | string
  category_ids_list?: Array<number | string>
  categories?: Array<{ id: number | string }>
  price?: number
  regular_price?: number
  price_discount?: number
  price_range?: {
    minimum_price?: {
      final_price?: { currency?: string; value?: number }
    }
  }
  description?: string
  short_description?: { html?: string }
  imgs?: GoPersonalImage[]
  metadata?: GoPersonalMetadata[]
  stock?: string
  active?: number | string
  [key: string]: unknown
}

export interface GoPersonalHit {
  id: number | string
  score?: number
  rerank_score?: number
  payload: GoPersonalHitPayload
}

/** A facet entry in the root `facets` object of a search response. */
export interface GoPersonalFacet {
  display_name?: string
  values: Array<string | number>
}

/** Response shape for `POST /search`. */
export interface GoPersonalSearchResponse {
  hits: GoPersonalHit[]
  hits_count?: number
  search_id?: string
  total_results?: number
  /** Every ranked product id, in ranking order. Present when `return_all_ids`. */
  product_ids?: string[]
  page?: number
  project_id?: string
  query?: string
  facets?: Record<string, GoPersonalFacet>
  filters?: GoPersonalFilters
  is_occasion_search?: boolean
  from_cache?: boolean
}

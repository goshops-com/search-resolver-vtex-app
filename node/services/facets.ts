import {
  buildAttributePath,
  concatSelectedFacets,
  mergeSegmentParamsWithPickupFromPath,
} from '../commons/compatibility-layer'
import type { IntschFacetsParams } from '../clients/intsch/types'
import { extractSegmentData, getOrCreateSegment } from '../utils/segment'
import { applyHideUnavailableItemsDefaultForDP } from '../utils/hideUnavailableItems'
import type { FacetsInput } from '../typings/Search'
import type { FacetSettings } from './settings'
import { fetchAppSettings } from './settings'
import {
  buildFacetsFromProducts,
  filterProductsBySelectedFacets,
} from './gopersonalLocalFacets'
import { fetchGoPersonalRankedIds } from './gopersonalSearch'
import { hydrateProductsFromCatalog } from './gopersonalCatalog'
import {
  extractSpecificationFieldIds,
  fetchFilterableFieldIds,
} from './specificationFilters'
import { getGoPersonalSession } from './gopersonalSession'

type SegmentData = ReturnType<typeof extractSegmentData>

type FetchFacetsOptions = {
  args: FacetsInput
  selectedFacets: SelectedFacet[]
  shippingOptions?: string[]
}

/**
 * Fetches facets using the intsch client (Intelligent Search) v1 endpoint.
 * Unpacks the segment and sends relevant fields as query params instead of the segment header.
 */
async function fetchFacetsFromIntsch(
  ctx: Context,
  options: FetchFacetsOptions,
  segmentData: SegmentData
) {
  const { args, selectedFacets, shippingOptions } = options
  const {
    clients: { intsch },
  } = ctx

  const { selectedFacets: _omitSelectedFacetsForPath, ...facetFieldArgs } = args

  const intschArgs: IntschFacetsParams = {
    ...facetFieldArgs,
    query: args.fullText,
  }

  const finalArgs = applyHideUnavailableItemsDefaultForDP(
    intschArgs,
    segmentData.segmentParams
  )

  const allFacets = concatSelectedFacets(
    selectedFacets,
    segmentData.extraFacets
  )

  const intschPath = buildAttributePath(allFacets)

  const result: any = await intsch.facets(
    { ...finalArgs, query: args.fullText },
    intschPath,
    {
      segmentParams: mergeSegmentParamsWithPickupFromPath(
        segmentData.segmentParams,
        selectedFacets
      ),
      shippingHeader: shippingOptions,
    }
  )

  if (ctx.vtex.tenant) {
    ctx.translated = result.translated
  }

  return result
}

/**
 * Builds facets for a GoPersonal query out of the catalog itself.
 *
 * GoPersonal's own facets are not used: they only cover the fields configured
 * as facets on the project and carry no per-value counts. Ranking the whole
 * result set and hydrating it from the catalog yields brands, category trees,
 * specifications and prices with real counts, without requiring any
 * project-side configuration.
 */
async function fetchFacetsFromGoPersonal(
  ctx: Context,
  options: FetchFacetsOptions,
  settings: {
    gopersonalProjectId: string
    gopersonalLimit: number
    facets: FacetSettings
  }
) {
  const { args, selectedFacets } = options

  const { productIds } = await fetchGoPersonalRankedIds(ctx, {
    project_id: settings.gopersonalProjectId,
    query: args.fullText,
    limit: settings.gopersonalLimit,
    // Same identifiers as the product query, so both sides of a page rank the
    // same set and facet counts keep matching the grid.
    ...getGoPersonalSession(ctx),
  })

  const products = await hydrateProductsFromCatalog(ctx, productIds)

  const filterableFieldIds = await fetchFilterableFieldIds(
    ctx,
    extractSpecificationFieldIds(products)
  )

  return {
    facets: buildFacetsFromProducts(
      products,
      settings.facets,
      selectedFacets,
      filterableFieldIds
    ),
    recordsFiltered: filterProductsBySelectedFacets(
      products,
      selectedFacets,
      filterableFieldIds
    ).length,
    sampling: false,
    breadcrumb: [],
    queryArgs: {
      query: args.fullText,
      map: args.selectedFacets?.map((facet) => facet.key).join(',') ?? '',
      selectedFacets: selectedFacets ?? [],
    },
  }
}

/**
 * Facets service that extracts facets fetching logic and implements comparison or flag-based routing
 */
export async function fetchFacets(ctx: Context, options: FetchFacetsOptions) {
  const { searchEngine, gopersonalProjectId, gopersonalLimit, facets } =
    await fetchAppSettings(ctx)

  if (options.args.fullText?.trim() && searchEngine === 'gopersonal') {
    return fetchFacetsFromGoPersonal(ctx, options, {
      gopersonalProjectId,
      gopersonalLimit,
      facets,
    })
  }

  const segment = await getOrCreateSegment(ctx)

  const segmentData = extractSegmentData(segment)

  if (segment && segment.channel === null) {
    ctx.vtex.logger.warn({
      message: 'Couldnt detect a sales channel',
    })
  }

  return fetchFacetsFromIntsch(ctx, options, segmentData)
}

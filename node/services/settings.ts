import type { SearchEngine } from '../config'
import { config } from '../config'

export type FacetSettings = {
  locale: string
  brandGroupName: string
  priceGroupName: string
  categoryLevelNames: string[]
  firstOfferedCategoryDepth: number
  leadingGroupNames: string[]
  unpricedPlaceholder: number
}

type AppSettings = {
  shouldUseNewPDPEndpoint: boolean
  shouldUseNewPLPEndpoint: boolean
  searchEngine: SearchEngine
  gopersonalProjectId: string
  gopersonalLimit: number
  facets: FacetSettings
}

type StoredSettings = Partial<{
  shouldUseNewPDPEndpoint: boolean
  shouldUseNewPLPEndpoint: boolean
  gopersonalProjectId: string
  gopersonalLimit: number
  useGoPersonalSearch: boolean
  facetsLocale: string
  brandGroupName: string
  priceGroupName: string
  categoryLevelNames: string[]
  firstOfferedCategoryDepth: number
  leadingGroupNames: string[]
  unpricedPlaceholder: number
}>

const GOPERSONAL_DEFAULTS = {
  gopersonalProjectId: '',
  gopersonalLimit: config.gopersonal.limit,
}

const FORCE_NEW_PLP_HEADER = 'x-vtex-force-new-plp-endpoint'
const FORCE_NEW_PDP_HEADER = 'x-vtex-force-new-pdp-endpoint'

/** Mirrors `settingsSchema.properties.useGoPersonalSearch.default` in the
 * manifest, which is what the admin shows before anyone saves the form. */
const MANIFEST_USE_GOPERSONAL_DEFAULT = true

/** Mirror of the `default` each facet property declares in the manifest.
 * `getAppSettings` returns nothing for a property until the admin saves the
 * form, so the values the admin displays have to exist here too. */
export const FACET_DEFAULTS: FacetSettings = {
  locale: 'es',
  brandGroupName: 'Marca',
  priceGroupName: 'Precio',
  categoryLevelNames: ['Departamento', 'Categoría', 'Sub-Categoría'],
  firstOfferedCategoryDepth: 2,
  leadingGroupNames: ['Marca', 'Categoría', 'Sub-Categoría', 'Precio', 'Color'],
  unpricedPlaceholder: 9999999,
}

function nonEmpty<T>(value: T[] | undefined, fallback: T[]): T[] {
  return value?.length ? value : fallback
}

function resolveFacetSettings(settings: StoredSettings): FacetSettings {
  return {
    locale: settings.facetsLocale || FACET_DEFAULTS.locale,
    brandGroupName: settings.brandGroupName || FACET_DEFAULTS.brandGroupName,
    priceGroupName: settings.priceGroupName || FACET_DEFAULTS.priceGroupName,
    categoryLevelNames: nonEmpty(
      settings.categoryLevelNames,
      FACET_DEFAULTS.categoryLevelNames
    ),
    firstOfferedCategoryDepth:
      settings.firstOfferedCategoryDepth ??
      FACET_DEFAULTS.firstOfferedCategoryDepth,
    leadingGroupNames: nonEmpty(
      settings.leadingGroupNames,
      FACET_DEFAULTS.leadingGroupNames
    ),
    unpricedPlaceholder:
      settings.unpricedPlaceholder ?? FACET_DEFAULTS.unpricedPlaceholder,
  }
}

/**
 * Picks the engine that answers full-text queries.
 *
 * The admin checkbox is the only switch; an install that never opens the admin
 * gets the `default` the manifest declares for it. GoPersonal also needs a
 * project id, so an unconfigured install falls back to VTEX instead of
 * searching against an empty project.
 */
function resolveSearchEngine(
  useGoPersonalSearch: unknown,
  gopersonalProjectId: string
): SearchEngine {
  const wantsGoPersonal =
    typeof useGoPersonalSearch === 'boolean'
      ? useGoPersonalSearch
      : MANIFEST_USE_GOPERSONAL_DEFAULT

  return wantsGoPersonal && gopersonalProjectId ? 'gopersonal' : 'vtex'
}

export async function fetchAppSettings(ctx: Context): Promise<AppSettings> {
  const {
    clients: { apps },
  } = ctx

  const forceNewPLP = ctx.get(FORCE_NEW_PLP_HEADER) === 'true'
  const forceNewPDP = ctx.get(FORCE_NEW_PDP_HEADER) === 'true'

  const appId =
    process.env.VTEX_APP_ID ?? 'qacoolboxpe.gopersonal-search-resolver@1.x'

  try {
    const settings: StoredSettings = await apps.getAppSettings(appId)

    const gopersonalProjectId =
      settings.gopersonalProjectId ?? GOPERSONAL_DEFAULTS.gopersonalProjectId

    return {
      shouldUseNewPDPEndpoint:
        forceNewPDP || Boolean(settings.shouldUseNewPDPEndpoint),
      shouldUseNewPLPEndpoint:
        forceNewPLP || Boolean(settings.shouldUseNewPLPEndpoint),
      searchEngine: resolveSearchEngine(
        settings.useGoPersonalSearch,
        gopersonalProjectId
      ),
      gopersonalProjectId,
      gopersonalLimit: GOPERSONAL_DEFAULTS.gopersonalLimit,
      facets: resolveFacetSettings(settings),
    }
  } catch (error) {
    ctx.vtex.logger.error({
      message: 'Error fetching app settings',
      error: error.message,
    })

    return {
      shouldUseNewPDPEndpoint: forceNewPDP,
      shouldUseNewPLPEndpoint: forceNewPLP,
      searchEngine: 'vtex',
      ...GOPERSONAL_DEFAULTS,
      facets: FACET_DEFAULTS,
    }
  }
}

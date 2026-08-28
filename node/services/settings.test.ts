import { createContext } from '../mocks/contextFactory'
import { FACET_DEFAULTS, fetchAppSettings } from './settings'

describe('fetchAppSettings', () => {
  it('returns configured app settings with GoPersonal defaults', async () => {
    const ctx = createContext({
      appSettings: {
        shouldUseNewPDPEndpoint: true,
        shouldUseNewPLPEndpoint: false,
        gopersonalProjectId: 'proj-1',
      },
    })

    await expect(fetchAppSettings(ctx)).resolves.toEqual({
      shouldUseNewPDPEndpoint: true,
      shouldUseNewPLPEndpoint: false,
      searchEngine: 'gopersonal',
      gopersonalProjectId: 'proj-1',
      gopersonalLimit: 200,
      facets: FACET_DEFAULTS,
    })
  })

  it('uses VTEX when the admin unchecks GoPersonal', async () => {
    const ctx = createContext({
      appSettings: {
        useGoPersonalSearch: false,
        gopersonalProjectId: 'proj-1',
      },
    })

    await expect(fetchAppSettings(ctx)).resolves.toMatchObject({
      searchEngine: 'vtex',
    })
  })

  it('uses GoPersonal when the admin checks it', async () => {
    const ctx = createContext({
      appSettings: { useGoPersonalSearch: true, gopersonalProjectId: 'proj-1' },
    })

    await expect(fetchAppSettings(ctx)).resolves.toMatchObject({
      searchEngine: 'gopersonal',
    })
  })

  it('falls back to VTEX when GoPersonal has no project id', async () => {
    const ctx = createContext({
      appSettings: { useGoPersonalSearch: true, gopersonalProjectId: '' },
    })

    await expect(fetchAppSettings(ctx)).resolves.toMatchObject({
      searchEngine: 'vtex',
    })
  })

  it('uses the manifest default when the checkbox was never set', async () => {
    const ctx = createContext({
      appSettings: { gopersonalProjectId: 'proj-1' },
    })

    await expect(fetchAppSettings(ctx)).resolves.toMatchObject({
      searchEngine: 'gopersonal',
    })
  })

  it('forces new PDP and PLP endpoints from headers', async () => {
    const ctx = createContext({
      appSettings: {},
      headers: {
        'x-vtex-force-new-pdp-endpoint': 'true',
        'x-vtex-force-new-plp-endpoint': 'true',
      },
    })

    const settings = await fetchAppSettings(ctx)

    expect(settings.shouldUseNewPDPEndpoint).toBe(true)
    expect(settings.shouldUseNewPLPEndpoint).toBe(true)
  })

  it('falls back to safe defaults when app settings cannot be read', async () => {
    const ctx = createContext({
      headers: {
        'x-vtex-force-new-plp-endpoint': 'true',
      },
    })

    ;(ctx.clients.apps.getAppSettings as jest.Mock).mockRejectedValue(
      new Error('settings unavailable')
    )

    await expect(fetchAppSettings(ctx)).resolves.toEqual({
      shouldUseNewPDPEndpoint: false,
      shouldUseNewPLPEndpoint: true,
      searchEngine: 'vtex',
      gopersonalProjectId: '',
      gopersonalLimit: 200,
      facets: FACET_DEFAULTS,
    })
  })

  it('overrides only the facet settings the admin actually saved', async () => {
    const ctx = createContext({
      appSettings: {
        gopersonalProjectId: 'proj-1',
        brandGroupName: 'Brand',
        unpricedPlaceholder: 0,
        categoryLevelNames: [],
      },
    })

    const { facets } = await fetchAppSettings(ctx)

    expect(facets.brandGroupName).toBe('Brand')
    expect(facets.unpricedPlaceholder).toBe(0)
    // An empty array means the admin cleared the field, not that it has no
    // levels; falling through to the default keeps category facets named.
    expect(facets.categoryLevelNames).toEqual(FACET_DEFAULTS.categoryLevelNames)
    expect(facets.priceGroupName).toBe(FACET_DEFAULTS.priceGroupName)
  })
})

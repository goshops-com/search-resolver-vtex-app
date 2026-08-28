import { fetchFacets } from './facets'
import { createContext } from '../mocks/contextFactory'
import type { FacetsInput } from '../typings/Search'

describe('fetchFacets service', () => {
  const mockFacetsResponse = {
    facets: [
      {
        name: 'Category',
        values: [
          { name: 'Electronics', quantity: 10 },
          { name: 'Clothing', quantity: 5 },
        ],
      },
    ],
    translated: false,
  }

  // Facets only reach intsch on catalog navigation; a full text query is
  // answered by GoPersonal so the filters match the products it ranked.
  const mockArgs: FacetsInput = {
    query: 'electronics',
    map: 'c',
    selectedFacets: [],
    removeHiddenFacets: false,
    hideUnavailableItems: false,
    categoryTreeBehavior: 'default',
  }

  const mockSelectedFacets: SelectedFacet[] = []

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should default hideUnavailableItems=true when DP is enabled and hideUnavailableItems is undefined', async () => {
    const ctx = createContext({
      accountName: 'testaccount',
      intschSettings: {
        facets: mockFacetsResponse,
      },
      segment: {
        facets: 'deliveryZonesHash=dzHash',
      } as any,
    })

    const { hideUnavailableItems: _ignored, ...argsWithoutHide } = mockArgs as any

    await fetchFacets(ctx, {
      args: argsWithoutHide,
      selectedFacets: mockSelectedFacets,
    })

    expect(ctx.clients.intsch.facets).toHaveBeenCalledWith(
      expect.objectContaining({ hideUnavailableItems: true }),
      expect.any(String),
      expect.any(Object)
    )
  })

  it('should fetch facets via intsch and not call intelligentSearchApi', async () => {
    const ctx = createContext({
      accountName: 'testaccount',
      intschSettings: {
        facets: mockFacetsResponse,
      },
    })

    const result = await fetchFacets(ctx, {
      args: mockArgs,
      selectedFacets: mockSelectedFacets,
    })

    expect(ctx.clients.intsch.facets).toHaveBeenCalled()
    expect(ctx.clients.intelligentSearchApi.facets).not.toHaveBeenCalled()
    expect(result).toEqual(mockFacetsResponse)
  })


  it('should handle shipping options correctly', async () => {
    const ctx = createContext({
      accountName: 'testaccount',
      intschSettings: {
        facets: mockFacetsResponse,
      },
    })

    const shippingOptions = ['delivery', 'pickup']

    await fetchFacets(ctx, {
      args: mockArgs,
      selectedFacets: mockSelectedFacets,
      shippingOptions,
    })

    expect(ctx.clients.intsch.facets).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      expect.objectContaining({ shippingHeader: shippingOptions })
    )
  })

  it('builds facets from the catalog when there is a full text query', async () => {
    const ctx = createContext({
      accountName: 'testaccount',
      appSettings: { gopersonalProjectId: 'proj-1' },
      gopersonalSettings: {
        search: {
          hits: [],
          product_ids: ['1', '2'],
          total_results: 2,
          search_id: 'facets-search',
        },
      },
      catalogProducts: [
        {
          productId: '1',
          brand: 'HP',
          categories: ['/Computo/Laptops/'],
        },
        {
          productId: '2',
          brand: 'HP',
          categories: ['/Computo/Monitores/'],
        },
      ],
    })

    const result: any = await fetchFacets(ctx, {
      args: { ...mockArgs, fullText: 'laptop' },
      selectedFacets: mockSelectedFacets,
    })

    expect(ctx.clients.gopersonal.search).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'proj-1', query: 'laptop' })
    )
    expect(ctx.clients.intsch.facets).not.toHaveBeenCalled()
    expect(result.recordsFiltered).toBe(2)

    const brandFacet = result.facets.find(
      (facet: any) => facet.values[0]?.key === 'brand'
    )

    expect(brandFacet.values[0]).toMatchObject({ value: 'hp', quantity: 2 })

    expect(
      result.facets.find((facet: any) => facet.values[0]?.key === 'category-1')
    ).toBeUndefined()

    const categoryFacet = result.facets.find(
      (facet: any) => facet.values[0]?.key === 'category-2'
    )

    expect(categoryFacet.type).toBe('TEXT')
    expect(categoryFacet.values.map((v: any) => v.value).sort()).toEqual([
      'laptops',
      'monitores',
    ])
  })

  it('should set translated flag in context when tenant is present', async () => {
    const ctx = createContext({
      accountName: 'testaccount',
      intschSettings: {
        facets: { ...mockFacetsResponse, translated: true },
      },
      tenantLocale: 'en-US',
    })

    await fetchFacets(ctx, {
      args: mockArgs,
      selectedFacets: mockSelectedFacets,
    })

    expect(ctx.translated).toBe(true)
  })
})

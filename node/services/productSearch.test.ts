import { fetchProductSearch } from './productSearch'
import { createContext } from '../mocks/contextFactory'
import type { ProductSearchInput } from '../typings/Search'

describe('fetchProductSearch service', () => {
  const mockArgs: ProductSearchInput = {
    fullText: 'test query',
    query: 'test',
    map: 'ft',
    selectedFacets: [],
    orderBy: 'OrderByTopSaleDESC',
    from: 0,
    to: 10,
    fuzzy: '0',
    operator: 'and',
    productOriginVtex: false,
    simulationBehavior: 'default',
    hideUnavailableItems: false,
  }

  const mockSelectedFacets: SelectedFacet[] = []

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GoPersonal routing', () => {
    const gopersonalResponse = {
      hits: [
        {
          id: 1,
          payload: {
            id: 1,
            sku: 111,
            name: 'Product 1',
            url: 'https://store.com/product-1.html',
            url_key: 'product-1',
            price: 100,
            stock: 'si',
            active: 1,
          },
        },
      ],
      product_ids: ['1'],
      total_results: 42,
      search_id: 'search-abc',
      facets: {},
    }

    const catalogProduct = (productId: string) =>
      ({ productId, productName: `Catalog ${productId}` } as any)

    it('routes to GoPersonal search when there is a full text query', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: {
          gopersonalProjectId: 'proj-1',
        },
        gopersonalSettings: {
          search: { ...gopersonalResponse, total_results: 1 },
        },
        catalogProducts: [catalogProduct('1')],
      })

      const result = await fetchProductSearch(ctx, mockArgs, mockSelectedFacets)

      expect(ctx.clients.gopersonal.search).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'proj-1',
          query: 'test query',
          limit: 200,
          return_all_ids: true,
        })
      )
      expect(ctx.clients.intelligentSearchApi.productSearch).not.toHaveBeenCalled()
      expect(ctx.clients.intsch.productSearch).not.toHaveBeenCalled()
      expect(result.products).toHaveLength(1)
      expect(result.recordsFiltered).toBe(1)
      expect(result.searchId).toBe('search-abc')
    })

    it('hydrates ranked ids from the catalog keeping the GoPersonal ranking', async () => {
      const multiHitResponse = {
        hits: [],
        product_ids: ['3', '1', '2'],
        total_results: 3,
        search_id: 'multi',
        facets: {},
      }

      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: { gopersonalProjectId: 'proj-1' },
        gopersonalSettings: { search: multiHitResponse },
        // Deliberately in catalog order, which differs from the ranking.
        catalogProducts: [
          catalogProduct('1'),
          catalogProduct('2'),
          catalogProduct('3'),
        ],
      })

      const result = await fetchProductSearch(ctx, mockArgs, mockSelectedFacets)

      expect(ctx.clients.search.productsById).toHaveBeenCalledWith(
        ['3', '1', '2'],
        undefined,
        undefined
      )
      expect(result.products.map((p) => p.productId)).toEqual(['3', '1', '2'])
      expect(result.products[0].productName).toBe('Catalog 3')
    })

    it('drops ranked ids the catalog does not know without leaving holes', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: { gopersonalProjectId: 'proj-1' },
        gopersonalSettings: {
          search: {
            hits: [],
            product_ids: ['1', '999', '2'],
            total_results: 3,
            facets: {},
          },
        },
        catalogProducts: [catalogProduct('1'), catalogProduct('2')],
      })

      const result = await fetchProductSearch(ctx, mockArgs, mockSelectedFacets)

      expect(result.products.map((p) => p.productId)).toEqual(['1', '2'])
    })

    it('never renders a product twice when the ranking repeats an id', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: { gopersonalProjectId: 'proj-1' },
        gopersonalSettings: {
          search: {
            hits: [],
            product_ids: ['1', '2', '1', '3'],
            total_results: 4,
            search_id: 's',
          },
        },
        catalogProducts: Array.from({ length: 3 }, (_, index) =>
          catalogProduct(String(index + 1))
        ),
      })

      const result = await fetchProductSearch(
        ctx,
        { ...mockArgs, to: 199 },
        mockSelectedFacets
      )

      expect(result.products.map((product) => product.productId)).toEqual([
        '1',
        '2',
        '3',
      ])
    })

    it('routes to GoPersonal even when new PLP endpoint flag is set', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: {
          shouldUseNewPLPEndpoint: true,
          gopersonalProjectId: 'proj-1',
        },
        gopersonalSettings: { search: gopersonalResponse },
      })

      await fetchProductSearch(ctx, mockArgs, mockSelectedFacets)

      expect(ctx.clients.gopersonal.search).toHaveBeenCalled()
      expect(ctx.clients.intsch.productSearch).not.toHaveBeenCalled()
    })

    it('does NOT route to GoPersonal when the query is empty (catalog navigation)', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: {
          shouldUseNewPLPEndpoint: true,
          gopersonalProjectId: 'proj-1',
        },
        gopersonalSettings: { search: gopersonalResponse },
      })

      await fetchProductSearch(
        ctx,
        { ...mockArgs, fullText: '' },
        mockSelectedFacets
      )

      expect(ctx.clients.gopersonal.search).not.toHaveBeenCalled()
      expect(ctx.clients.intsch.productSearch).toHaveBeenCalled()
    })

    it('does NOT route to GoPersonal when the query is only whitespace', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: {
          shouldUseNewPLPEndpoint: true,
          gopersonalProjectId: 'proj-1',
        },
        gopersonalSettings: { search: gopersonalResponse },
      })

      await fetchProductSearch(
        ctx,
        { ...mockArgs, fullText: '   ' },
        mockSelectedFacets
      )

      expect(ctx.clients.gopersonal.search).not.toHaveBeenCalled()
      expect(ctx.clients.intsch.productSearch).toHaveBeenCalled()
    })

    it('preserves searchState in response', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: {
          gopersonalProjectId: 'proj-1',
        },
        gopersonalSettings: { search: gopersonalResponse },
      })

      const result = await fetchProductSearch(
        ctx,
        { ...mockArgs, searchState: 'test-search-state' },
        mockSelectedFacets
      )

      expect(result.searchState).toBe('test-search-state')
    })

    it('forwards session headers and never sends filters to GoPersonal', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: {
          gopersonalProjectId: 'proj-1',
        },
        gopersonalSettings: { search: gopersonalResponse },
        headers: {
          'x-gopersonal-customer-id': 'cust-1',
          'x-gopersonal-session-id': 'sess-1',
        },
      })

      await fetchProductSearch(ctx, mockArgs, [{ key: 'brand', value: 'Sony' }])

      const [body] = (ctx.clients.gopersonal.search as jest.Mock).mock.calls[0]

      expect(body).toEqual(
        expect.objectContaining({
          customer_id: 'cust-1',
          session_id: 'sess-1',
        })
      )
      expect(body).not.toHaveProperty('user_filters')
      expect(body).not.toHaveProperty('filters')
    })

    it('covers the whole result set with a single search call', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: { gopersonalProjectId: 'proj-1' },
        gopersonalSettings: {
          search: {
            hits: [],
            product_ids: Array.from({ length: 250 }, (_, index) =>
              String(index + 1)
            ),
            total_results: 250,
            search_id: 'search-all',
          },
        },
        catalogProducts: Array.from({ length: 250 }, (_, index) =>
          catalogProduct(String(index + 1))
        ),
      })

      const result = await fetchProductSearch(
        ctx,
        { ...mockArgs, from: 0, to: 9 },
        mockSelectedFacets
      )

      expect(ctx.clients.gopersonal.search).toHaveBeenCalledTimes(1)
      // Faceting and paging happen over every ranked product, not the page.
      expect(result.recordsFiltered).toBe(250)
      expect(result.products).toHaveLength(10)
    })

    it('applies selected facets locally keeping the GoPersonal ranking', async () => {
      const branded = (productId: string, brand: string) =>
        ({
          productId,
          productName: `Catalog ${productId}`,
          brand,
          categories: [],
        } as any)

      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: { gopersonalProjectId: 'proj-1' },
        gopersonalSettings: {
          search: {
            hits: [],
            product_ids: ['3', '1', '2'],
            total_results: 3,
            search_id: 'ranked',
          },
        },
        catalogProducts: [
          branded('1', 'Sony'),
          branded('2', 'HP'),
          branded('3', 'Sony'),
        ],
      })

      const result = await fetchProductSearch(ctx, mockArgs, [
        { key: 'ft', value: 'test query' },
        { key: 'brand', value: 'sony' },
      ])

      expect(result.products.map((p) => p.productId)).toEqual(['3', '1'])
      expect(result.recordsFiltered).toBe(2)

      // Facets describe the unfiltered set, so HP stays selectable.
      const brandFacet = (result as any).facets.find(
        (facet: any) => facet.values[0]?.key === 'brand'
      )

      expect(brandFacet.values.map((v: any) => v.value).sort()).toEqual([
        'hp',
        'sony',
      ])
      expect(
        brandFacet.values.find((v: any) => v.value === 'sony').quantity
      ).toBe(2)
      expect(
        brandFacet.values.find((v: any) => v.value === 'sony').selected
      ).toBe(true)
    })

    it('uses the default GoPersonal limit and omits empty optional fields', async () => {
      const ctx = createContext({
        accountName: 'testaccount',
        appSettings: {
          gopersonalProjectId: 'proj-2',
        },
        gopersonalSettings: { search: gopersonalResponse },
      })

      await fetchProductSearch(
        ctx,
        { ...mockArgs, orderBy: undefined },
        mockSelectedFacets
      )

      expect(ctx.clients.gopersonal.search).toHaveBeenCalledWith({
        project_id: 'proj-2',
        query: 'test query',
        limit: 200,
        page_size: 1,
        return_all_ids: true,
      })
    })
  })
})

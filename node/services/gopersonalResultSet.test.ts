import { fetchFacets } from './facets'
import {
  clearGoPersonalResultSetCache,
  fetchGoPersonalResultSet,
} from './gopersonalResultSet'
import { fetchProductSearch } from './productSearch'
import { createContext } from '../mocks/contextFactory'

const catalogProduct = (productId: string) =>
  ({ productId, productName: `Catalog ${productId}` } as any)

const pageContext = (overrides: Record<string, any> = {}) =>
  createContext({
    accountName: 'testaccount',
    appSettings: { gopersonalProjectId: 'proj-1' },
    gopersonalSettings: {
      search: { hits: [], product_ids: ['2', '1'], search_id: 's-1' },
    },
    catalogProducts: [catalogProduct('1'), catalogProduct('2')],
    ...overrides,
  })

const options = { projectId: 'proj-1', query: 'jbl', limit: 250 }

describe('fetchGoPersonalResultSet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearGoPersonalResultSetCache()
  })

  it('ranks and hydrates once for the parallel productSearch and facets queries', async () => {
    const ctx = pageContext()

    const [search, facets] = await Promise.all([
      fetchProductSearch(ctx, { fullText: 'jbl', from: 0, to: 11 }, []),
      fetchFacets(ctx, { args: { fullText: 'jbl' }, selectedFacets: [] }),
    ])

    expect(ctx.clients.gopersonal.search).toHaveBeenCalledTimes(1)
    expect(ctx.clients.search.productsById).toHaveBeenCalledTimes(1)
    expect(search.products.map((p) => p.productId)).toEqual(['2', '1'])
    expect(facets.recordsFiltered).toBe(2)
  })

  it('reuses the set for the next request of the same search', async () => {
    const ctx = pageContext()

    await fetchGoPersonalResultSet(ctx, options)
    await fetchGoPersonalResultSet(ctx, options)

    expect(ctx.clients.gopersonal.search).toHaveBeenCalledTimes(1)
  })

  it('keeps shoppers with different GoPersonal sessions apart', async () => {
    const first = pageContext({
      headers: { 'x-gopersonal-customer-id': 'customer-a' },
    })

    const second = pageContext({
      headers: { 'x-gopersonal-customer-id': 'customer-b' },
    })

    await fetchGoPersonalResultSet(first, options)
    await fetchGoPersonalResultSet(second, options)

    expect(first.clients.gopersonal.search).toHaveBeenCalledTimes(1)
    expect(second.clients.gopersonal.search).toHaveBeenCalledTimes(1)
  })

  it('does not keep an empty set, which usually means the catalog failed', async () => {
    const ctx = pageContext({ catalogProducts: [] })

    await fetchGoPersonalResultSet(ctx, options)
    await fetchGoPersonalResultSet(ctx, options)

    expect(ctx.clients.gopersonal.search).toHaveBeenCalledTimes(2)
  })

  it('ranks again once the set expires', async () => {
    const ctx = pageContext()
    const now = jest.spyOn(Date, 'now').mockReturnValue(0)

    await fetchGoPersonalResultSet(ctx, options)
    now.mockReturnValue(31 * 1000)
    await fetchGoPersonalResultSet(ctx, options)

    expect(ctx.clients.gopersonal.search).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })
})

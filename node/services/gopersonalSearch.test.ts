import { fetchGoPersonalRankedIds } from './gopersonalSearch'
import { createContext } from '../mocks/contextFactory'

const body = { project_id: 'proj-1', query: 'laptop', limit: 200 }

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => String(index + 1))

const indexedHit = (id: string) => ({
  id,
  payload: {
    id,
    vtex_product: JSON.stringify({ productId: id, productName: `Indexed ${id}` }),
  },
})

describe('fetchGoPersonalRankedIds', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('asks for every ranked id in a single call', async () => {
    const ctx = createContext({
      gopersonalSettings: {
        search: { hits: [], product_ids: ids(230), total_results: 230 },
      },
    })

    const result = await fetchGoPersonalRankedIds(ctx, body)

    expect(ctx.clients.gopersonal.search).toHaveBeenCalledTimes(1)
    expect(ctx.clients.gopersonal.search).toHaveBeenCalledWith(
      expect.objectContaining({ return_all_ids: true })
    )
    expect(result.productIds).toHaveLength(230)
  })

  it('keeps the ranking order GoPersonal returned', async () => {
    const ctx = createContext({
      gopersonalSettings: {
        search: { hits: [], product_ids: ['30', '10', '20'] },
      },
    })

    const result = await fetchGoPersonalRankedIds(ctx, body)

    expect(result.productIds).toEqual(['30', '10', '20'])
  })

  it('reads the catalog products the sync indexed as vtex_product', async () => {
    const ctx = createContext({
      gopersonalSettings: {
        search: {
          search_id: 's-1',
          product_ids: ['1', '2'],
          hits: [indexedHit('1'), indexedHit('2')],
        },
      },
    })

    const result = await fetchGoPersonalRankedIds(ctx, body)

    expect(result.indexedProducts.get('2')).toEqual({
      productId: '2',
      productName: 'Indexed 2',
    })
    expect(ctx.clients.gopersonal.search).toHaveBeenCalledWith(
      expect.objectContaining({ page_size: 250 })
    )
  })

  it('reads every indexed product from the single /search page', async () => {
    const ranked = ids(230)
    const ctx = createContext({
      gopersonalSettings: {
        search: {
          search_id: 's-1',
          product_ids: ranked,
          hits: ranked.map(indexedHit),
        },
      },
    })

    const result = await fetchGoPersonalRankedIds(ctx, body)

    expect(ctx.clients.gopersonal.search).toHaveBeenCalledTimes(1)
    expect(result.indexedProducts.size).toBe(230)
  })

  it('skips a malformed vtex_product instead of failing the search', async () => {
    const ctx = createContext({
      gopersonalSettings: {
        search: {
          search_id: 's-1',
          product_ids: ['1', '2'],
          hits: [
            { id: 1, payload: { id: 1, vtex_product: '{not json' } },
            indexedHit('2'),
          ],
        },
      },
    })

    const result = await fetchGoPersonalRankedIds(ctx, body)

    expect([...result.indexedProducts.keys()]).toEqual(['2'])
  })

  it('drops repeated ids so a product is never shown twice', async () => {
    const ctx = createContext({
      gopersonalSettings: {
        search: { hits: [], product_ids: ['1', '2', '1', '3'] },
      },
    })

    const result = await fetchGoPersonalRankedIds(ctx, body)

    expect(result.productIds).toEqual(['1', '2', '3'])
  })

  it('reports a project that answers without product_ids', async () => {
    const ctx = createContext({
      gopersonalSettings: { search: { hits: [], total_results: 10 } },
    })

    const result = await fetchGoPersonalRankedIds(ctx, body)

    expect(result.productIds).toEqual([])
    expect(ctx.vtex.logger.error).toHaveBeenCalled()
  })

  it('falls back to the id count when no total is reported', async () => {
    const ctx = createContext({
      gopersonalSettings: { search: { hits: [], product_ids: ids(7) } },
    })

    const result = await fetchGoPersonalRankedIds(ctx, body)

    expect(result.totalResults).toBe(7)
  })
})

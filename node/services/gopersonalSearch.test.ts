import { fetchGoPersonalRankedIds } from './gopersonalSearch'
import { createContext } from '../mocks/contextFactory'

const body = { project_id: 'proj-1', query: 'laptop', limit: 200 }

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => String(index + 1))

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

  it('does not pay for hit payloads it never reads', async () => {
    const ctx = createContext({
      gopersonalSettings: { search: { hits: [], product_ids: ids(5) } },
    })

    await fetchGoPersonalRankedIds(ctx, body)

    expect(ctx.clients.gopersonal.search).toHaveBeenCalledWith(
      expect.objectContaining({ page_size: 1 })
    )
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

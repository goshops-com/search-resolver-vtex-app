jest.mock('../../services/productSearch', () => ({
  fetchProductSearch: jest.fn().mockResolvedValue({ products: [] }),
}))

jest.mock('../../services/facets', () => ({
  fetchFacets: jest.fn().mockResolvedValue({ facets: [] }),
}))

jest.mock('./newURLs', () => ({
  toCompatibilityArgs: jest.fn(),
}))

import { queries } from './index'
import { fetchProductSearch } from '../../services/productSearch'
import { fetchFacets } from '../../services/facets'
import { toCompatibilityArgs } from './newURLs'
import { mockContext, resetContext } from '../../__mocks__/helpers'

const asMock = (fn: unknown) => fn as jest.Mock

// The storefront sends the brand page's `query`/`map` pair; VTEX's own
// compatibility layer is what expands it into the `b,ft` segments.
const expandsTo = (map: string) =>
  asMock(toCompatibilityArgs).mockResolvedValue({ map })

const searchCall = () => asMock(fetchProductSearch).mock.calls[0]

beforeEach(() => {
  jest.clearAllMocks()
  resetContext()
})

describe('brand facet added by VTEX routing', () => {
  test('searching a term that is also a brand does not filter by that brand', async () => {
    expandsTo('b,ft')

    await queries.productSearch(
      {},
      {
        query: 'jbl/jbl',
        map: '',
        selectedFacets: [{ key: 'b', value: 'jbl' }],
      } as any,
      mockContext as any
    )

    const [, args, selectedFacets] = searchCall()

    expect(args.fullText).toBe('jbl')
    expect(selectedFacets).toEqual([{ key: 'ft', value: 'jbl' }])
  })

  test('a brand the shopper picks on top of a search is kept', async () => {
    await queries.productSearch(
      {},
      {
        query: 'audifonos/jbl',
        map: 'ft,b',
        selectedFacets: [
          { key: 'ft', value: 'audifonos' },
          { key: 'b', value: 'jbl' },
        ],
      } as any,
      mockContext as any
    )

    const [, args, selectedFacets] = searchCall()

    expect(args.fullText).toBe('audifonos')
    expect(selectedFacets).toContainEqual({ key: 'b', value: 'jbl' })
  })

  test('a brand equal to the term is kept once the shopper picks it', async () => {
    await queries.productSearch(
      {},
      {
        query: 'jbl/jbl',
        map: 'ft,b',
        selectedFacets: [
          { key: 'ft', value: 'jbl' },
          { key: 'b', value: 'jbl' },
        ],
      } as any,
      mockContext as any
    )

    expect(searchCall()[2]).toContainEqual({ key: 'b', value: 'jbl' })
  })

  test('another brand routed alongside the term survives', async () => {
    expandsTo('b,b,ft')

    await queries.productSearch(
      {},
      {
        query: 'jbl/sony/jbl',
        map: '',
        selectedFacets: [
          { key: 'b', value: 'jbl' },
          { key: 'b', value: 'sony' },
        ],
      } as any,
      mockContext as any
    )

    expect(searchCall()[2]).toEqual([
      { key: 'b', value: 'sony' },
      { key: 'ft', value: 'jbl' },
    ])
  })

  test('category navigation keeps every facet', async () => {
    await queries.productSearch(
      {},
      {
        selectedFacets: [
          { key: 'category-1', value: 'audio' },
          { key: 'brandId', value: '2000045' },
        ],
      } as any,
      mockContext as any
    )

    expect(searchCall()[2]).toEqual([
      { key: 'category-1', value: 'audio' },
      { key: 'brandId', value: '2000045' },
    ])
  })

  test('the facets query drops the same routed brand', async () => {
    expandsTo('b,ft')

    await queries.facets(
      {},
      {
        query: 'jbl/jbl',
        map: '',
        selectedFacets: [{ key: 'b', value: 'jbl' }],
      } as any,
      mockContext as any
    )

    const [, options] = asMock(fetchFacets).mock.calls[0]

    expect(options.args.fullText).toBe('jbl')
    expect(options.selectedFacets).toEqual([{ key: 'ft', value: 'jbl' }])
  })
})

describe('brand page routed without a search term', () => {
  test('a bare brand page searches the brand as text', async () => {
    await queries.productSearch(
      {},
      {
        query: 'jbl',
        map: 'b',
        selectedFacets: [{ key: 'b', value: 'jbl' }],
      } as any,
      mockContext as any
    )

    const [, args, selectedFacets] = searchCall()

    expect(args.fullText).toBe('jbl')
    expect(selectedFacets).toEqual([{ key: 'ft', value: 'jbl' }])
  })

  test('the same page spelled with the `brand` alias behaves alike', async () => {
    await queries.productSearch(
      {},
      {
        query: 'jbl',
        map: 'brand',
        selectedFacets: [{ key: 'brand', value: 'jbl' }],
      } as any,
      mockContext as any
    )

    const [, args, selectedFacets] = searchCall()

    expect(args.fullText).toBe('jbl')
    expect(selectedFacets).toEqual([{ key: 'ft', value: 'jbl' }])
  })

  test('a category page filtered by the `brand` alias keeps navigating', async () => {
    await queries.productSearch(
      {},
      {
        query: 'parlantes/jbl',
        map: 'category-2,brand',
        selectedFacets: [
          { key: 'category-2', value: 'parlantes' },
          { key: 'brand', value: 'jbl' },
        ],
      } as any,
      mockContext as any
    )

    const [, args, selectedFacets] = searchCall()

    expect(args.fullText).toBeUndefined()
    expect(selectedFacets).toEqual([
      { key: 'category-2', value: 'parlantes' },
      { key: 'brand', value: 'jbl' },
    ])
  })

  test('the facets query follows the same rule', async () => {
    await queries.facets(
      {},
      {
        query: 'jbl',
        map: 'b',
        selectedFacets: [{ key: 'b', value: 'jbl' }],
      } as any,
      mockContext as any
    )

    const [, options] = asMock(fetchFacets).mock.calls[0]

    expect(options.args.fullText).toBe('jbl')
    expect(options.selectedFacets).toEqual([{ key: 'ft', value: 'jbl' }])
  })

  test('a brand chosen inside a brand page is kept', async () => {
    await queries.productSearch(
      {},
      {
        query: 'jbl/sony',
        map: 'b,b',
        selectedFacets: [
          { key: 'b', value: 'jbl' },
          { key: 'b', value: 'sony' },
        ],
      } as any,
      mockContext as any
    )

    const [, args, selectedFacets] = searchCall()

    expect(args.fullText).toBe('jbl')
    expect(selectedFacets).toEqual([
      { key: 'b', value: 'sony' },
      { key: 'ft', value: 'jbl' },
    ])
  })

  test('a category page filtered by brand keeps navigating', async () => {
    await queries.productSearch(
      {},
      {
        query: 'audio/jbl',
        map: 'c,b',
        selectedFacets: [
          { key: 'c', value: 'audio' },
          { key: 'b', value: 'jbl' },
        ],
      } as any,
      mockContext as any
    )

    const [, args, selectedFacets] = searchCall()

    expect(args.fullText).toBeUndefined()
    expect(selectedFacets).toEqual([
      { key: 'c', value: 'audio' },
      { key: 'b', value: 'jbl' },
    ])
  })

  test.each(['productClusterIds', 'brandId', 'collection'])(
    'a curated shelf keyed by %s is left alone',
    async (key) => {
      await queries.productSearch(
        {},
        {
          query: 'jbl/1382',
          map: `b,${key}`,
          selectedFacets: [
            { key: 'b', value: 'jbl' },
            { key, value: '1382' },
          ],
        } as any,
        mockContext as any
      )

      const [, args, selectedFacets] = searchCall()

      expect(args.fullText).toBeUndefined()
      expect(selectedFacets).toEqual([
        { key: 'b', value: 'jbl' },
        { key, value: '1382' },
      ])
    }
  )

  test('a shelf sent only as selectedFacets is left alone', async () => {
    await queries.productSearch(
      {},
      {
        selectedFacets: [
          { key: 'productClusterIds', value: '1382' },
          { key: 'brandId', value: '2000045' },
        ],
      } as any,
      mockContext as any
    )

    const [, args, selectedFacets] = searchCall()

    expect(args.fullText).toBeUndefined()
    expect(selectedFacets).toEqual([
      { key: 'productClusterIds', value: '1382' },
      { key: 'brandId', value: '2000045' },
    ])
  })
})

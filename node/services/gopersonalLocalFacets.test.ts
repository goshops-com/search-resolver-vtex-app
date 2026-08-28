import type { SelectedFacet } from '../typings/Search'
import {
  buildFacetsFromProducts,
  filterProductsBySelectedFacets,
} from './gopersonalLocalFacets'
import { FACET_DEFAULTS } from './settings'

const buildFacets = (
  products: SearchProduct[],
  selectedFacets: SelectedFacet[] = [],
  filterableFieldIds?: Set<string>
) =>
  buildFacetsFromProducts(
    products,
    FACET_DEFAULTS,
    selectedFacets,
    filterableFieldIds
  )

const product = (overrides: Partial<SearchProduct>): SearchProduct =>
  ({
    productId: '1',
    brand: 'HP',
    categories: ['/Computo/Laptops/'],
    items: [{ sellers: [{ commertialOffer: { Price: 100 } }] }],
    ...overrides,
  } as any)

const findByKey = (facets: Facet[], key: string) =>
  facets.find((facet) => (facet.values[0] as any)?.key === key) as any

const spec = (fieldId: string, name: string, values: string[]) => ({
  FieldId: fieldId,
  Name: name,
  Position: 1,
  IsOnProductDetails: true,
  Values: values.map((Value, index) => ({ Id: String(index), Position: index, Value })),
})

describe('buildFacetsFromProducts', () => {
  it('counts every product behind each value', () => {
    const facets = buildFacets([
      product({ productId: '1', brand: 'HP' }),
      product({ productId: '2', brand: 'HP' }),
      product({ productId: '3', brand: 'Dell' }),
    ])

    const brand = findByKey(facets, 'brand')!

    expect(brand.values.map((v: any) => v.value)).toEqual(['hp', 'dell'])
    expect(brand.values[0].quantity).toBe(2)
    expect(brand.values[1].quantity).toBe(1)
  })

  it('splits category paths into one facet per depth', () => {
    const facets = buildFacets([
      product({ categories: ['/Computo/Laptops/Gamer/'] }),
    ])

    // CATEGORYTREE would collapse the three depths into one generically
    // labelled filter on the storefront.
    expect(findByKey(facets, 'category-2')!.type).toBe('TEXT')
    expect((findByKey(facets, 'category-2')!.values[0] as any).value).toBe(
      'laptops'
    )
    expect((findByKey(facets, 'category-3')!.values[0] as any).value).toBe(
      'gamer'
    )
  })

  it('leaves out the top category level, which narrows nothing down', () => {
    const facets = buildFacets([
      product({ categories: ['/Computo/Laptops/'] }),
    ])

    expect(findByKey(facets, 'category-1')).toBeUndefined()
    expect(findByKey(facets, 'category-2')).toBeDefined()
  })

  it('counts a product once when the catalog repeats its category tree', () => {
    // The catalog returns one entry per depth for the same tree.
    const facets = buildFacets([
      product({
        categories: [
          '/Audio/Audifonos/Bluetooth On Ear/',
          '/Audio/Audifonos/',
          '/Audio/',
        ],
      }),
    ])

    expect(findByKey(facets, 'category-2').values[0].quantity).toBe(1)
    expect(findByKey(facets, 'category-3').values[0].quantity).toBe(1)
  })

  it('names category groups by depth rather than by the first value seen', () => {
    const facets = buildFacets([
      product({ categories: ['/Audio/Audifonos/Bluetooth/'] }),
    ])

    expect(findByKey(facets, 'category-2').name).toBe('Categoría')
    expect(findByKey(facets, 'category-3').name).toBe('Sub-Categoría')
  })

  it('turns specifications into facets', () => {
    const facets = buildFacets([
      product({
        completeSpecifications: [
          spec('1437', 'Color', ['Negro']),
          spec('268', 'Garantía', ['1 año']),
        ],
      } as any),
    ])

    const color = findByKey(facets, 'color')

    expect(color.name).toBe('Color')
    expect(color.values[0].value).toBe('negro')
    expect(findByKey(facets, 'garantia').values[0].value).toBe('1-ano')
  })

  it('ignores specifications that carry no values', () => {
    const facets = buildFacets([
      product({ completeSpecifications: [spec('1437', 'Color', [])] } as any),
    ])

    expect(findByKey(facets, 'color')).toBeUndefined()
  })

  it('keeps only the specifications the catalog marks as filterable', () => {
    const facets = buildFacets(
      [
        product({
          completeSpecifications: [
            spec('1437', 'Color', ['Negro']),
            spec('2473', 'Bullets', ['1']),
          ],
        } as any),
      ],
      [],
      new Set(['1437'])
    )

    expect(findByKey(facets, 'color')).toBeDefined()
    expect(findByKey(facets, 'bullets')).toBeUndefined()
  })

  it('tells apart same-named specifications by field id', () => {
    // Several unrelated fields share a name and only some are filterable.
    const facets = buildFacets(
      [
        product({
          completeSpecifications: [spec('263', 'Marca', ['Acme'])],
        } as any),
      ],
      [],
      new Set(['598'])
    )

    // Only the brand facet, never the specification named "Marca".
    expect(findByKey(facets, 'brand')).toBeDefined()
    expect(findByKey(facets, 'marca')).toBeUndefined()
  })

  it('drops specifications that duplicate a group the product field owns', () => {
    // A filterable "Marca" specification would otherwise show up as a second
    // filter under the same title as the brand one.
    const facets = buildFacets(
      [
        product({
          brand: 'HP',
          categories: [],
          completeSpecifications: [
            spec('263', 'Marca', ['Acme']),
            spec('999', 'Categoría', ['Laptops']),
          ],
        } as any),
      ],
      [],
      new Set(['263', '999'])
    )

    expect(facets.filter((facet) => facet.name === 'Marca')).toHaveLength(1)
    expect(findByKey(facets, 'brand').values[0].value).toBe('hp')
    expect(findByKey(facets, 'categoria')).toBeUndefined()
  })

  it('exposes the price span as a range facet', () => {
    const priced = (price: number) =>
      product({ items: [{ sellers: [{ commertialOffer: { Price: price } }] }] as any })

    const facets = buildFacets([priced(19.9), priced(250.5)])
    const price = facets.find(
      (facet) => (facet as any).type === 'PRICERANGE'
    ) as any

    expect((price.values[0] as any).value).toBe('19 TO 251')
    // search-result dereferences range.from/range.to without guarding
    expect((price.values[0] as any).range).toEqual({ from: 19, to: 251 })
  })

  it('leaves unpriced products out of the price span', () => {
    const priced = (price: number) =>
      product({ items: [{ sellers: [{ commertialOffer: { Price: price } }] }] as any })

    // The catalog prices products that were never given one at 9999999, which
    // would otherwise stretch the slider to seven digits.
    const facets = buildFacets([priced(50), priced(9999999)])
    const price = facets.find(
      (facet) => (facet as any).type === 'PRICERANGE'
    ) as any

    expect(price.values[0].range).toEqual({ from: 50, to: 50 })
  })

  it('omits the price facet when no product carries a real price', () => {
    const facets = buildFacets([
      product({ items: [{ sellers: [{ commertialOffer: { Price: 9999999 } }] }] as any }),
    ])

    expect(facets.find((facet) => (facet as any).type === 'PRICERANGE')).toBeUndefined()
  })

  it('leads with the groups production shows first', () => {
    const facets = buildFacets(
      [
        product({
          brand: 'HP',
          categories: ['/Computo/Laptops/Gamer/'],
          completeSpecifications: [
            spec('1', 'Zoom óptico', ['10x']),
            spec('2', 'Color', ['Negro']),
            spec('3', 'Bluetooth', ['Sí']),
          ],
        } as any),
      ],
      [],
      new Set(['1', '2', '3'])
    )

    expect(facets.map((facet) => facet.name)).toEqual([
      'Marca',
      'Categoría',
      'Sub-Categoría',
      'Precio',
      'Color',
      'Bluetooth',
      'Zoom óptico',
    ])
  })

  it('marks selected values without dropping the unselected ones', () => {
    const facets = buildFacets(
      [product({ productId: '1', brand: 'HP' }), product({ productId: '2', brand: 'Dell' })],
      [{ key: 'brand', value: 'hp' }]
    )

    const brand = findByKey(facets, 'brand')!

    expect(brand.values).toHaveLength(2)
    expect((brand.values.find((v: any) => v.value === 'hp') as any).selected).toBe(true)
    expect((brand.values.find((v: any) => v.value === 'dell') as any).selected).toBe(false)
  })
})

describe('filterProductsBySelectedFacets', () => {
  const hp = product({ productId: '1', brand: 'HP' })
  const dell = product({ productId: '2', brand: 'Dell' })
  const acer = product({ productId: '3', brand: 'Acer' })

  it('returns everything when nothing is selected', () => {
    expect(filterProductsBySelectedFacets([hp, dell], [])).toEqual([hp, dell])
  })

  it('ignores the ft facet, which carries the search term', () => {
    expect(
      filterProductsBySelectedFacets([hp, dell], [{ key: 'ft', value: 'laptop' }])
    ).toEqual([hp, dell])
  })

  it('preserves the incoming ranking', () => {
    const result = filterProductsBySelectedFacets(
      [acer, hp, dell],
      [{ key: 'brand', value: 'hp' }, { key: 'brand', value: 'acer' }]
    )

    expect(result.map((p) => p.productId)).toEqual(['3', '1'])
  })

  it('ORs values of one facet and ANDs different facets', () => {
    const result = filterProductsBySelectedFacets(
      [hp, dell],
      [
        { key: 'brand', value: 'hp' },
        { key: 'category-2', value: 'monitores' },
      ]
    )

    expect(result).toEqual([])
  })

  it('filters by price range', () => {
    const cheap = product({
      productId: '10',
      items: [{ sellers: [{ commertialOffer: { Price: 50 } }] }] as any,
    })

    const pricey = product({
      productId: '11',
      items: [{ sellers: [{ commertialOffer: { Price: 500 } }] }] as any,
    })

    const result = filterProductsBySelectedFacets(
      [cheap, pricey],
      [{ key: 'priceRange', value: '0 TO 100' }]
    )

    expect(result.map((p) => p.productId)).toEqual(['10'])
  })

  it('only filters by specifications that are offered as facets', () => {
    const black = product({
      productId: '30',
      completeSpecifications: [spec('1437', 'Color', ['Negro'])],
    } as any)

    expect(
      filterProductsBySelectedFacets(
        [black],
        [{ key: 'color', value: 'negro' }],
        new Set(['1437'])
      )
    ).toEqual([black])

    expect(
      filterProductsBySelectedFacets(
        [black],
        [{ key: 'color', value: 'negro' }],
        new Set()
      )
    ).toEqual([])
  })

  it('matches category values regardless of accents or casing', () => {
    const accented = product({
      productId: '20',
      categories: ['/Computo/Componentes de Cómputo/'],
    })

    const result = filterProductsBySelectedFacets(
      [accented],
      [{ key: 'category-2', value: 'componentes-de-computo' }]
    )

    expect(result.map((p) => p.productId)).toEqual(['20'])
  })
})

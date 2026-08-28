import { searchSlugify } from '../utils/slug'
import type { SelectedFacet } from '../typings/Search'
import type { FacetSettings } from './settings'

const CATEGORY_KEY_PREFIX = 'category-'
const BRAND_KEY = 'brand'
const PRICE_KEY = 'priceRange'
const PRICE_RANGE_SEPARATOR = ' TO '

type FacetValueAccumulator = {
  name: string
  value: string
  quantity: number
}

type FacetAccumulator = {
  name: string
  key: string
  type: string
  values: Map<string, FacetValueAccumulator>
}

type ProductSpecification = {
  name: string
  values: string[]
}

/**
 * Reads a product's specifications.
 *
 * `completeSpecifications` is used rather than the `allSpecifications` name
 * list because it carries the `FieldId`, which is what tells apart the several
 * unrelated fields sharing a name (five different "Marca", eleven "Color") and
 * is the only way to look up whether a field is filterable.
 */
function getSpecifications(
  product: SearchProduct,
  filterableFieldIds?: Set<string>
): ProductSpecification[] {
  const specifications = product.completeSpecifications ?? []

  return specifications.reduce<ProductSpecification[]>((acc, specification) => {
    const fieldId = String(specification.FieldId)

    if (filterableFieldIds && !filterableFieldIds.has(fieldId)) {
      return acc
    }

    const values = (specification.Values ?? [])
      .map((value) => value.Value)
      .filter(Boolean)

    if (values.length > 0) {
      acc.push({ name: specification.Name, values })
    }

    return acc
  }, [])
}

function getProductPrice(product: SearchProduct): number | undefined {
  const offer = product.items?.[0]?.sellers?.[0]?.commertialOffer

  return offer?.Price
}

/**
 * `unpricedPlaceholder` is the price the catalog stores for products that were
 * never actually priced. They come back flagged as available, so nothing else
 * tells them apart, and a single one reaching the result set stretches the
 * slider to seven digits.
 */
function isRealPrice(
  price: number | undefined,
  unpricedPlaceholder: number
): price is number {
  return typeof price === 'number' && price > 0 && price !== unpricedPlaceholder
}

type FacetEntry = {
  key: string
  groupName: string
  type: string
  valueName: string
}

/**
 * Group names owned by a product field rather than by a specification.
 *
 * Several specifications are also called "Marca", but they hold a partial,
 * unnormalized copy of what `product.brand` already carries, so they would
 * surface as a second, poorer filter under the very same title.
 */
function nativeGroupNames(settings: FacetSettings): Set<string> {
  return new Set(
    [settings.brandGroupName, ...settings.categoryLevelNames].map((name) =>
      name.toLowerCase()
    )
  )
}

function categoryGroupName(depth: number, levelNames: string[]): string {
  return levelNames[depth - 1] ?? `${levelNames[2]} ${depth}`
}

/**
 * Lists the facet values a single product contributes.
 *
 * The catalog repeats a product's category tree as one entry per depth
 * (`/Audio/Audifonos/On Ear/`, `/Audio/Audifonos/`, `/Audio/`), so the same
 * value is reached several times; callers deduplicate before counting.
 */
function collectProductEntries(
  product: SearchProduct,
  settings: FacetSettings,
  filterableFieldIds?: Set<string>
): FacetEntry[] {
  const entries: FacetEntry[] = []
  const nativeNames = nativeGroupNames(settings)

  if (product.brand) {
    entries.push({
      key: BRAND_KEY,
      groupName: settings.brandGroupName,
      type: 'TEXT',
      valueName: product.brand,
    })
  }

  product.categories?.forEach((path) => {
    path
      .split('/')
      .filter(Boolean)
      .forEach((segment, index) => {
        const depth = index + 1

        if (depth < settings.firstOfferedCategoryDepth) {
          return
        }

        entries.push({
          key: `${CATEGORY_KEY_PREFIX}${depth}`,
          groupName: categoryGroupName(depth, settings.categoryLevelNames),
          // Each depth is its own group here, whereas `CATEGORYTREE` makes
          // search-result collapse them all into a single nested filter
          // labelled with the generic `search.filter.title.categories`
          // message, losing the per-level names.
          type: 'TEXT',
          valueName: segment,
        })
      })
  })

  getSpecifications(product, filterableFieldIds).forEach((specification) => {
    if (nativeNames.has(specification.name.toLowerCase())) {
      return
    }

    specification.values.forEach((value) =>
      entries.push({
        key: searchSlugify(specification.name),
        groupName: specification.name,
        type: 'TEXT',
        valueName: value,
      })
    )
  })

  return entries
}

/**
 * Builds the facet list from the hydrated catalog products themselves.
 *
 * Every product backing the search is available here, so counts describe the
 * whole result set rather than the page being rendered.
 */
export function buildFacetsFromProducts(
  products: SearchProduct[],
  settings: FacetSettings,
  selectedFacets: SelectedFacet[] = [],
  filterableFieldIds?: Set<string>
): Facet[] {
  const facets = new Map<string, FacetAccumulator>()

  products.forEach((product) => {
    const seen = new Set<string>()

    collectProductEntries(product, settings, filterableFieldIds).forEach(
      (entry) => {
        if (!entry.valueName) {
          return
        }

        const value = searchSlugify(entry.valueName)
        const seenKey = `${entry.key}:${value}`

        // A product counts once per value, however many paths reach it.
        if (seen.has(seenKey)) {
          return
        }

        seen.add(seenKey)

        let facet = facets.get(entry.key)

        if (!facet) {
          facet = {
            name: entry.groupName,
            key: entry.key,
            type: entry.type,
            values: new Map(),
          }
          facets.set(entry.key, facet)
        }

        const existing = facet.values.get(value)

        if (existing) {
          existing.quantity += 1

          return
        }

        facet.values.set(value, { name: entry.valueName, value, quantity: 1 })
      }
    )
  })

  const selectedByKey = selectedFacets.reduce((acc, { key, value }) => {
    ;(acc[key] ??= new Set()).add(value)

    return acc
  }, {} as Record<string, Set<string>>)

  const result = Array.from(facets.values()).map((facet) => {
    const selectedValues = selectedByKey[facet.key]

    const values = Array.from(facet.values.values())
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
      .map(({ name, value, quantity }) => ({
        Quantity: quantity,
        Name: name,
        Link: '',
        LinkEncoded: '',
        Map: facet.key,
        Value: value,
        key: facet.key,
        name,
        value,
        quantity,
        selected: selectedValues ? selectedValues.has(value) : false,
      }))

    return {
      name: facet.name,
      values,
      type: facet.type,
      quantity: values.length,
    } as Facet
  })

  const priceFacet = buildPriceFacet(
    products,
    settings,
    selectedByKey[PRICE_KEY]
  )

  const all = priceFacet ? [...result, priceFacet] : result

  return sortFacetGroups(all, settings)
}

/**
 * The `leadingGroupNames` setting lists the groups shown first, in that order;
 * the rest follow alphabetically, as production does.
 *
 * The two category levels are kept adjacent, which production does not do: it
 * sorts every group by name, leaving "Categoría" and "Sub-Categoría" pages
 * apart from each other in the sidebar.
 */
function sortFacetGroups(facets: Facet[], settings: FacetSettings): Facet[] {
  const { leadingGroupNames } = settings

  const rank = (facet: Facet) => {
    const index = leadingGroupNames.indexOf(facet.name)

    return index === -1 ? leadingGroupNames.length : index
  }

  return [...facets].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, settings.locale)
  )
}

function buildPriceFacet(
  products: SearchProduct[],
  settings: FacetSettings,
  selectedValues?: Set<string>
): Facet | undefined {
  const prices = products
    .map(getProductPrice)
    .filter((price): price is number =>
      isRealPrice(price, settings.unpricedPlaceholder)
    )

  if (prices.length === 0) {
    return undefined
  }

  const min = Math.floor(Math.min(...prices))
  const max = Math.ceil(Math.max(...prices))
  const value = `${min}${PRICE_RANGE_SEPARATOR}${max}`

  const values = [
    {
      Quantity: prices.length,
      Name: value,
      Link: '',
      LinkEncoded: '',
      Map: PRICE_KEY,
      Value: value,
      key: PRICE_KEY,
      name: value,
      value,
      quantity: prices.length,
      selected: selectedValues ? selectedValues.has(value) : false,
      // search-result reads `range.from`/`range.to` unguarded to build the
      // slider slug, so a PRICERANGE facet without it breaks the whole page.
      range: { from: min, to: max },
    },
  ]

  return {
    name: settings.priceGroupName,
    type: 'PRICERANGE',
    quantity: 1,
    values,
  } as Facet
}

function matchesPriceRange(product: SearchProduct, values: string[]): boolean {
  const price = getProductPrice(product)

  if (typeof price !== 'number') {
    return false
  }

  return values.some((range) => {
    const [rawMin, rawMax] = range.split(PRICE_RANGE_SEPARATOR)
    const min = Number(rawMin)
    const max = Number(rawMax)

    if (Number.isNaN(min) || Number.isNaN(max)) {
      return false
    }

    return price >= min && price <= max
  })
}

function productValuesForKey(
  product: SearchProduct,
  key: string,
  filterableFieldIds?: Set<string>
): string[] {
  if (key === BRAND_KEY) {
    return product.brand ? [searchSlugify(product.brand)] : []
  }

  if (key.startsWith(CATEGORY_KEY_PREFIX)) {
    const depth = Number(key.slice(CATEGORY_KEY_PREFIX.length))

    if (Number.isNaN(depth) || depth < 1) {
      return []
    }

    return (product.categories ?? []).reduce<string[]>((acc, path) => {
      const segment = path.split('/').filter(Boolean)[depth - 1]

      if (segment) {
        acc.push(searchSlugify(segment))
      }

      return acc
    }, [])
  }

  return getSpecifications(product, filterableFieldIds).reduce<string[]>(
    (acc, specification) => {
      if (searchSlugify(specification.name) === key) {
        specification.values.forEach((value) => acc.push(searchSlugify(value)))
      }

      return acc
    },
    []
  )
}

/**
 * Filters the ranked products in place of GoPersonal.
 *
 * Values of the same facet are OR'd and different facets are AND'd, matching
 * how the storefront presents them. Order is never touched, so the semantic
 * ranking survives filtering.
 */
export function filterProductsBySelectedFacets(
  products: SearchProduct[],
  selectedFacets: SelectedFacet[] = [],
  filterableFieldIds?: Set<string>
): SearchProduct[] {
  const filters = selectedFacets.reduce((acc, { key, value }) => {
    if (key !== 'ft') {
      ;(acc[key] ??= []).push(value)
    }

    return acc
  }, {} as Record<string, string[]>)

  const keys = Object.keys(filters)

  if (keys.length === 0) {
    return products
  }

  return products.filter((product) =>
    keys.every((key) => {
      const values = filters[key]

      if (key === PRICE_KEY) {
        return matchesPriceRange(product, values)
      }

      const productValues = productValuesForKey(
        product,
        key,
        filterableFieldIds
      )

      return values.some((value) => productValues.includes(searchSlugify(value)))
    })
  )
}

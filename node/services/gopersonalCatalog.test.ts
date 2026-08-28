import { hydrateProductsFromCatalog } from './gopersonalCatalog'
import { createContext } from '../mocks/contextFactory'

const catalogProduct = (productId: string, linkText: string) => ({
  productId,
  linkText,
  // The catalog proxy answers with links pointing at the portal host.
  link: `https://portal.vtexcommercestable.com.br/${linkText}/p`,
  items: [
    {
      itemId: `sku-${productId}`,
      sellers: [
        {
          sellerId: '1',
          addToCartLink: `https://portal.vtexcommercestable.com.br/checkout/cart/add?sku=${productId}`,
          commertialOffer: { Price: 100 },
        },
      ],
    },
  ],
})

describe('hydrateProductsFromCatalog', () => {
  it('rewrites portal links the storefront cannot follow', async () => {
    const ctx = createContext({
      catalogProducts: [catalogProduct('1', 'a-phone')],
    })

    const [product] = await hydrateProductsFromCatalog(ctx, ['1'])

    expect(product.link).toBe('/a-phone/p')
    expect(product.items[0].sellers[0].addToCartLink).toBe('')
  })

  it('leaves the hydrated product untouched in the client response', async () => {
    const cached = catalogProduct('1', 'a-phone')
    const ctx = createContext({ catalogProducts: [cached] })

    await hydrateProductsFromCatalog(ctx, ['1'])

    // The client caches its responses, so rewriting in place would hand the
    // next request a product already stripped of its links.
    expect(cached.link).toBe('https://portal.vtexcommercestable.com.br/a-phone/p')
    expect(cached.items[0].sellers[0].addToCartLink).not.toBe('')
  })

  it('keeps the ranking GoPersonal returned', async () => {
    const ctx = createContext({
      catalogProducts: [
        catalogProduct('1', 'first'),
        catalogProduct('2', 'second'),
        catalogProduct('3', 'third'),
      ],
    })

    const products = await hydrateProductsFromCatalog(ctx, ['3', '1', '2'])

    expect(products.map((product) => product.productId)).toEqual(['3', '1', '2'])
  })
})

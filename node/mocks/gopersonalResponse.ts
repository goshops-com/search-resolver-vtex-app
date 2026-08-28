import type { GoPersonalSearchResponse } from '../clients/gopersonal/types'

/** Trimmed fixture based on a real `/search` response (bookshop.com.uy project). */
export const gopersonalSearchResponseMock: GoPersonalSearchResponse = {
  query: 'la huida',
  project_id: '6a11ac43f6556bfa722e2262',
  hits_count: 1,
  total_results: 150,
  page: 1,
  search_id: 'abc123-uuid',
  is_occasion_search: false,
  from_cache: false,
  filters: { category: ['37'] },
  facets: {
    brand: {
      display_name: 'Marca',
      values: ['penguin random house', 'planeta'],
    },
    category: {
      display_name: 'Categoría',
      values: ['novela romántica'],
    },
  },
  hits: [
    {
      id: 18779,
      score: 0.9,
      rerank_score: 0.95,
      payload: {
        id: 18779,
        sku: 9788491295242,
        name: 'la huída',
        url: 'https://www.bookshop.com.uy/la-huida.html',
        url_key: 'la-huida',
        brand: 'penguin random house',
        category: 'novela romántica',
        category_ids: 37,
        category_ids_list: [37],
        categories: [{ id: 37 }],
        price: 890,
        regular_price: 890,
        price_discount: 586.5,
        price_range: {
          minimum_price: { final_price: { currency: 'UYU', value: 890 } },
        },
        description: 'Una novela romántica.',
        short_description: { html: '<p>Una novela romántica.</p>' },
        imgs: [{ url: 'https://img.bookshop.com.uy/la-huida.jpg', position: 0 }],
        metadata: [
          { key: 'autor', value: 'Autora Ejemplo' },
          { key: 'editorial', value: 'Penguin' },
          { key: 'apiResponse', value: '{"raw":"ignored"}' },
        ],
        stock: 'si',
        active: 1,
      },
    },
  ],
}

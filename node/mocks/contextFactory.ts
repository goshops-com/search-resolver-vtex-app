import parse from 'co-body'

import type { IntelligentSearchClientArgs } from './intsch'
import { MockedIntschClient } from './intsch'
import type { SegmentData } from '../typings/Search'

export function createContext<Ctx = Context>({
  accountName,
  intelligentSearchApiSettings,
  intschSettings,
  gopersonalSettings,
  catalogProducts,
  specificationFields,
  headers,
  cookies,
  body,
  req,
  query,
  production,
  appSettings,
  segment,
  tenantLocale,
  vtexLocale,
}: {
  production?: boolean
  appSettings?: Record<string, any>
  intschSettings?: IntelligentSearchClientArgs
  intelligentSearchApiSettings?: IntelligentSearchClientArgs
  gopersonalSettings?: {
    search?: any
  }
  catalogProducts?: any[]
  specificationFields?: Record<string, Partial<SpecificationField>>
  headers?: Record<string, string>
  req?: {
    body?: any
  }
  query?: Record<string, unknown>
  body?: any
  cookies?: Record<string, string>
  accountName?: string
  segment?: SegmentData
  tenantLocale?: string
  vtexLocale?: string
}) {
  if (req?.body instanceof Error) {
    jest.spyOn(parse, 'json').mockRejectedValue(req.body)
  } else {
    jest.spyOn(parse, 'json').mockReturnValue(req?.body ?? {})
  }

  return {
    req: {},
    body: body ?? {},
    cookies: {
      get: jest.fn().mockImplementation((key: string) => cookies?.[key]),
    },
    get: jest.fn().mockImplementation((key: string) => {
      if (headers && key in headers) {
        return headers[key]
      }

      return key.toLowerCase() === 'host' ? 'localhost' : undefined
    }),
    response: {
      set: jest.fn(),
    },
    clients: {
      intsch: new MockedIntschClient(intschSettings),
      intelligentSearchApi: new MockedIntschClient(
        intelligentSearchApiSettings
      ),
      gopersonal: {
        search: jest
          .fn()
          .mockResolvedValue(
            gopersonalSettings?.search ?? { hits: [], product_ids: [] }
          ),
      },
      search: {
        // Mirrors the catalog: answers only the ids it knows, in its own order.
        productsById: jest.fn().mockImplementation((ids: string[]) =>
          Promise.resolve(
            (catalogProducts ?? []).filter((product) =>
              ids.includes(String(product.productId))
            )
          )
        ),
        specificationField: jest.fn().mockImplementation((fieldId: string) =>
          Promise.resolve(
            specificationFields?.[fieldId] ?? {
              Name: `spec-${fieldId}`,
              FieldId: Number(fieldId),
              IsActive: true,
              IsFilter: true,
            }
          )
        ),
      },
      apps: {
        getAppSettings: jest.fn().mockReturnValue(appSettings ?? {}),
      },
      vbase: {
        getJSON: jest.fn().mockResolvedValue({}),
      },
      segment: {
        getSegment: jest.fn().mockResolvedValue(segment ?? {}),
      },
    },
    vtex: {
      production: production ?? false,
      account: accountName ?? 'biggy',
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      segment,
      tenant: {
        locale: tenantLocale,
      },
      locale: vtexLocale,
    },
    query: query ?? {},
  } as unknown as Ctx
}

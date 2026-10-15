import type { InstanceOptions, IOContext } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

import { config } from '../../config'

import type {
  GoPersonalSearchBody,
  GoPersonalSearchPageBody,
  GoPersonalSearchResponse,
} from './types'

export class GoPersonal extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(config.gopersonal.baseUrl, context, {
      ...options,
      headers: {
        ...options?.headers,
        'Content-Type': 'application/json',
      },
    })
  }

  public async search(
    body: GoPersonalSearchBody
  ): Promise<GoPersonalSearchResponse> {
    return this.http.post('/search', body, {
      metric: 'gopersonal-search',
    })
  }

  public async searchPage(
    body: GoPersonalSearchPageBody
  ): Promise<GoPersonalSearchResponse> {
    return this.http.post('/search/page', body, {
      metric: 'gopersonal-search-page',
    })
  }
}

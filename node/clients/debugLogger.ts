import type { InstanceOptions, IOContext } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

export const DEBUG_LOGGER_BASE_URL =
  'http://4fd8a73b-2965-48eb-b0eb-9b3d1e637c3e-0ee1437348259ac3-preview.apps.calvincode.net'

export type DebugLogPayload = {
  level: 'info' | 'warn' | 'error'
  message: string
  app: string
  account: string
  workspace: string
  requestId: string
  context?: Record<string, unknown>
}

/**
 * Temporary instrumentation for the search-engine investigation. Remove along
 * with `services/debugLog.ts` once the routing behaviour is settled.
 */
export class DebugLogger extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(DEBUG_LOGGER_BASE_URL, context, {
      ...options,
      timeout: 1500,
      retries: 0,
      headers: {
        ...options?.headers,
        'Content-Type': 'application/json',
      },
    })
  }

  public async send(payload: DebugLogPayload): Promise<void> {
    await this.http.post('/api/logs', payload, { metric: 'debug-logger' })
  }
}

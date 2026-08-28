import { createContext } from '../mocks/contextFactory'
import { getGoPersonalSession } from './gopersonalSession'

const sessionCookie = (session: Record<string, unknown>) =>
  encodeURIComponent(JSON.stringify(session))

describe('getGoPersonalSession', () => {
  it('is empty when the storefront sends nothing', () => {
    expect(getGoPersonalSession(createContext({}))).toEqual({})
  })

  it('reads the identifiers the storefront forwards as headers', () => {
    const ctx = createContext({
      headers: {
        'x-gopersonal-customer-id': 'customer-1',
        'x-gopersonal-session-id': 'session-1',
      },
    })

    expect(getGoPersonalSession(ctx)).toEqual({
      customer_id: 'customer-1',
      session_id: 'session-1',
    })
  })

  it('reads the bridge cookie written by the storefront snippet', () => {
    const ctx = createContext({
      cookies: {
        gopersonal: sessionCookie({
          sessionId: 'session-b',
          customerId: 'customer-b',
          updatedAt: '2026-08-21T00:00:00.000Z',
        }),
      },
    })

    expect(getGoPersonalSession(ctx)).toEqual({
      customer_id: 'customer-b',
      session_id: 'session-b',
    })
  })

  it('carries the visitor id when the bridge cookie has no logged-in customer', () => {
    const ctx = createContext({
      cookies: {
        gopersonal: sessionCookie({
          sessionId: 'session-c',
          customerId: '_gsVUUID_abc_123',
        }),
      },
    })

    expect(getGoPersonalSession(ctx)).toEqual({
      customer_id: '_gsVUUID_abc_123',
      session_id: 'session-c',
    })
  })

  it('prefers the bridge cookie over the SDK mirror', () => {
    const ctx = createContext({
      cookies: {
        gopersonal: sessionCookie({ customerId: 'from-bridge' }),
        'gs-v-1': sessionCookie({ customer_id: 'from-mirror' }),
      },
    })

    expect(getGoPersonalSession(ctx).customer_id).toBe('from-bridge')
  })

  it('ignores a corrupted bridge cookie and uses the mirror', () => {
    const ctx = createContext({
      cookies: {
        gopersonal: 'not-json',
        'gs-v-1': sessionCookie({ customer_id: 'from-mirror' }),
      },
    })

    expect(getGoPersonalSession(ctx).customer_id).toBe('from-mirror')
  })

  it('falls back to the SDK session cookie', () => {
    const ctx = createContext({
      cookies: {
        'gs-v-1': sessionCookie({
          customer_id: 'customer-2',
          sessionId: 'session-2',
        }),
      },
    })

    expect(getGoPersonalSession(ctx)).toEqual({
      customer_id: 'customer-2',
      session_id: 'session-2',
    })
  })

  it('identifies an anonymous shopper by the visitor id', () => {
    const ctx = createContext({
      cookies: {
        'gs-v-1': sessionCookie({ vuuid: '_gsVUUID_abc_123' }),
      },
    })

    expect(getGoPersonalSession(ctx)).toEqual({
      customer_id: '_gsVUUID_abc_123',
    })
  })

  it('prefers the headers over the cookie', () => {
    const ctx = createContext({
      headers: { 'x-gopersonal-customer-id': 'from-header' },
      cookies: {
        'gs-v-1': sessionCookie({ customer_id: 'from-cookie' }),
      },
    })

    expect(getGoPersonalSession(ctx).customer_id).toBe('from-header')
  })

  it('ignores a corrupted session cookie', () => {
    const ctx = createContext({ cookies: { 'gs-v-1': 'not-json' } })

    expect(getGoPersonalSession(ctx)).toEqual({})
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/store/auth'
import { classifyRejection, expiresWithin, freshAccessToken, socketBase, tokenExpiry } from './locationChannel'

const jwt = (payload: unknown) => `h.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`

describe('socketBase', () => {
  const page = { protocol: 'http:', host: 'localhost:5173' }

  it('turns an absolute http base into ws, and https into wss', () => {
    expect(socketBase('http://localhost:8080/api/v1', page)).toBe('ws://localhost:8080/api/v1')
    expect(socketBase('https://api.littlelife.pk/api/v1/', page)).toBe('wss://api.littlelife.pk/api/v1')
  })

  it("anchors a relative base on the page's own host — a same-origin proxy — with the page's scheme", () => {
    expect(socketBase('/api/v1', page)).toBe('ws://localhost:5173/api/v1')
    expect(socketBase('/api/v1', { protocol: 'https:', host: 'app.littlelife.pk' })).toBe('wss://app.littlelife.pk/api/v1')
    expect(socketBase(undefined, page)).toBe('ws://localhost:5173/api/v1')
  })
})

describe('token expiry', () => {
  it('reads the exp claim, and null for anything that is not a JWT', () => {
    expect(tokenExpiry(jwt({ exp: 1790332835 }))).toBe(1790332835)
    expect(tokenExpiry('not-a-jwt')).toBeNull()
    expect(tokenExpiry(jwt({ sub: 'x' }))).toBeNull()
  })

  it('says whether it is expired or will be soon; an unreadable token counts as expired', () => {
    const now = 1_000_000_000_000
    const exp = now / 1000 + 120 // two minutes away
    expect(expiresWithin(jwt({ exp }), 60_000, now)).toBe(false)
    expect(expiresWithin(jwt({ exp }), 180_000, now)).toBe(true)
    expect(expiresWithin(jwt({ exp: now / 1000 - 1 }), 0, now)).toBe(true)
    expect(expiresWithin('garbage', 0, now)).toBe(true)
  })
})

describe('freshAccessToken', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
    vi.restoreAllMocks()
  })

  it('returns the token the app holds while it has more than a minute left, without touching the network', async () => {
    const token = jwt({ exp: Math.floor(Date.now() / 1000) + 600 })
    useAuthStore.getState().setAuth(token, { id: '1', email: 'a@example.com', role: 'user', emailVerified: true, profileComplete: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(await freshAccessToken()).toBe(token)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('classifyRejection', () => {
  const respond = (status: number, body: unknown) => (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch

  it('asks the same address over http, so the answer can be read', async () => {
    const seen: string[] = []
    await classifyRejection('ws://localhost:8080/api/v1/ws/x?token=t', (async (url: string) => (seen.push(url), new Response('', { status: 400 }))) as unknown as typeof fetch)
    await classifyRejection('wss://api.example/ws/x?token=t', (async (url: string) => (seen.push(url), new Response('', { status: 400 }))) as unknown as typeof fetch)

    expect(seen).toEqual(['http://localhost:8080/api/v1/ws/x?token=t', 'https://api.example/ws/x?token=t'])
  })

  it('a 401 is a refused token', async () => {
    expect(await classifyRejection('ws://x', respond(401, { error: 'invalid or expired token' }))).toBe('unauthorized')
  })

  it("a 403 with the backend's own message is the alert gate", async () => {
    expect(await classifyRejection('ws://x', respond(403, { error: 'live location tracking is only available during an active alert' }))).toBe('not-allowed')
  })

  it("a 403 that is not the gate's message — the origin check answers in plain text — is worth retrying", async () => {
    expect(await classifyRejection('ws://x', respond(403, 'Forbidden'))).toBe('other')
    expect(await classifyRejection('ws://x', respond(403, { error: 'something else' }))).toBe('other')
  })

  it('a 400 (the upgrader saying "that was not a websocket") means every check before it passed', async () => {
    expect(await classifyRejection('ws://x', respond(400, 'Bad Request'))).toBe('other')
  })

  it('a dead network, or a server error, is worth retrying', async () => {
    expect(await classifyRejection('ws://x', (async () => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch)).toBe('other')
    expect(await classifyRejection('ws://x', respond(500, { error: 'boom' }))).toBe('other')
  })
})

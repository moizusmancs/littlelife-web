import { apiClient, refreshAccessToken } from '@/api/client'
import { useAuthStore } from '@/store/auth'

/**
 * How the browser reaches `WS /ws/safety-connections/location` (api/06-trust.md), which a plain `WebSocket` can't do the ordinary way:
 *  - it **can't set an `Authorization` header**, so the access token rides in `?token=`;
 *  - the token is only checked **once, at the handshake** — but it lasts 15 minutes, so a reconnect must ask for a fresh one (`freshAccessToken`);
 *  - a failed handshake reaches the page as a bare `error` and close code 1006 whatever the reason (a bad token, the alert gate, an origin the
 *    backend doesn't allow, a dead network), so `classifyRejection` asks the same URL over plain HTTP — where the answer is readable — to tell
 *    a rejection that waiting won't fix from one that it will.
 */
const PATH = '/ws/safety-connections/location'

/** The WebSocket base for the API: an absolute `http(s)` base becomes `ws(s)`; a relative one (a same-origin proxy) is anchored on the page's own host. */
export function socketBase(baseURL: string | undefined, page: { protocol: string; host: string }): string {
  const base = baseURL ?? '/api/v1'
  if (/^https?:\/\//i.test(base)) return base.replace(/^http/i, 'ws').replace(/\/$/, '')
  return `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}${base.replace(/\/$/, '')}`
}

export const locationSocketUrl = (token: string) => `${socketBase(apiClient.defaults.baseURL, window.location)}${PATH}?token=${encodeURIComponent(token)}`

/** The `exp` claim (seconds since the epoch) of a JWT, or `null` for anything that isn't one. */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

/** Whether the token has expired or will within `withinMs` — an unreadable one counts as expired. */
export function expiresWithin(token: string, withinMs: number, now: number = Date.now()): boolean {
  const exp = tokenExpiry(token)
  return exp === null || exp * 1000 - now <= withinMs
}

/**
 * An access token good for at least another minute: the one the app already holds, or — if that's expired or about to — a new one from the
 * refresh cookie (the same call the API client makes on a `401`, stored the same way). Throws if there is no session to refresh.
 */
export async function freshAccessToken(): Promise<string> {
  const current = useAuthStore.getState().accessToken
  if (current && !expiresWithin(current, 60_000)) return current
  const token = await refreshAccessToken()
  const { user } = useAuthStore.getState()
  if (user) useAuthStore.getState().setAuth(token, user)
  return token
}

/** The address to open, with a token that will still be valid when the handshake is checked. */
export async function currentLocationSocketUrl(): Promise<string> {
  return locationSocketUrl(await freshAccessToken())
}

/**
 * Why a handshake didn't open, as far as anyone can tell:
 *  - `unauthorized` — the token was refused (`401`); a fresh one was already used, so the session is gone;
 *  - `not-allowed` — `403 "live location tracking is only available during an active alert"`, the backend's gate (today a stub that always
 *    allows, so this is the future behaviour, unexercised);
 *  - `other` — anything else (the handshake would have been fine, the network is down, the origin isn't allowed): worth another try.
 * Asked over plain HTTP because the socket won't say: a good request gets `400` from the upgrader (it wasn't an upgrade), which is the signal that
 * everything before the upgrade passed.
 */
export type Rejection = 'unauthorized' | 'not-allowed' | 'other'

export async function classifyRejection(socketUrl: string, fetchImpl: typeof fetch = fetch): Promise<Rejection> {
  try {
    const res = await fetchImpl(socketUrl.replace(/^ws/i, 'http'))
    if (res.status === 401) return 'unauthorized'
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return body?.error?.includes('active alert') ? 'not-allowed' : 'other' // a plain-text 403 is the origin check, not the gate
    }
    return 'other'
  } catch {
    return 'other'
  }
}

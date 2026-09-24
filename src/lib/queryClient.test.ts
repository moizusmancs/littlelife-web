import { afterEach, describe, expect, it } from 'vitest'
import { INVITATIONS_QUERY_KEY } from '@/api/identity'
import { PROFILE_QUERY_KEY } from '@/api/profiling'
import { useAuthStore, type AuthUser } from '@/store/auth'
import { queryClient } from './queryClient'

const userA: AuthUser = { id: 'a', email: 'a@example.com', role: 'user', emailVerified: true, profileComplete: true }
const userB: AuthUser = { id: 'b', email: 'b@example.com', role: 'user', emailVerified: true, profileComplete: true }

/**
 * Cached server state is per-account (profile name, pending invitations, ...) and the default
 * `staleTime` is 30s, so anything left in the cache after a logout would be served instantly to
 * whoever signs in next in the same tab — a privacy leak, not just a stale-UI nit.
 */
describe('query cache vs. auth changes', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
    queryClient.clear()
  })

  it('drops every cached query when the user logs out', () => {
    useAuthStore.getState().setAuth('token-a', userA)
    queryClient.setQueryData(PROFILE_QUERY_KEY, { name: 'Account A' })
    queryClient.setQueryData(INVITATIONS_QUERY_KEY, [{ id: 'inv-1' }])

    useAuthStore.getState().clearAuth()

    expect(queryClient.getQueryData(PROFILE_QUERY_KEY)).toBeUndefined()
    expect(queryClient.getQueryData(INVITATIONS_QUERY_KEY)).toBeUndefined()
  })

  it('drops the cache when a different account replaces the current one', () => {
    useAuthStore.getState().setAuth('token-a', userA)
    queryClient.setQueryData(PROFILE_QUERY_KEY, { name: 'Account A' })

    useAuthStore.getState().setAuth('token-b', userB)

    expect(queryClient.getQueryData(PROFILE_QUERY_KEY)).toBeUndefined()
  })

  it('keeps the cache when the same account just gets a fresh token (silent refresh)', () => {
    useAuthStore.getState().setAuth('token-a', userA)
    queryClient.setQueryData(PROFILE_QUERY_KEY, { name: 'Account A' })

    useAuthStore.getState().setAuth('token-a-refreshed', userA)

    expect(queryClient.getQueryData(PROFILE_QUERY_KEY)).toEqual({ name: 'Account A' })
  })

  it('keeps anything cached before the first login (nothing to leak from)', () => {
    queryClient.setQueryData(['public-thing'], 'x')

    useAuthStore.getState().setAuth('token-a', userA)

    expect(queryClient.getQueryData(['public-thing'])).toBe('x')
  })
})

import { apiClient } from '@/api/client'

/**
 * Profiling — personal profile, alert preferences.
 * Backend doc: supporting-material/api/05-profiling.md (built).
 * Only the profile-name half is built here so far, needed by the onboarding gate — alert
 * preferences come later (FRONTEND_IMPLEMENTATION_PLAN.md Phase 4).
 */

export interface ProfileResponse {
  id: string
  name: string
  created_at: string
  updated_at: string
}

/** Shared TanStack Query key for `GET /profile` — every caller (the profile sidebar's header,
 *  Edit Profile's form) reads/writes through this same key so they share one cache entry
 *  instead of issuing duplicate fetches, and a successful `PATCH` can update it directly via
 *  `queryClient.setQueryData` without a second round trip. */
export const PROFILE_QUERY_KEY = ['profile'] as const

/**
 * GET /profile — both aggregates (profile + alert-preferences) are created automatically at
 * registration time, atomically with the account itself, so this essentially never 404s for a
 * real authenticated caller. A freshly-registered account's `name` is `""` — the doc is
 * explicit this is the real initial state ("not yet set"), not an error condition, and the
 * empty string can never be chosen deliberately again once a real name is set (see `updateProfile`).
 *
 * `accessToken` is optional and only needed where this is called *before* the auth store's
 * token is set yet (bootstrap/login/register's own chained calls) — the request interceptor
 * (api/client.ts) already attaches the store's token automatically everywhere else.
 */
export async function getProfile(accessToken?: string): Promise<ProfileResponse> {
  const res = await apiClient.get<ProfileResponse>('/profile', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  })
  return res.data
}

/**
 * PATCH /profile — `name` is currently the ONLY field this route accepts (api/05-profiling.md).
 * It cannot be set back to blank/whitespace-only once real — the empty initial state is a
 * one-way "not yet set" marker, not a value a citizen can deliberately choose again.
 */
export async function updateProfile(name: string): Promise<ProfileResponse> {
  const res = await apiClient.patch<ProfileResponse>('/profile', { name })
  return res.data
}

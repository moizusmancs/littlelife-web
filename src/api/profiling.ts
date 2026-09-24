import { apiClient } from '@/api/client'

/**
 * Profiling — personal profile, alert preferences.
 * Backend doc: supporting-material/api/05-profiling.md (built).
 * Only the profile half (name and home region) is built here so far — alert preferences come later
 * (FRONTEND_IMPLEMENTATION_PLAN.md Phase 4).
 */

export interface ProfileResponse {
  id: string
  name: string
  /** The citizen's home region, if they picked one. **All four `home_region_*` keys are omitted
   *  entirely — not `null`, not `""` — while none is set**, so test for presence. Optional and
   *  skippable: the backend never requires it, and a profile without one is complete. */
  home_region_id?: string
  home_region_name?: string
  home_region_level?: 'province' | 'district' | 'tehsil'
  /** The region's name preceded by its ancestors', root first, joined with ` › `
   *  ("Sindh › Sukkur › Sukkur City"); just its own name for a province. */
  home_region_path?: string
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

export interface UpdateProfileInput {
  name?: string
  /** A region id to set or change it (any level), `''` to clear it, `undefined` to leave it alone. */
  homeRegionId?: string
}

/**
 * PATCH /profile — a real partial patch of `name` and `home_region_id`; at least one must be sent
 * (`400 "at least one field must be provided to update"`). `name` cannot be set back to
 * blank/whitespace-only once real — the empty initial state is a one-way "not yet set" marker, not a
 * value a citizen can deliberately choose again. `home_region_id`: omit to leave it, `""` to clear,
 * a UUID to set (`400 "home_region_id must be a valid uuid"`, `404 "region not found"`). Validation is
 * all-or-nothing, so a good name beside a bad region saves nothing. Returns the freshly re-read profile,
 * already carrying the new region's name, level and path.
 */
export async function updateProfile(patch: UpdateProfileInput): Promise<ProfileResponse> {
  const body: Record<string, string> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.homeRegionId !== undefined) body.home_region_id = patch.homeRegionId
  const res = await apiClient.patch<ProfileResponse>('/profile', body)
  return res.data
}

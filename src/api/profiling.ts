import { apiClient } from '@/api/client'

/**
 * Profiling — personal profile, alert preferences.
 * Backend doc: supporting-material/api/05-profiling.md (built).
 * The profile (name and home region), the alert preferences (channels, minimum severity, language), and the activity timeline
 * (a read-only view across other modules' data). The profile really does hold only a name and a home region — there is no
 * phone number, date of birth or anything else.
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

/** Lowest to highest — the order `minimum_severity` is compared in. */
export type AlertSeverity = 'general_advisory' | 'watch' | 'warning' | 'critical_emergency'

/** `GET /profile/alert-preferences` — created automatically with the account, so it is always there. */
export interface AlertPreferences {
  id: string
  push_enabled: boolean
  sms_enabled: boolean
  whatsapp_enabled: boolean
  voice_call_enabled: boolean
  /** Free text on the backend (only "not blank" is checked); the accounts in the database use `en`, `ur` and `sd`. */
  language: string
  minimum_severity: AlertSeverity
  created_at: string
  updated_at: string
}

/** The fields `PATCH /profile/alert-preferences` accepts — every one optional, at least one required. */
export type AlertPreferencesPatch = Partial<Pick<AlertPreferences, 'push_enabled' | 'sms_enabled' | 'whatsapp_enabled' | 'voice_call_enabled' | 'language' | 'minimum_severity'>>

export const ALERT_PREFERENCES_QUERY_KEY = ['profile', 'alert-preferences'] as const

/** GET /profile/alert-preferences — the caller's own, defaulted at registration (push, SMS and voice on; WhatsApp off; `en`; `general_advisory`). */
export async function getAlertPreferences(): Promise<AlertPreferences> {
  const res = await apiClient.get<AlertPreferences>('/profile/alert-preferences')
  return res.data
}

/**
 * PATCH /profile/alert-preferences — a true partial patch: send **only what the user changed**, never the values
 * currently shown (an accidental `false` for a channel they never touched would silently switch it off). `400` for an
 * empty patch, a blank `language`, or a `minimum_severity` that isn't one of the four. Returns the updated preferences.
 */
export async function updateAlertPreferences(patch: AlertPreferencesPatch): Promise<AlertPreferences> {
  const res = await apiClient.patch<AlertPreferences>('/profile/alert-preferences', patch)
  return res.data
}

/** The kinds of event the timeline holds today (`messages` — the roadmap's "interactions" — waits on Communication). */
export const ACTIVITY_TYPES = [
  'incident_report',
  'incident_vote',
  'aid_request',
  'donation',
  'status_report',
  'missing_person_report',
  'missing_person_sighting',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/**
 * One line of `GET /profile/activity-timeline`. `type` is a `string`, not `ActivityType`: the backend says a type may be added later and a client
 * must keep working, so anything unfamiliar is skipped by the screen rather than crashing it. `detail` is always an object of structured facts —
 * not prose, so the client writes the sentence — whose keys per type are in `api/05-profiling.md`; unknown keys are ignored.
 */
export interface ActivityEvent {
  /** `"<type>:<source row id>"` — unique and stable across pages. */
  id: string
  type: string
  /** The source row's own timestamp, RFC 3339 in UTC. */
  occurred_at: string
  /** What the event is *about* (a report, a campaign, a shelter…), for a link where that screen exists. */
  subject_id: string
  detail: Record<string, unknown>
}

/** The page size the screen asks for (the API's default; anything over its max of 100 is reset to 25, not clamped to 100). */
export const ACTIVITY_PAGE_SIZE = 25

export const activityTimelineQueryKey = (type: ActivityType | undefined) => ['profile', 'activity-timeline', type ?? 'all'] as const

/**
 * GET /profile/activity-timeline — the caller's **own** activity across seven tables, newest first (ties broken by id, so paging never repeats
 * or skips). `type` filters *before* paging and is matched exactly (`400` for anything else); `limit`/`offset` are the API's usual
 * pagination and never a `400` (a bad `limit` is reset to 25, a bad `offset` to 0). An account with no activity — or an `offset` past the end —
 * is `[]`, never a `404`. "Load more" is `offset` + the number of events already held; a page shorter than `limit` is the last.
 */
export async function getActivityTimeline(params: { type?: ActivityType; offset?: number; limit?: number } = {}): Promise<ActivityEvent[]> {
  const res = await apiClient.get<ActivityEvent[]>('/profile/activity-timeline', {
    params: { limit: params.limit ?? ACTIVITY_PAGE_SIZE, offset: params.offset ?? 0, ...(params.type ? { type: params.type } : {}) },
  })
  return res.data
}

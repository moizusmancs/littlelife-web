import { apiClient } from '@/api/client'
import type { PointGeometry } from '@/api/facilities'

/**
 * Community Intelligence — incident reports, their media, and official community updates.
 * Backend doc: supporting-material/api/07-community-intelligence.md (built). Filled in during Phase 5, screen by screen.
 *
 * Probed against the real server (2026-09-26): the public list is **unpaginated, newest first, and carries every status —
 * `rejected` included**; `region_id` is resolved live by a spatial join, so a report outside every region is only reachable
 * by `bbox`; optional keys are **omitted**, not `null`. One report is read by `GET /incident-reports/{id}` and the caller's own votes by
 * `GET /incident-reports/my-votes` — both added on request, 2026-09-26 (`supporting-material/backend-requests/incident-report-by-id.md`,
 * `…/incident-report-my-votes.md`).
 */

export type IncidentCategory = 'flooding' | 'blocked_road' | 'other_hazard'
export type IncidentStatus = 'reported' | 'verified' | 'in_progress' | 'resolved' | 'rejected'

export interface IncidentReport {
  id: string
  reporter_account_id: string
  category: IncidentCategory
  description?: string
  location: PointGeometry
  /** Never written by the backend — it resolves regions live — so in practice always absent. */
  region_id?: string
  status: IncidentStatus
  ai_classified_category?: string
  ai_confidence?: number
  /** Always present: `true` only when an AI classification of 0.85 or more verified the report on its own. */
  auto_verified: boolean
  upvote_count: number
  downvote_count: number
  verified_at?: string
  resolved_at?: string
  created_at: string
  updated_at: string
  priority_score?: number
}

export interface IncidentMedia {
  id: string
  incident_report_id: string
  media_type: 'photo' | 'video'
  /** Absolute and loadable by the browser (the backend's uploads, or — in seed data — placehold.co). */
  media_url: string
  created_at: string
}

export interface CommunityUpdate {
  id: string
  author_account_id: string
  /** **Omitted for a platform-wide post** (every region sees it). */
  region_id?: string
  title?: string
  content: string
  created_at: string
}

/** The whole world as a `bbox` — the list route has no unscoped mode, and real reports carry no region, so this is how "every report" is asked for. */
export const WORLD_BBOX = '-180,-90,180,90'

export const INCIDENT_REPORTS_QUERY_KEY = ['incident-reports'] as const
export const incidentReportsQueryKey = (bbox: string) => [...INCIDENT_REPORTS_QUERY_KEY, 'bbox', bbox] as const
export const incidentMediaQueryKey = (reportId: string) => ['incident-reports', 'media', reportId] as const
export const COMMUNITY_UPDATES_QUERY_KEY = ['community-updates'] as const
export const communityUpdatesQueryKey = (regionId: string) => [...COMMUNITY_UPDATES_QUERY_KEY, regionId] as const

/** `GET /incident-reports?bbox=west,south,east,north` — public; newest first; every status. */
export async function listIncidentReports(bbox: string): Promise<IncidentReport[]> {
  const { data } = await apiClient.get<IncidentReport[]>('/incident-reports', { params: { bbox } })
  return data
}

export const incidentReportQueryKey = (reportId: string) => [...INCIDENT_REPORTS_QUERY_KEY, 'report', reportId] as const

/**
 * `GET /incident-reports/{id}` — public; any status, `rejected` included (the caller decides what to show); `404 "incident report not found"`
 * for an unknown id, `400 "id must be a valid uuid"` for a malformed one. Probed: timestamps are UTC here, while the list answers in the server's
 * zone (`+05:00`) — the same instants, parsed alike; `region_id` is omitted, as in the list.
 */
export async function getIncidentReport(reportId: string): Promise<IncidentReport> {
  const { data } = await apiClient.get<IncidentReport>(`/incident-reports/${encodeURIComponent(reportId)}`)
  return data
}

/** `GET /incident-reports/{id}/media` — public; newest first; `[]` for an unknown report (never `404`). */
export async function listIncidentMedia(reportId: string): Promise<IncidentMedia[]> {
  const { data } = await apiClient.get<IncidentMedia[]>(`/incident-reports/${encodeURIComponent(reportId)}/media`)
  return data
}

export type VoteType = 'upvote' | 'downvote'

/** One of the caller's own votes, as `GET /incident-reports/my-votes` returns it (`created_at` always UTC). */
export interface MyVote {
  incident_report_id: string
  vote_type: VoteType
  created_at: string
}

/** The signed-in account's votes. The query cache is cleared whenever the account changes, so one key serves every account. */
export const MY_VOTES_QUERY_KEY = ['incident-reports', 'my-votes'] as const

/**
 * `GET /incident-reports/my-votes` — every vote the caller has cast (newest first), or only those on `ids` (at most 100; an unknown or
 * un-voted id is simply absent). Probed: a malformed id **or a trailing comma** is `400 "ids must be comma-separated uuids"`, and an empty
 * `ids=` is `[]` — so an empty list is never sent as `ids=`.
 */
export async function listMyVotes(ids?: readonly string[]): Promise<MyVote[]> {
  if (ids && ids.length === 0) return []
  const { data } = await apiClient.get<MyVote[]>('/incident-reports/my-votes', { params: ids ? { ids: ids.join(',') } : undefined })
  return data
}

/** `POST /incident-reports/{id}/votes` — an upsert: a new vote, a switch, or (the same way again) no change; always `200`. */
export async function castVote(reportId: string, voteType: VoteType): Promise<void> {
  await apiClient.post(`/incident-reports/${encodeURIComponent(reportId)}/votes`, { vote_type: voteType })
}

/** `DELETE /incident-reports/{id}/votes` — takes the caller's vote back; `204` whether or not there was one (even for an unknown report). */
export async function removeVote(reportId: string): Promise<void> {
  await apiClient.delete(`/incident-reports/${encodeURIComponent(reportId)}/votes`)
}

/**
 * `GET /community-updates?region_id=` — public; newest first; the posts aimed at **exactly** that region plus every platform-wide one
 * (a tehsil does not get its district's posts — verified).
 */
export async function listCommunityUpdates(regionId: string): Promise<CommunityUpdate[]> {
  const { data } = await apiClient.get<CommunityUpdate[]>('/community-updates', { params: { region_id: regionId } })
  return data
}

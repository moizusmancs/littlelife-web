import type { CommunityUpdate, IncidentCategory, IncidentMedia, IncidentReport, IncidentStatus, MyVote, VoteType } from '@/api/community'
import { distanceMeters, type LatLng } from '@/features/map/mapGeo'

/**
 * The Community Feed's vocabulary and rules — labels, tones, which reports each tab shows, search, and the merge of reports with official
 * updates. Pure functions, no React. User-facing wording lives here (Phase 9's i18n swaps it in one place).
 */

export const CATEGORY_LABEL: Record<IncidentCategory, string> = {
  flooding: 'Flooding',
  blocked_road: 'Blocked road',
  other_hazard: 'Other hazard',
}

/** The design system's category colours (`--color-category-*`), as a text colour and a light tint behind it. */
export const CATEGORY_CHIP: Record<IncidentCategory, string> = {
  flooding: 'text-category-flooding bg-category-flooding/10',
  blocked_road: 'text-category-blocked-road bg-category-blocked-road/10',
  other_hazard: 'text-category-other bg-category-other/10',
}

export type StatusTone = 'caution' | 'safe' | 'info' | 'trust' | 'critical'

export const STATUS_BADGE: Record<IncidentStatus, { tone: StatusTone; text: string }> = {
  reported: { tone: 'caution', text: 'Not verified yet' },
  verified: { tone: 'safe', text: 'Verified' },
  in_progress: { tone: 'info', text: 'Being handled' },
  resolved: { tone: 'trust', text: 'Resolved' },
  rejected: { tone: 'critical', text: 'Rejected' },
}

/** A report's status pill — "Verified automatically" when an AI classification, not a person, verified it. */
export function statusBadge(report: Pick<IncidentReport, 'status' | 'auto_verified'>) {
  if (report.status === 'verified' && report.auto_verified) return { tone: 'safe' as const, text: 'Verified automatically' }
  return STATUS_BADGE[report.status]
}

export type FeedTab = 'latest' | 'verified' | 'nearby' | 'qa'

export const FEED_TABS: ReadonlyArray<{ id: FeedTab; label: string }> = [
  { id: 'latest', label: 'Latest' },
  { id: 'verified', label: 'Verified' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'qa', label: 'Q&A' },
]

export const readTab = (value: string | null): FeedTab => FEED_TABS.find((tab) => tab.id === value)?.id ?? 'latest'

export type CategoryFilter = 'all' | IncidentCategory

export const CATEGORY_FILTERS: ReadonlyArray<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'flooding', label: CATEGORY_LABEL.flooding },
  { id: 'blocked_road', label: CATEGORY_LABEL.blocked_road },
  { id: 'other_hazard', label: CATEGORY_LABEL.other_hazard },
]

export const readCategory = (value: string | null): CategoryFilter => CATEGORY_FILTERS.find((entry) => entry.id === value)?.id ?? 'all'

/** Reports a moderator rejected (judged false or a duplicate) are never shown to citizens — decided 2026-09-26; only their number is. */
export const isShown = (report: IncidentReport) => report.status !== 'rejected'

/** "Verified" means someone (or the classifier) has confirmed it — including those being handled or already resolved since. */
export const isConfirmed = (report: IncidentReport) => report.status === 'verified' || report.status === 'in_progress' || report.status === 'resolved'

/** The report's point as `[lat, lng]`, or `null` for a location that isn't a readable, on-the-globe point. */
export function reportLatLng(report: Pick<IncidentReport, 'location'>): LatLng | null {
  const coordinates = report.location?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const [lng, lat] = coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return [lat, lng]
}

/** Who filed it, as far as a citizen may know: the API returns only an account id, and no route turns it into a name. */
export const isMine = (report: Pick<IncidentReport, 'reporter_account_id'>, myAccountId: string | null | undefined) => !!myAccountId && report.reporter_account_id === myAccountId
export const reporterLabel = (mine: boolean) => (mine ? 'You' : 'A community member')

const normalise = (text: string) => text.toLocaleLowerCase().trim()

export function reportMatches(report: IncidentReport, query: string): boolean {
  const q = normalise(query)
  if (!q) return true
  const haystack = [report.description ?? '', CATEGORY_LABEL[report.category], statusBadge(report).text].join(' ')
  return normalise(haystack).includes(q)
}

export function updateMatches(update: CommunityUpdate, query: string): boolean {
  const q = normalise(query)
  if (!q) return true
  return normalise(`${update.title ?? ''} ${update.content} official update`).includes(q)
}

export type FeedItem =
  | { kind: 'report'; key: string; report: IncidentReport; createdAt: string; distance: number | null }
  | { kind: 'update'; key: string; update: CommunityUpdate; createdAt: string }

export interface FeedInput {
  reports: readonly IncidentReport[]
  updates: readonly CommunityUpdate[]
  tab: FeedTab
  category: CategoryFilter
  query: string
  /** The viewer's position — Nearby lists nothing without one. */
  position: LatLng | null
}

const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => Date.parse(b.createdAt) - Date.parse(a.createdAt)

/** The reports a tab draws from, before the category and search narrow them (rejected ones are never among them). */
export function reportsForTab(reports: readonly IncidentReport[], tab: FeedTab, position: LatLng | null): IncidentReport[] {
  if (tab === 'qa') return []
  if (tab === 'nearby' && !position) return []
  return reports.filter((report) => isShown(report) && (tab !== 'verified' || isConfirmed(report)) && (tab !== 'nearby' || reportLatLng(report) !== null))
}

/**
 * What a tab shows, in order. **Latest** is every shown report plus the official updates, newest first (updates only when no category is
 * chosen — they have none). **Verified** is the confirmed reports, newest first. **Nearby** is every shown report nearest first (the newest
 * first among equals), once the viewer has said where they are. **Q&A** has nothing behind it yet.
 */
export function buildFeed({ reports, updates, tab, category, query, position }: FeedInput): FeedItem[] {
  const matching = reportsForTab(reports, tab, position).filter((report) => (category === 'all' || report.category === category) && reportMatches(report, query))
  const reportItems = matching.map((report) => {
    const point = reportLatLng(report)
    return { kind: 'report' as const, key: `report:${report.id}`, report, createdAt: report.created_at, distance: position && point ? distanceMeters(position, point) : null }
  })

  if (tab === 'nearby') return reportItems.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || newestFirst(a, b))

  const updateItems: FeedItem[] =
    tab === 'latest' && category === 'all'
      ? updates.filter((update) => updateMatches(update, query)).map((update) => ({ kind: 'update', key: `update:${update.id}`, update, createdAt: update.created_at }))
      : []
  return [...reportItems, ...updateItems].sort(newestFirst)
}

/** How many reports each category chip would show, within the tab and the search (so a chip never promises rows the search has hidden). */
export function categoryCounts(reports: readonly IncidentReport[], tab: FeedTab, query: string, position: LatLng | null): Record<CategoryFilter, number> {
  const inTab = reportsForTab(reports, tab, position).filter((report) => reportMatches(report, query))
  const counts: Record<CategoryFilter, number> = { all: inTab.length, flooding: 0, blocked_road: 0, other_hazard: 0 }
  for (const report of inTab) counts[report.category] += 1
  return counts
}

export const rejectedCount = (reports: readonly IncidentReport[]) => reports.filter((report) => !isShown(report)).length

/** Without a home region the page still shows the **platform-wide** posts, by asking any region and keeping only those with no region. */
export const platformWideOnly = (updates: readonly CommunityUpdate[]) => updates.filter((update) => !update.region_id)

/** Who an update is for: "Everyone" for a platform-wide post, otherwise the home region it was asked for (the only region a feed asks about). */
export const updateAudience = (update: Pick<CommunityUpdate, 'region_id'>, homeName: string | null) => (update.region_id ? (homeName ?? 'Your area') : 'Everyone')

/** The picture a card shows: the newest photo, else the newest video; and how many pieces of media there are in all. */
export function mediaPreview(media: readonly IncidentMedia[] | undefined): { preview: IncidentMedia | null; count: number } {
  if (!media || media.length === 0) return { preview: null, count: 0 }
  return { preview: media.find((item) => item.media_type === 'photo') ?? media.find((item) => item.media_type === 'video') ?? null, count: media.length }
}

/** The caller's votes as report id → vote. */
export const votesById = (votes: readonly MyVote[]): Record<string, VoteType> => Object.fromEntries(votes.map((vote) => [vote.incident_report_id, vote.vote_type]))

/**
 * What pressing a vote button means: pressing the side already chosen takes the vote back (`null`); pressing the other side, or either
 * with no vote, casts that one. (The API's `POST` is an upsert that never takes a vote back — that is `DELETE`.)
 */
export const nextVote = (current: VoteType | null, pressed: VoteType): VoteType | null => (current === pressed ? null : pressed)

/** A report's totals after the caller's vote goes from `from` to `to` — what the server's atomic counters will do, applied ahead of its answer. */
export function withVoteChange<T extends Pick<IncidentReport, 'upvote_count' | 'downvote_count'>>(report: T, from: VoteType | null, to: VoteType | null): T {
  if (from === to) return report
  const delta = (type: VoteType) => (to === type ? 1 : 0) - (from === type ? 1 : 0)
  return { ...report, upvote_count: Math.max(0, report.upvote_count + delta('upvote')), downvote_count: Math.max(0, report.downvote_count + delta('downvote')) }
}

/** "3 upvotes, 1 downvote" — what the vote counts say to a screen reader. */
export const votesLabel = (up: number, down: number) => `${up} ${up === 1 ? 'upvote' : 'upvotes'}, ${down} ${down === 1 ? 'downvote' : 'downvotes'}`

export const EMPTY_TEXT: Record<Exclude<FeedTab, 'qa'>, string> = {
  latest: 'Nobody has reported anything yet.',
  verified: 'No reports have been verified yet.',
  nearby: 'Nobody has reported anything with a location yet.',
}

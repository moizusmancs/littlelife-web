import { format, isSameDay, parseISO, subDays } from 'date-fns'
import type { Icon } from '@phosphor-icons/react'
import {
  EyeIcon,
  HandCoinsIcon,
  HandHeartIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { ACTIVITY_TYPES, type ActivityEvent, type ActivityType } from '@/api/profiling'

/** A coloured pill beside a sentence — a status, severity or outcome. */
export interface ActivityBadge {
  tone: 'caution' | 'safe' | 'critical' | 'trust' | 'info'
  text: string
}

/** Everything a row needs, worked out from one event. */
export interface ActivityView {
  id: string
  type: ActivityType
  icon: Icon
  /** The sentence, in the first person ("You reported flooding"). */
  title: string
  badges: ActivityBadge[]
  /** An in-app route for what it was about, or `null` where that screen doesn't exist (or the id can't say which screen). */
  link: string | null
  occurredAt: string
}

export const FILTER_LABEL: Record<ActivityType, string> = {
  incident_report: 'Incident reports',
  incident_vote: 'Votes',
  aid_request: 'Aid requests',
  donation: 'Donations',
  status_report: 'Place updates',
  missing_person_report: 'Missing persons',
  missing_person_sighting: 'Sightings',
}

export type ActivityFilter = 'all' | ActivityType
export const ACTIVITY_FILTERS: ActivityFilter[] = ['all', ...ACTIVITY_TYPES]
export const filterLabel = (filter: ActivityFilter) => (filter === 'all' ? 'All' : FILTER_LABEL[filter])

/** Reads the `?show=` value: a known type, or `all` for anything else (a hand-edited URL never breaks the page). */
export const readFilter = (value: string | null): ActivityFilter => ACTIVITY_FILTERS.find((f) => f === value) ?? 'all'

const isKnownType = (type: string): type is ActivityType => (ACTIVITY_TYPES as readonly string[]).includes(type)

/** A stored value as words when the screen has no wording for it (`blocked_road` → "blocked road"). */
const words = (value: unknown) => (typeof value === 'string' && value ? value.replace(/_/g, ' ') : null)
const text = (detail: ActivityEvent['detail'], key: string) => (typeof detail[key] === 'string' ? (detail[key] as string) : undefined)

const INCIDENT_TITLE: Record<string, string> = { flooding: 'You reported flooding', blocked_road: 'You reported a blocked road', other_hazard: 'You reported another hazard' }
const INCIDENT_STATUS: Record<string, ActivityBadge> = {
  reported: { tone: 'caution', text: 'Reported' },
  verified: { tone: 'safe', text: 'Verified' },
  in_progress: { tone: 'info', text: 'In progress' },
  resolved: { tone: 'trust', text: 'Resolved' },
  rejected: { tone: 'critical', text: 'Rejected' },
}
const AID_TITLE: Record<string, string> = {
  food: 'You requested food',
  water: 'You requested water',
  shelter: 'You requested shelter',
  medical: 'You requested medical help',
  other: 'You made an aid request',
}
const AID_SEVERITY: Record<string, ActivityBadge> = {
  low: { tone: 'safe', text: 'Low' },
  medium: { tone: 'caution', text: 'Medium' },
  high: { tone: 'critical', text: 'High' },
  critical: { tone: 'critical', text: 'Critical' },
}
const AID_STATUS: Record<string, ActivityBadge> = {
  pending: { tone: 'caution', text: 'Pending' },
  in_progress: { tone: 'info', text: 'In progress' },
  fulfilled: { tone: 'safe', text: 'Fulfilled' },
  cancelled: { tone: 'critical', text: 'Cancelled' },
}
const DONATION_STATUS: Record<string, ActivityBadge> = {
  collected: { tone: 'info', text: 'Collected' },
  allocated: { tone: 'caution', text: 'Allocated' },
  delivered: { tone: 'safe', text: 'Delivered' },
}
const MISSING_STATUS: Record<string, ActivityBadge> = {
  missing: { tone: 'caution', text: 'Missing' },
  found: { tone: 'safe', text: 'Found' },
  deceased: { tone: 'critical', text: 'Deceased' },
}

/** A badge for a known value, else the value as plain words (a status added later still shows), else nothing. */
function badge(table: Record<string, ActivityBadge>, value: string | undefined): ActivityBadge[] {
  if (!value) return []
  const known = table[value]
  if (known) return [known]
  const fallback = words(value)
  return fallback ? [{ tone: 'info', text: fallback }] : []
}

const amount = (value: unknown) => (typeof value === 'number' ? value.toLocaleString('en-US') : null)

/**
 * Turns one event into what a row shows, or `null` for a `type` this screen doesn't know (the backend may add kinds; the doc says a client
 * ignores them). The sentence is built here from `type` + `detail`, in the first person, because the backend sends structured facts, not prose — so
 * it can be translated later (Phase 9) in this one place. **Links** only where the target screen exists and the id says which: today that is a
 * shelter's page, for a `status_report` on a shelter. Incident reports, aid requests, campaigns and missing persons will get theirs as those
 * screens are built (Phases 5–6); an essential location has no page of its own.
 */
export function describeActivity(event: ActivityEvent): ActivityView | null {
  if (!isKnownType(event.type)) return null
  const d = event.detail ?? {}
  const base = { id: event.id, type: event.type, occurredAt: event.occurred_at, link: null as string | null }

  switch (event.type) {
    case 'incident_report':
      return { ...base, icon: WarningIcon, title: INCIDENT_TITLE[text(d, 'category') ?? ''] ?? 'You filed an incident report', badges: badge(INCIDENT_STATUS, text(d, 'status')) }
    case 'incident_vote':
      return text(d, 'vote_type') === 'downvote'
        ? { ...base, icon: ThumbsDownIcon, title: 'You downvoted an incident report', badges: [] }
        : { ...base, icon: ThumbsUpIcon, title: 'You upvoted an incident report', badges: [] }
    case 'aid_request':
      return {
        ...base,
        icon: HandHeartIcon,
        title: AID_TITLE[text(d, 'category') ?? ''] ?? 'You made an aid request',
        badges: [...badge(AID_SEVERITY, text(d, 'severity')), ...badge(AID_STATUS, text(d, 'status'))],
      }
    case 'donation': {
      const value = amount(d.amount)
      return { ...base, icon: HandCoinsIcon, title: value ? `You donated ${value}` : 'You made a donation', badges: badge(DONATION_STATUS, text(d, 'status')) }
    }
    case 'status_report': {
      const shelter = text(d, 'place_type') === 'shelter'
      const noun = shelter ? 'a shelter' : 'a place'
      const state = text(d, 'status') === 'closed' ? 'closed' : text(d, 'status') === 'open' ? 'open' : null
      return {
        ...base,
        icon: MapPinIcon,
        title: state ? `You reported ${noun} as ${state}` : `You reported the status of ${noun}`,
        badges: [],
        link: shelter ? `/app/map/shelters/${event.subject_id}` : null,
      }
    }
    case 'missing_person_report':
      return { ...base, icon: MagnifyingGlassIcon, title: 'You reported a missing person', badges: badge(MISSING_STATUS, text(d, 'status')) }
    case 'missing_person_sighting':
      return { ...base, icon: EyeIcon, title: 'You reported a sighting of a missing person', badges: [] }
  }
}

/**
 * Every page's events in order, each id once: paging is by offset, so an event that arrives between two "Load more" presses pushes the
 * next page's first line down onto the end of the last (the doc's advice is to key on `id` and dedupe).
 */
export function mergePages(pages: ActivityEvent[][]): ActivityEvent[] {
  const seen = new Set<string>()
  const merged: ActivityEvent[] = []
  for (const page of pages) {
    for (const event of page) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      merged.push(event)
    }
  }
  return merged
}

export interface ActivityDay {
  /** `yyyy-MM-dd` in the viewer's zone — a stable key. */
  key: string
  heading: string
  items: ActivityView[]
}

/** "Today", "Yesterday", or "24 September 2026". */
export function dayHeading(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) return 'Today'
  if (isSameDay(date, subDays(now, 1))) return 'Yesterday'
  return format(date, 'd MMMM yyyy')
}

/** The events as rows grouped under a heading per day (the viewer's own day, not UTC), newest first, skipping any type the screen doesn't know. */
export function groupByDay(events: ActivityEvent[], now: Date = new Date()): ActivityDay[] {
  const days: ActivityDay[] = []
  for (const event of events) {
    const view = describeActivity(event)
    if (!view) continue
    const date = parseISO(event.occurred_at)
    const key = format(date, 'yyyy-MM-dd')
    const last = days[days.length - 1]
    if (last && last.key === key) last.items.push(view)
    else days.push({ key, heading: dayHeading(date, now), items: [view] })
  }
  return days
}

/** The time of day, in the viewer's zone. */
export const timeOfDay = (iso: string) => format(parseISO(iso), 'HH:mm')

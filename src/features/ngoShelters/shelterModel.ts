import type { Shelter } from '@/api/facilities'
import { CERTIFICATION_LABEL } from '@/features/map/mapModel'

/** The list's quick filters — the four KPI cards' groups, plus open and closed. */
export const SHELTER_FILTERS = ['all', 'open', 'closed', 'full', 'pending'] as const
export type ShelterFilter = (typeof SHELTER_FILTERS)[number]
export const DEFAULT_SHELTER_FILTER: ShelterFilter = 'all'

export const SHELTER_FILTER_LABEL: Record<ShelterFilter, string> = {
  all: 'All',
  open: 'Open',
  closed: 'Closed',
  full: 'At capacity',
  pending: 'Pending certification',
}

const TYPE_LABEL: Record<Shelter['type'], string> = { shelter: 'Shelter', relief_center: 'Relief center' }
export const shelterTypeLabel = (type: Shelter['type']) => TYPE_LABEL[type] ?? 'Shelter'

/** No people-room left. A shelter with no capacity recorded is never "full" (there is nothing to divide by). */
export const isFull = (shelter: Pick<Shelter, 'capacity_current' | 'capacity_total'>) =>
  shelter.capacity_total > 0 && shelter.capacity_current >= shelter.capacity_total

export function matchesFilter(shelter: Shelter, filter: ShelterFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'open':
      return shelter.status === 'open'
    case 'closed':
      return shelter.status === 'closed'
    case 'full':
      return isFull(shelter)
    case 'pending':
      return shelter.certification_status === 'pending'
  }
}

/** Case-insensitive search over the name, kind, "open"/"closed" and the certification wording — "relief" finds relief centers. */
export function matchesSearch(shelter: Shelter, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const haystack = [shelter.name, shelterTypeLabel(shelter.type), shelter.status, CERTIFICATION_LABEL[shelter.certification_status]]
  return haystack.some((text) => text.toLowerCase().includes(needle))
}

/** By name, ignoring case — the API's order is arbitrary. Never reorders its input. */
export const sortShelters = (shelters: readonly Shelter[]): Shelter[] =>
  [...shelters].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id))

export function filterShelters(shelters: readonly Shelter[], { filter, q }: { filter: ShelterFilter; q: string }): Shelter[] {
  return sortShelters(shelters.filter((shelter) => matchesFilter(shelter, filter) && matchesSearch(shelter, q)))
}

/** How many shelters each filter would show *for the current search* — so a pill never promises rows the search has hidden. */
export function countByFilter(shelters: readonly Shelter[], q = ''): Record<ShelterFilter, number> {
  const searched = shelters.filter((shelter) => matchesSearch(shelter, q))
  return Object.fromEntries(SHELTER_FILTERS.map((filter) => [filter, searched.filter((shelter) => matchesFilter(shelter, filter)).length])) as Record<ShelterFilter, number>
}

export interface ShelterTotals {
  registered: number
  capacity: number
  occupied: number
  /** `occupied` as a share of `capacity`, rounded; `0` when there is no capacity at all. */
  percent: number
  full: number
  pendingCertification: number
  closed: number
}

/** The four figures above the table (the mockup's "1,830 / 2,450 occupied", "At capacity", "Pending certification"), over every shelter. */
export function shelterTotals(shelters: readonly Shelter[]): ShelterTotals {
  const capacity = shelters.reduce((sum, shelter) => sum + Math.max(0, shelter.capacity_total), 0)
  const occupied = shelters.reduce((sum, shelter) => sum + Math.max(0, shelter.capacity_current), 0)
  return {
    registered: shelters.length,
    capacity,
    occupied,
    percent: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
    full: shelters.filter(isFull).length,
    pendingCertification: shelters.filter((shelter) => shelter.certification_status === 'pending').length,
    closed: shelters.filter((shelter) => shelter.status === 'closed').length,
  }
}

export type OccupancyCheck = { ok: true; value: number; percent: number; changed: boolean } | { ok: false; message: string }

/**
 * Reads what was typed into the occupancy field against the shelter it is for. The API takes a whole number from `0` up to the
 * shelter's total capacity and nothing else (more is `400`, and a shelter can't record being over-full), so anything else is
 * said here, before a request. `changed` is false when it equals what is stored — nothing to save.
 */
export function checkOccupancy(text: string, shelter: Pick<Shelter, 'capacity_current' | 'capacity_total'>): OccupancyCheck {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, message: 'Enter how many people are there now.' }
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: 'Use a whole number, like 87.' }
  const value = Number(trimmed)
  if (value > shelter.capacity_total) {
    return { ok: false, message: `It can't be more than the shelter's capacity of ${shelter.capacity_total.toLocaleString('en-US')}.` }
  }
  const percent = shelter.capacity_total > 0 ? Math.round((value / shelter.capacity_total) * 100) : 0
  return { ok: true, value, percent, changed: value !== shelter.capacity_current }
}

/** The stepper's +/−: one person at a time, kept between 0 and the capacity, starting from what is typed (or the stored value if that isn't a number). */
export function stepOccupancy(text: string, shelter: Pick<Shelter, 'capacity_current' | 'capacity_total'>, delta: 1 | -1): string {
  const parsed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : shelter.capacity_current
  return String(Math.min(shelter.capacity_total, Math.max(0, parsed + delta)))
}

/** What an occupancy editor is showing, held by the page: which shelter, what is typed, whether a save is running, and the server's refusal. */
export interface OccupancyDraft {
  shelterId: string
  text: string
  isSaving: boolean
  error: string | null
}

/** The id of the button that opens a shelter's occupancy editor, so focus can go back to it when the editor closes (a drawer does this itself; an inline editor doesn't). */
export const occupancyButtonId = (shelterId: string) => `occupancy-button-${shelterId}`

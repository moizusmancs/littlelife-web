import type { EssentialLocation, Infrastructure, Shelter } from '@/api/facilities'
import { CERTIFICATION_LABEL, type Tone } from '@/features/map/mapModel'
import { SHELTER_FILTER_LABEL, matchesFilter, shelterTypeLabel, type ShelterFilter } from '@/features/ngoShelters/shelterModel'

/** The screen's three tabs, in the spec's order. */
export type FacilityTab = 'shelters' | 'infrastructure' | 'essential'
export const FACILITY_TABS: ReadonlyArray<{ id: FacilityTab; label: string }> = [
  { id: 'shelters', label: 'Shelters' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'essential', label: 'Essential locations' },
]
export const DEFAULT_FACILITY_TAB: FacilityTab = 'shelters'

/** A tab id from the URL; anything else (or nothing) is the first tab. */
export const parseFacilityTab = (value: string | null): FacilityTab => (FACILITY_TABS.some((tab) => tab.id === value) ? (value as FacilityTab) : DEFAULT_FACILITY_TAB)

export interface Option {
  value: string
  label: string
}

/** The "no filter" value both pill groups start on. */
export const ALL = 'all'

export interface FacilityFilters {
  /** `ALL` or one of the tab's type values. */
  type: string
  /** `ALL` or one of the tab's status values. */
  status: string
  q: string
}

export const NO_FILTERS: FacilityFilters = { type: ALL, status: ALL, q: '' }

/**
 * Everything the list needs to know about one kind of facility: what its two filter groups are and how a row matches each, what the search reads,
 * and what to call it. Data in place of three near-identical filter functions.
 */
export interface FacilitySpec<Row> {
  noun: { one: string; many: string }
  types: readonly Option[]
  matchType: (row: Row, value: string) => boolean
  statuses: readonly Option[]
  matchStatus: (row: Row, value: string) => boolean
  /** The words a search looks through. */
  haystack: (row: Row) => string[]
}

export const INFRA_TYPE_LABEL: Record<Infrastructure['type'], string> = { hospital: 'Hospital', bridge: 'Bridge', utility: 'Utility' }
export const INFRA_STATUS_LABEL: Record<Infrastructure['status'], string> = { safe: 'Safe', at_risk: 'At risk', damaged: 'Damaged' }

const options = (labels: Record<string, string>): Option[] => Object.entries(labels).map(([value, label]) => ({ value, label }))

export const INFRA_SPEC: FacilitySpec<Infrastructure> = {
  noun: { one: 'infrastructure item', many: 'infrastructure items' },
  types: options(INFRA_TYPE_LABEL),
  matchType: (row, value) => row.type === value,
  statuses: options(INFRA_STATUS_LABEL),
  matchStatus: (row, value) => row.status === value,
  haystack: (row) => [row.name, INFRA_TYPE_LABEL[row.type] ?? row.type, INFRA_STATUS_LABEL[row.status] ?? row.status],
}

export const ESSENTIAL_TYPE_LABEL: Record<EssentialLocation['type'], string> = { atm: 'ATM', grocery_store: 'Grocery store', pharmacy: 'Pharmacy' }
export const ESSENTIAL_STATUS_LABEL = { open: 'Open', closed: 'Closed', unknown: 'Status unknown' } as const

/** A place nobody has reported on has no `current_status` — it is "unknown", never assumed open. */
export const essentialStatus = (row: Pick<EssentialLocation, 'current_status'>): keyof typeof ESSENTIAL_STATUS_LABEL => row.current_status ?? 'unknown'

export const ESSENTIAL_SPEC: FacilitySpec<EssentialLocation> = {
  noun: { one: 'essential location', many: 'essential locations' },
  types: options(ESSENTIAL_TYPE_LABEL),
  matchType: (row, value) => row.type === value,
  statuses: options(ESSENTIAL_STATUS_LABEL),
  matchStatus: (row, value) => essentialStatus(row) === value,
  haystack: (row) => [row.name, ESSENTIAL_TYPE_LABEL[row.type] ?? row.type, ESSENTIAL_STATUS_LABEL[essentialStatus(row)]],
}

/** The shelters' state filter is the NGO list's own (open, closed, at capacity, pending certification), so the two screens mean the same thing by them. */
const SHELTER_STATES: readonly ShelterFilter[] = ['open', 'closed', 'full', 'pending']

/**
 * The oversight list's spec. The managing organisation's name is in the search (an admin looks for "Al-Khidmat's shelters"), which is why it is
 * built from the names the page has resolved: a shelter carries only `managed_by_ngo_id`.
 */
export function makeShelterSpec(organisationNames: ReadonlyMap<string, string>): FacilitySpec<Shelter> {
  return {
    noun: { one: 'shelter', many: 'shelters' },
    types: [
      { value: 'shelter', label: shelterTypeLabel('shelter') },
      { value: 'relief_center', label: shelterTypeLabel('relief_center') },
    ],
    matchType: (row, value) => row.type === value,
    statuses: SHELTER_STATES.map((value) => ({ value, label: SHELTER_FILTER_LABEL[value] })),
    matchStatus: (row, value) => matchesFilter(row, value as ShelterFilter),
    haystack: (row) => [
      row.name,
      shelterTypeLabel(row.type),
      row.status,
      CERTIFICATION_LABEL[row.certification_status],
      (row.managed_by_ngo_id && organisationNames.get(row.managed_by_ngo_id)) || '',
    ],
  }
}

const matchesQuery = <Row>(row: Row, spec: FacilitySpec<Row>, q: string) => {
  const needle = q.trim().toLowerCase()
  return needle === '' || spec.haystack(row).some((text) => text.toLowerCase().includes(needle))
}

const matchesType = <Row>(row: Row, spec: FacilitySpec<Row>, type: string) => type === ALL || spec.matchType(row, type)
const matchesStatus = <Row>(row: Row, spec: FacilitySpec<Row>, status: string) => status === ALL || spec.matchStatus(row, status)

/**
 * By name, ignoring case — the API's order is arbitrary — with the id as the tie-break so equal names keep a stable order. **Numbers count as numbers**, so
 * "Pharmacy 2" comes before "Pharmacy 12": essential locations are meant to be bulk-imported, and imported names are full of them.
 */
export const sortByName = <Row extends { id: string; name: string }>(rows: readonly Row[]): Row[] =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id))

/** The rows the two filters and the search leave, by name. Never reorders its input. */
export function filterRows<Row extends { id: string; name: string }>(rows: readonly Row[], spec: FacilitySpec<Row>, filters: FacilityFilters): Row[] {
  return sortByName(rows.filter((row) => matchesType(row, spec, filters.type) && matchesStatus(row, spec, filters.status) && matchesQuery(row, spec, filters.q)))
}

export interface OptionCounts {
  types: Record<string, number>
  statuses: Record<string, number>
}

/**
 * How many rows each pill would show. Each group counts within the search *and the other group's choice*, so a pill never promises rows that the
 * rest of the filter has already hidden — and `ALL` is the count you would get by leaving that group alone.
 */
export function countOptions<Row>(rows: readonly Row[], spec: FacilitySpec<Row>, filters: FacilityFilters): OptionCounts {
  const searched = rows.filter((row) => matchesQuery(row, spec, filters.q))
  const forTypes = searched.filter((row) => matchesStatus(row, spec, filters.status))
  const forStatuses = searched.filter((row) => matchesType(row, spec, filters.type))
  return {
    types: { [ALL]: forTypes.length, ...Object.fromEntries(spec.types.map((option) => [option.value, forTypes.filter((row) => spec.matchType(row, option.value)).length])) },
    statuses: { [ALL]: forStatuses.length, ...Object.fromEntries(spec.statuses.map((option) => [option.value, forStatuses.filter((row) => spec.matchStatus(row, option.value)).length])) },
  }
}

/** Rows read for several regions overlap (a place in a district is also in its province): keep the first copy of each id. */
export function dedupeById<Row extends { id: string }>(rows: readonly Row[]): Row[] {
  const seen = new Set<string>()
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
}

/** "1 shelter", "3 shelters". */
export const countNoun = (count: number, noun: { one: string; many: string }) => `${count.toLocaleString('en-US')} ${count === 1 ? noun.one : noun.many}`

/** Which type and status values are real for each tab — so a `?type=` or `?status=` that is not one of them (a stale link, a hand-edit) reads as "no filter". */
export const TAB_OPTIONS: Record<FacilityTab, { types: readonly string[]; statuses: readonly string[] }> = (() => {
  const shelters = makeShelterSpec(new Map())
  const values = (options: readonly Option[]) => options.map((option) => option.value)
  return {
    shelters: { types: values(shelters.types), statuses: values(shelters.statuses) },
    infrastructure: { types: values(INFRA_SPEC.types), statuses: values(INFRA_SPEC.statuses) },
    essential: { types: values(ESSENTIAL_SPEC.types), statuses: values(ESSENTIAL_SPEC.statuses) },
  }
})()

/** The badge tone for a marker tone — "nobody has said" is the informational blue, as on the map's cards. */
export const BADGE_TONE: Record<Tone, 'safe' | 'caution' | 'critical' | 'info'> = { safe: 'safe', caution: 'caution', critical: 'critical', neutral: 'info' }

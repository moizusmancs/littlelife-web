import { describe, expect, it } from 'vitest'
import { makeEssential, makeInfrastructure, makeShelter } from '@/features/map/testMap'
import {
  ALL,
  DEFAULT_FACILITY_TAB,
  ESSENTIAL_SPEC,
  INFRA_SPEC,
  NO_FILTERS,
  countNoun,
  countOptions,
  dedupeById,
  essentialStatus,
  filterRows,
  makeShelterSpec,
  parseFacilityTab,
  sortByName,
} from './facilityModel'

describe('parseFacilityTab', () => {
  it('accepts the three tabs and falls back to the first for anything else', () => {
    expect(parseFacilityTab('infrastructure')).toBe('infrastructure')
    expect(parseFacilityTab('essential')).toBe('essential')
    expect(parseFacilityTab('shelters')).toBe('shelters')
    expect(parseFacilityTab(null)).toBe(DEFAULT_FACILITY_TAB)
    expect(parseFacilityTab('nope')).toBe(DEFAULT_FACILITY_TAB)
  })
})

describe('infrastructure', () => {
  const rows = [
    makeInfrastructure('a', 'General Hospital', { type: 'hospital', status: 'safe' }),
    makeInfrastructure('b', 'Indus Bridge', { type: 'bridge', status: 'at_risk' }),
    makeInfrastructure('c', 'Grid Station', { type: 'utility', status: 'damaged' }),
    makeInfrastructure('d', 'Civil Hospital', { type: 'hospital', status: 'at_risk' }),
  ]

  it('filters by type and by status, and both together, sorted by name', () => {
    expect(filterRows(rows, INFRA_SPEC, NO_FILTERS).map((r) => r.id)).toEqual(['d', 'a', 'c', 'b'])
    expect(filterRows(rows, INFRA_SPEC, { ...NO_FILTERS, type: 'hospital' }).map((r) => r.id)).toEqual(['d', 'a'])
    expect(filterRows(rows, INFRA_SPEC, { ...NO_FILTERS, status: 'at_risk' }).map((r) => r.id)).toEqual(['d', 'b'])
    expect(filterRows(rows, INFRA_SPEC, { type: 'hospital', status: 'at_risk', q: '' }).map((r) => r.id)).toEqual(['d'])
  })

  it('searches the name, the kind and the status wording, ignoring case', () => {
    expect(filterRows(rows, INFRA_SPEC, { ...NO_FILTERS, q: 'BRIDGE' }).map((r) => r.id)).toEqual(['b'])
    expect(filterRows(rows, INFRA_SPEC, { ...NO_FILTERS, q: 'damaged' }).map((r) => r.id)).toEqual(['c'])
    expect(filterRows(rows, INFRA_SPEC, { ...NO_FILTERS, q: 'civil' }).map((r) => r.id)).toEqual(['d'])
    expect(filterRows(rows, INFRA_SPEC, { ...NO_FILTERS, q: '  ' })).toHaveLength(4)
  })

  it('counts each pill within the search and the other group, so it never promises hidden rows', () => {
    const counts = countOptions(rows, INFRA_SPEC, NO_FILTERS)
    expect(counts.types).toEqual({ [ALL]: 4, hospital: 2, bridge: 1, utility: 1 })
    expect(counts.statuses).toEqual({ [ALL]: 4, safe: 1, at_risk: 2, damaged: 1 })

    const narrowed = countOptions(rows, INFRA_SPEC, { type: 'hospital', status: ALL, q: '' })
    expect(narrowed.statuses).toEqual({ [ALL]: 2, safe: 1, at_risk: 1, damaged: 0 })
    expect(narrowed.types.hospital).toBe(2)

    const byStatus = countOptions(rows, INFRA_SPEC, { type: ALL, status: 'at_risk', q: '' })
    expect(byStatus.types).toEqual({ [ALL]: 2, hospital: 1, bridge: 1, utility: 0 })

    const searched = countOptions(rows, INFRA_SPEC, { ...NO_FILTERS, q: 'hospital' })
    expect(searched.types).toEqual({ [ALL]: 2, hospital: 2, bridge: 0, utility: 0 })
  })
})

describe('essential locations', () => {
  const rows = [
    makeEssential('a', 'Corner Pharmacy', { type: 'pharmacy', current_status: 'open' }),
    makeEssential('b', 'Main ATM', { type: 'atm', current_status: 'closed' }),
    makeEssential('c', 'Bazaar Grocery', { type: 'grocery_store' }),
  ]

  it('reads a place nobody has reported on as "unknown", never open', () => {
    expect(essentialStatus(rows[2])).toBe('unknown')
    expect(essentialStatus(rows[0])).toBe('open')
  })

  it('filters on the reported status, unknown included', () => {
    expect(filterRows(rows, ESSENTIAL_SPEC, { ...NO_FILTERS, status: 'unknown' }).map((r) => r.id)).toEqual(['c'])
    expect(filterRows(rows, ESSENTIAL_SPEC, { ...NO_FILTERS, status: 'closed' }).map((r) => r.id)).toEqual(['b'])
    expect(filterRows(rows, ESSENTIAL_SPEC, { ...NO_FILTERS, type: 'grocery_store' }).map((r) => r.id)).toEqual(['c'])
  })

  it('searches the status wording too', () => {
    expect(filterRows(rows, ESSENTIAL_SPEC, { ...NO_FILTERS, q: 'unknown' }).map((r) => r.id)).toEqual(['c'])
  })

  it('has no Fuel or Water kinds — the API has only three', () => {
    expect(ESSENTIAL_SPEC.types.map((o) => o.label)).toEqual(['ATM', 'Grocery store', 'Pharmacy'])
  })
})

describe('shelters', () => {
  const names = new Map([['n1', 'Al-Khidmat'], ['n2', 'Indus Aid']])
  const spec = makeShelterSpec(names)
  const rows = [
    makeShelter('a', 'Degree College', { managed_by_ngo_id: 'n1', capacity_total: 450, capacity_current: 380 }),
    makeShelter('b', 'Mehar Complex', { managed_by_ngo_id: 'n2', capacity_total: 300, capacity_current: 300 }),
    makeShelter('c', 'Johi Camp', { managed_by_ngo_id: 'n1', type: 'relief_center', status: 'closed', certification_status: 'pending' }),
    makeShelter('d', 'Orphan Hall'),
  ]

  it('uses the NGO list\'s own states, so both screens mean the same by At capacity', () => {
    expect(spec.statuses.map((o) => o.label)).toEqual(['Open', 'Closed', 'At capacity', 'Pending certification'])
    expect(filterRows(rows, spec, { ...NO_FILTERS, status: 'full' }).map((r) => r.id)).toEqual(['b'])
    expect(filterRows(rows, spec, { ...NO_FILTERS, status: 'pending' }).map((r) => r.id)).toEqual(['c'])
    expect(filterRows(rows, spec, { ...NO_FILTERS, type: 'relief_center' }).map((r) => r.id)).toEqual(['c'])
  })

  it('searches by the managing organisation\'s name, which a shelter carries only as an id', () => {
    expect(filterRows(rows, spec, { ...NO_FILTERS, q: 'khidmat' }).map((r) => r.id)).toEqual(['a', 'c'])
    expect(filterRows(rows, spec, { ...NO_FILTERS, q: 'indus' }).map((r) => r.id)).toEqual(['b'])
  })

  it('does not fail on a shelter with no organisation, or one whose name has not loaded', () => {
    expect(filterRows(rows, makeShelterSpec(new Map()), { ...NO_FILTERS, q: 'khidmat' })).toEqual([])
    expect(filterRows(rows, spec, { ...NO_FILTERS, q: 'orphan' }).map((r) => r.id)).toEqual(['d'])
  })
})

describe('helpers', () => {
  it('sorts by name ignoring case with a stable id tie-break, without touching the input', () => {
    const input = [makeShelter('z', 'same'), makeShelter('m', 'Same'), makeShelter('a', 'Alpha')]
    expect(sortByName(input).map((r) => r.id)).toEqual(['a', 'm', 'z'])
    expect(input.map((r) => r.id)).toEqual(['z', 'm', 'a'])
  })

  it('sorts numbers in a name as numbers — "Pharmacy 2" before "Pharmacy 12"', () => {
    const input = [makeShelter('a', 'Pharmacy 12'), makeShelter('b', 'Pharmacy 2'), makeShelter('c', 'Pharmacy 100'), makeShelter('d', 'Pharmacy 1')]
    expect(sortByName(input).map((r) => r.name)).toEqual(['Pharmacy 1', 'Pharmacy 2', 'Pharmacy 12', 'Pharmacy 100'])
  })

  it('keeps the first copy of a row that came back for two regions', () => {
    const rows = [makeShelter('a', 'First'), makeShelter('b', 'B'), makeShelter('a', 'Second')]
    expect(dedupeById(rows).map((r) => r.name)).toEqual(['First', 'B'])
  })

  it('counts with the right noun', () => {
    expect(countNoun(1, { one: 'shelter', many: 'shelters' })).toBe('1 shelter')
    expect(countNoun(1234, { one: 'shelter', many: 'shelters' })).toBe('1,234 shelters')
    expect(countNoun(0, INFRA_SPEC.noun)).toBe('0 infrastructure items')
  })
})

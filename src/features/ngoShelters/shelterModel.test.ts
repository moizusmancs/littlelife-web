import { describe, expect, it } from 'vitest'
import { makeShelter } from '@/features/map/testMap'
import { checkOccupancy, countByFilter, filterShelters, isFull, matchesFilter, matchesSearch, shelterTotals, sortShelters, stepOccupancy } from './shelterModel'

const list = [
  makeShelter('a', 'Degree College', { capacity_total: 450, capacity_current: 412 }),
  makeShelter('b', 'mehar sports complex', { capacity_total: 300, capacity_current: 300 }),
  makeShelter('c', 'GBHS Johi', { capacity_total: 200, capacity_current: 20, status: 'closed', certification_status: 'pending' }),
  makeShelter('d', 'Relief camp Sehwan', { type: 'relief_center', capacity_total: 100, capacity_current: 0, certification_status: 'uncertified' }),
]

describe('isFull', () => {
  it('is true at exactly the capacity and above it, false below', () => {
    expect(isFull({ capacity_current: 300, capacity_total: 300 })).toBe(true)
    expect(isFull({ capacity_current: 301, capacity_total: 300 })).toBe(true)
    expect(isFull({ capacity_current: 299, capacity_total: 300 })).toBe(false)
  })

  it('is never true for a shelter with no capacity recorded', () => {
    expect(isFull({ capacity_current: 0, capacity_total: 0 })).toBe(false)
  })
})

describe('matchesFilter', () => {
  it('splits by status, fullness and certification', () => {
    const by = (filter: Parameters<typeof matchesFilter>[1]) => list.filter((s) => matchesFilter(s, filter)).map((s) => s.id)
    expect(by('all')).toEqual(['a', 'b', 'c', 'd'])
    expect(by('open')).toEqual(['a', 'b', 'd'])
    expect(by('closed')).toEqual(['c'])
    expect(by('full')).toEqual(['b'])
    expect(by('pending')).toEqual(['c'])
  })
})

describe('matchesSearch', () => {
  it('finds by name, kind, status and certification wording, ignoring case', () => {
    expect(matchesSearch(list[0], 'DEGREE')).toBe(true)
    expect(matchesSearch(list[3], 'relief center')).toBe(true)
    expect(matchesSearch(list[2], 'closed')).toBe(true)
    expect(matchesSearch(list[2], 'pending cert')).toBe(true)
    expect(matchesSearch(list[0], 'sehwan')).toBe(false)
  })

  it('matches everything for an empty or blank search', () => {
    expect(matchesSearch(list[0], '')).toBe(true)
    expect(matchesSearch(list[0], '   ')).toBe(true)
  })
})

describe('sortShelters / filterShelters', () => {
  it('sorts by name ignoring case, without touching the input', () => {
    const input = [...list]
    expect(sortShelters(input).map((s) => s.name)).toEqual(['Degree College', 'GBHS Johi', 'mehar sports complex', 'Relief camp Sehwan'])
    expect(input.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('breaks a name tie by id so the order is stable', () => {
    const twins = [makeShelter('z', 'Same'), makeShelter('m', 'Same')]
    expect(sortShelters(twins).map((s) => s.id)).toEqual(['m', 'z'])
  })

  it('applies filter and search together, sorted', () => {
    expect(filterShelters(list, { filter: 'open', q: '' }).map((s) => s.id)).toEqual(['a', 'b', 'd'])
    expect(filterShelters(list, { filter: 'open', q: 'camp' }).map((s) => s.id)).toEqual(['d'])
    expect(filterShelters(list, { filter: 'closed', q: 'camp' })).toEqual([])
  })
})

describe('countByFilter', () => {
  it('counts each filter', () => {
    expect(countByFilter(list)).toEqual({ all: 4, open: 3, closed: 1, full: 1, pending: 1 })
  })

  it('counts within the current search, so a pill never promises hidden rows', () => {
    expect(countByFilter(list, 'relief')).toEqual({ all: 1, open: 1, closed: 0, full: 0, pending: 0 })
  })
})

describe('shelterTotals', () => {
  it('adds up capacity and occupancy and counts the ones needing attention', () => {
    expect(shelterTotals(list)).toEqual({ registered: 4, capacity: 1050, occupied: 732, percent: 70, full: 1, pendingCertification: 1, closed: 1 })
  })

  it('is all zeros, with no NaN, for none', () => {
    expect(shelterTotals([])).toEqual({ registered: 0, capacity: 0, occupied: 0, percent: 0, full: 0, pendingCertification: 0, closed: 0 })
  })
})

describe('checkOccupancy', () => {
  const shelter = { capacity_current: 380, capacity_total: 450 }

  it('reads a number in range with its share of capacity and whether it changed', () => {
    expect(checkOccupancy('412', shelter)).toEqual({ ok: true, value: 412, percent: 92, changed: true })
    expect(checkOccupancy(' 380 ', shelter)).toEqual({ ok: true, value: 380, percent: 84, changed: false })
  })

  it('accepts zero and exactly the capacity — the two ends of what the API takes', () => {
    expect(checkOccupancy('0', shelter)).toMatchObject({ ok: true, value: 0, percent: 0 })
    expect(checkOccupancy('450', shelter)).toMatchObject({ ok: true, value: 450, percent: 100 })
  })

  it('refuses more than the capacity, saying what it is', () => {
    expect(checkOccupancy('451', shelter)).toEqual({ ok: false, message: "It can't be more than the shelter's capacity of 450." })
  })

  it('refuses empty, negative, fractional and non-numeric text', () => {
    for (const text of ['', '  ', '-1', '3.5', '12a', 'abc', '1e3']) {
      expect(checkOccupancy(text, shelter).ok).toBe(false)
    }
    expect(checkOccupancy('', shelter)).toEqual({ ok: false, message: 'Enter how many people are there now.' })
    expect(checkOccupancy('3.5', shelter)).toEqual({ ok: false, message: 'Use a whole number, like 87.' })
  })
})

describe('stepOccupancy', () => {
  const shelter = { capacity_current: 380, capacity_total: 450 }

  it('moves one person from what is typed', () => {
    expect(stepOccupancy('412', shelter, 1)).toBe('413')
    expect(stepOccupancy('412', shelter, -1)).toBe('411')
  })

  it('stays between zero and the capacity', () => {
    expect(stepOccupancy('0', shelter, -1)).toBe('0')
    expect(stepOccupancy('450', shelter, 1)).toBe('450')
  })

  it('starts from the stored value when the text is not a number', () => {
    expect(stepOccupancy('', shelter, 1)).toBe('381')
    expect(stepOccupancy('abc', shelter, -1)).toBe('379')
  })
})

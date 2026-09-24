import { describe, expect, it } from 'vitest'
import { essentialPlace, infrastructurePlace, shelterPlace } from '@/features/map/mapModel'
import { makeEssential, makeInfrastructure, makeShelter } from '@/features/map/testMap'
import { categoryOf, countByCategory, isLocalResource, matchesCategory, navigateHref, sortLocal, tabFromParam } from './localResources'

const shelter = shelterPlace(makeShelter('s1', 'Zebra Hall', { location: { type: 'Point', coordinates: [68.86, 27.7] } }))
const pharmacy = essentialPlace(makeEssential('e1', 'alpha Pharmacy', { type: 'pharmacy', location: { type: 'Point', coordinates: [68.9, 27.75] } }))
const grocery = essentialPlace(makeEssential('e2', 'Bilal Grocery', { type: 'grocery_store', location: { type: 'Point', coordinates: [68.87, 27.71] } }))
const atm = essentialPlace(makeEssential('e3', 'City ATM', { type: 'atm', location: { type: 'Point', coordinates: [69.5, 28.2] } }))
const hospital = infrastructurePlace(makeInfrastructure('i1', 'General Hospital'))

describe('categories', () => {
  it('puts a shelter under Shelters and an essential location under its own type — and infrastructure nowhere', () => {
    expect(categoryOf(shelter)).toBe('shelters')
    expect(categoryOf(pharmacy)).toBe('pharmacy')
    expect(categoryOf(grocery)).toBe('grocery_store')
    expect(categoryOf(atm)).toBe('atm')
    expect(categoryOf(hospital)).toBeNull()
    expect(isLocalResource(hospital)).toBe(false)
  })

  it('matches a place to a chip: All takes every local resource but not infrastructure, a kind takes only its own', () => {
    expect(matchesCategory(shelter, 'all')).toBe(true)
    expect(matchesCategory(hospital, 'all')).toBe(false)
    expect(matchesCategory(pharmacy, 'pharmacy')).toBe(true)
    expect(matchesCategory(pharmacy, 'atm')).toBe(false)
    expect(matchesCategory(shelter, 'shelters')).toBe(true)
  })

  it('counts each chip, with All the total of the rest', () => {
    expect(countByCategory([shelter, pharmacy, grocery, atm, hospital])).toEqual({ all: 4, shelters: 1, pharmacy: 1, grocery_store: 1, atm: 1 })
    expect(countByCategory([])).toEqual({ all: 0, shelters: 0, pharmacy: 0, grocery_store: 0, atm: 0 })
  })
})

describe('sortLocal', () => {
  it('sorts by name, ignoring case, when the visitor’s position is unknown', () => {
    expect(sortLocal([shelter, atm, grocery, pharmacy], null).map((p) => p.name)).toEqual(['alpha Pharmacy', 'Bilal Grocery', 'City ATM', 'Zebra Hall'])
  })

  it('puts the nearest first once there is a position, breaking ties by name', () => {
    const from: [number, number] = [27.7, 68.86] // right on the shelter
    expect(sortLocal([atm, pharmacy, grocery, shelter], from).map((p) => p.name)).toEqual(['Zebra Hall', 'Bilal Grocery', 'alpha Pharmacy', 'City ATM'])
    const twin = essentialPlace(makeEssential('e9', 'Another', { type: 'pharmacy', location: { type: 'Point', coordinates: [68.86, 27.7] } }))
    expect(sortLocal([shelter, twin], from).map((p) => p.name)).toEqual(['Another', 'Zebra Hall'])
  })

  it('does not reorder its input', () => {
    const input = [shelter, atm, pharmacy]
    sortLocal(input, null)
    expect(input.map((p) => p.name)).toEqual(['Zebra Hall', 'City ATM', 'alpha Pharmacy'])
  })
})

describe('navigateHref', () => {
  it('sends a shelter by id and any other place by its coordinates, latitude first', () => {
    expect(navigateHref(shelter)).toBe('/app/navigate?destination_shelter_id=s1')
    expect(navigateHref(pharmacy)).toBe('/app/navigate?destination=27.75,68.9')
  })
})

describe('tabFromParam', () => {
  it('reads the four tabs, accepts the detail pages’ spelling of Missing persons, and falls back to Local', () => {
    expect(tabFromParam('aid')).toBe('aid')
    expect(tabFromParam('campaigns')).toBe('campaigns')
    expect(tabFromParam('missing')).toBe('missing')
    expect(tabFromParam('missing-persons')).toBe('missing')
    expect(tabFromParam('local')).toBe('local')
    expect(tabFromParam(null)).toBe('local')
    expect(tabFromParam('nonsense')).toBe('local')
  })
})

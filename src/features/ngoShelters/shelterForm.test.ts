import { describe, expect, it } from 'vitest'
import { MAX_SHELTER_CAPACITY } from '@/api/facilities'
import { EMPTY_SHELTER_FORM, registerShelterSchema, shelterChanges, toRegisterInput, type RegisterShelterFormValues } from './shelterForm'

const valid: RegisterShelterFormValues = { name: 'Community Center', type: 'shelter', capacity: '200', latitude: '24.9', longitude: '67.1' }

const issues = (values: Partial<RegisterShelterFormValues>) => {
  const result = registerShelterSchema.safeParse({ ...valid, ...values })
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]))
}

describe('registerShelterSchema', () => {
  it('accepts a complete form', () => {
    expect(registerShelterSchema.safeParse(valid).success).toBe(true)
  })

  it('names every empty field at once', () => {
    expect(issues(EMPTY_SHELTER_FORM)).toEqual({
      name: 'Enter the name of the shelter.',
      capacity: 'Enter how many people it can hold.',
      latitude: 'Enter the latitude, or click the map.',
      longitude: 'Enter the longitude, or click the map.',
    })
  })

  it('treats a blank name as missing', () => {
    expect(issues({ name: '   ' }).name).toBe('Enter the name of the shelter.')
  })

  it('refuses a capacity that is zero, negative, fractional or not a number — the API rejects the first three and would 500 on none of them', () => {
    expect(issues({ capacity: '0' }).capacity).toBe('It has to hold at least one person.')
    expect(issues({ capacity: '-5' }).capacity).toBe('Use a whole number, like 200.')
    expect(issues({ capacity: '10.5' }).capacity).toBe('Use a whole number, like 200.')
    expect(issues({ capacity: 'lots' }).capacity).toBe('Use a whole number, like 200.')
  })

  it('accepts the largest capacity the API stores and refuses one more (a bare 500 there)', () => {
    expect(issues({ capacity: String(MAX_SHELTER_CAPACITY) }).capacity).toBeUndefined()
    expect(issues({ capacity: String(MAX_SHELTER_CAPACITY + 1) }).capacity).toBe('The largest capacity is 2,147,483,647.')
  })

  it('refuses coordinates outside the globe, which the API stores without complaint', () => {
    // 120 couldn't be a latitude either, so this isn't a swap — just out of range.
    expect(issues({ latitude: '95', longitude: '120' }).latitude).toBe('Latitude is between −90 and 90.')
    expect(issues({ longitude: '200' }).longitude).toBe('Longitude is between −180 and 180.')
    expect(issues({ latitude: 'north' }).latitude).toBe('The latitude has to be a number, like 24.8607.')
    expect(issues({ longitude: 'east' }).longitude).toBe('The longitude has to be a number, like 67.0011.')
  })

  it('says the two may be swapped when a latitude is over 90 but would be a fine longitude', () => {
    expect(issues({ latitude: '120', longitude: '30' }).latitude).toBe('Latitude is between −90 and 90. The two may be the wrong way round.')
  })

  it('accepts the extremes, which are real places', () => {
    expect(issues({ latitude: '90', longitude: '-180' })).toEqual({})
  })
})

describe('toRegisterInput', () => {
  it('builds the request with GeoJSON order — longitude first — and trims the name', () => {
    expect(toRegisterInput({ ...valid, name: '  Community Center  ' })).toEqual({
      name: 'Community Center',
      type: 'shelter',
      location: { type: 'Point', coordinates: [67.1, 24.9] },
      capacityTotal: 200,
    })
  })

  it('refuses coordinates the schema would have refused', () => {
    expect(() => toRegisterInput({ ...valid, latitude: '' })).toThrow()
  })
})

describe('shelterChanges', () => {
  const stored = { status: 'open', certification_status: 'pending' } as const

  it('is empty when nothing changed, so no request is made', () => {
    expect(shelterChanges(stored, { status: 'open', certification: 'pending' })).toEqual({})
  })

  it('carries only the field that changed', () => {
    expect(shelterChanges(stored, { status: 'closed', certification: 'pending' })).toEqual({ status: 'closed' })
    expect(shelterChanges(stored, { status: 'open', certification: 'certified' })).toEqual({ certification_status: 'certified' })
  })

  it('carries both when both changed', () => {
    expect(shelterChanges(stored, { status: 'closed', certification: 'uncertified' })).toEqual({ status: 'closed', certification_status: 'uncertified' })
  })
})

import { describe, expect, it } from 'vitest'
import { ADDABLE_TYPES, EMPTY_FACILITY_FORM, facilityFormSchema, toEssentialInput, toInfrastructureInput, type FacilityFormValues } from './facilityForm'

const valid: FacilityFormValues = { name: 'General Hospital', type: 'hospital', latitude: '24.86', longitude: '67.05' }

const issues = (kind: 'infrastructure' | 'essential', values: Partial<FacilityFormValues>) => {
  const result = facilityFormSchema(kind).safeParse({ ...valid, ...values })
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]))
}

describe('facilityFormSchema', () => {
  it('accepts a complete infrastructure form', () => {
    expect(facilityFormSchema('infrastructure').safeParse(valid).success).toBe(true)
  })

  it('names every empty field at once', () => {
    expect(issues('infrastructure', { name: '', latitude: '', longitude: '' })).toEqual({
      name: 'Enter the name.',
      latitude: 'Enter the latitude, or click the map.',
      longitude: 'Enter the longitude, or click the map.',
    })
    expect(issues('infrastructure', { name: '   ' }).name).toBe('Enter the name.')
  })

  it('knows each kind\'s own types — a pharmacy is not infrastructure and a bridge is not an essential location', () => {
    expect(issues('infrastructure', { type: 'pharmacy' }).type).toBe('Choose a type.')
    expect(issues('essential', { type: 'bridge' }).type).toBe('Choose a type.')
    expect(issues('essential', { type: 'pharmacy' }).type).toBeUndefined()
    expect(issues('infrastructure', { type: 'utility' }).type).toBeUndefined()
  })

  it('refuses coordinates the API would store without complaint', () => {
    expect(issues('infrastructure', { longitude: '200' }).longitude).toBe('Longitude is between −180 and 180.')
    expect(issues('essential', { latitude: '120', longitude: '30', type: 'atm' }).latitude).toContain('wrong way round')
  })

  it('offers only three kinds of essential location — no fuel, no water', () => {
    expect(ADDABLE_TYPES.essential).toEqual(['atm', 'grocery_store', 'pharmacy'])
    expect(ADDABLE_TYPES.infrastructure).toEqual(['hospital', 'bridge', 'utility'])
  })
})

describe('EMPTY_FACILITY_FORM', () => {
  it('starts on each kind\'s first type with no point', () => {
    expect(EMPTY_FACILITY_FORM('infrastructure')).toEqual({ name: '', type: 'hospital', latitude: '', longitude: '' })
    expect(EMPTY_FACILITY_FORM('essential')).toEqual({ name: '', type: 'atm', latitude: '', longitude: '' })
  })
})

describe('the requests', () => {
  it('builds them with the name trimmed and the point in GeoJSON order — and never a status', () => {
    expect(toInfrastructureInput({ ...valid, name: '  Indus Bridge ', type: 'bridge' })).toEqual({ name: 'Indus Bridge', type: 'bridge', location: { type: 'Point', coordinates: [67.05, 24.86] } })
    expect(toEssentialInput({ ...valid, type: 'pharmacy' })).toEqual({ name: 'General Hospital', type: 'pharmacy', location: { type: 'Point', coordinates: [67.05, 24.86] } })
  })
})

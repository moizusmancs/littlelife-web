import { describe, expect, it, vi } from 'vitest'
import { addPointIssues, formatCoordinate, pointWriter, readPosition, toPointGeometry } from './pointForm'

const issuesFor = (latitude: string, longitude: string) => {
  const found: Record<string, string> = {}
  addPointIssues({ latitude, longitude }, { addIssue: (issue) => void (found[issue.path[0]] = issue.message) })
  return found
}

describe('readPosition', () => {
  it('reads a valid pair as [lat, lng]', () => {
    expect(readPosition('24.9', '67.1')).toEqual([24.9, 67.1])
    expect(readPosition(' -33.5 ', ' 151 ')).toEqual([-33.5, 151])
  })

  it('is null while either is empty, not a number, or off the globe', () => {
    expect(readPosition('', '67.1')).toBeNull()
    expect(readPosition('24.9', '')).toBeNull()
    expect(readPosition('abc', '67.1')).toBeNull()
    expect(readPosition('91', '67.1')).toBeNull()
    expect(readPosition('24.9', '181')).toBeNull()
  })
})

describe('formatCoordinate', () => {
  it('keeps about a metre of precision and drops trailing zeros', () => {
    expect(formatCoordinate(24.9)).toBe('24.9')
    expect(formatCoordinate(67.123456789)).toBe('67.123457')
    expect(formatCoordinate(-0.0000001)).toBe('0')
  })
})

describe('addPointIssues', () => {
  it('finds nothing wrong with a real point, extremes included', () => {
    expect(issuesFor('24.9', '67.1')).toEqual({})
    expect(issuesFor('90', '-180')).toEqual({})
  })

  it('names both fields when they are empty', () => {
    expect(issuesFor('', '')).toEqual({ latitude: 'Enter the latitude, or click the map.', longitude: 'Enter the longitude, or click the map.' })
  })

  it('refuses what is not a number', () => {
    expect(issuesFor('north', '67.1').latitude).toBe('The latitude has to be a number, like 24.8607.')
    expect(issuesFor('24.9', 'east').longitude).toBe('The longitude has to be a number, like 67.0011.')
    expect(issuesFor('24,86', '67.1').latitude).toBe('The latitude has to be a number, like 24.8607.')
  })

  it('refuses coordinates off the globe — which the API stores without complaint', () => {
    expect(issuesFor('95', '120').latitude).toBe('Latitude is between −90 and 90.')
    expect(issuesFor('24.9', '200').longitude).toBe('Longitude is between −180 and 180.')
  })

  it('says the two may be swapped when a "latitude" is over 90 but would be a fine longitude', () => {
    expect(issuesFor('120', '30').latitude).toBe('Latitude is between −90 and 90. The two may be the wrong way round.')
    expect(issuesFor('95', '67.1').latitude).toContain('wrong way round')
  })
})

describe('toPointGeometry', () => {
  it('builds a GeoJSON point — longitude first', () => {
    expect(toPointGeometry({ latitude: '24.9', longitude: '67.1' })).toEqual({ type: 'Point', coordinates: [67.1, 24.9] })
  })

  it('refuses a form that did not pass its schema', () => {
    expect(() => toPointGeometry({ latitude: '', longitude: '67.1' })).toThrow()
  })
})

describe('pointWriter', () => {
  it('writes both fields, rounded, marking them dirty and validating', () => {
    const setValue = vi.fn()
    pointWriter(setValue)([24.9000004, 67.123456789])
    expect(setValue).toHaveBeenCalledWith('latitude', '24.9', { shouldDirty: true, shouldValidate: true })
    expect(setValue).toHaveBeenCalledWith('longitude', '67.123457', { shouldDirty: true, shouldValidate: true })
  })
})

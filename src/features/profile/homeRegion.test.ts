import { describe, expect, it } from 'vitest'
import { homeRegionLabel } from './homeRegion'

describe('homeRegionLabel', () => {
  it('shows a tehsil as "itself, its parent" — from the path alone, no region list needed', () => {
    expect(homeRegionLabel({ home_region_name: 'Sukkur City', home_region_path: 'Sindh › Sukkur › Sukkur City' })).toBe('Sukkur City, Sukkur')
  })

  it('shows a district with its province', () => {
    expect(homeRegionLabel({ home_region_name: 'Sukkur', home_region_path: 'Sindh › Sukkur' })).toBe('Sukkur, Sindh')
  })

  it('shows a province as just its name', () => {
    expect(homeRegionLabel({ home_region_name: 'Sindh', home_region_path: 'Sindh' })).toBe('Sindh')
  })

  it('falls back to the name when there is no path, and to nothing when no region is set (the keys are omitted)', () => {
    expect(homeRegionLabel({ home_region_name: 'Sukkur' })).toBe('Sukkur')
    expect(homeRegionLabel({})).toBeNull()
  })

  it('copes with a region name that itself contains punctuation', () => {
    expect(homeRegionLabel({ home_region_path: 'Khyber Pakhtunkhwa › Dera Ismail Khan › D.I. Khan City' })).toBe('D.I. Khan City, Dera Ismail Khan')
  })
})

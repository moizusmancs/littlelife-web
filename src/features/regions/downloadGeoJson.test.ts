import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseBoundary } from './geojson'
import { boundaryFeature, downloadBoundary, geoJsonFileName } from './downloadGeoJson'
import { makeRegion } from './testRegion'

describe('geoJsonFileName', () => {
  it('slugs the name and adds the extension', () => {
    expect(geoJsonFileName({ name: 'Sukkur City' })).toBe('sukkur-city.geojson')
    expect(geoJsonFileName({ name: '  Dera Ghazi Khan (Tehsil) ' })).toBe('dera-ghazi-khan-tehsil.geojson')
  })

  it('keeps non-Latin letters and falls back when nothing usable is left', () => {
    expect(geoJsonFileName({ name: 'کراچی' })).toBe('کراچی.geojson')
    expect(geoJsonFileName({ name: '---' })).toBe('region.geojson')
  })
})

describe('boundaryFeature', () => {
  it('wraps the boundary as a Feature the upload field can read straight back', () => {
    const region = makeRegion('r', 'Sukkur', 'district', 'sindh')
    const feature = boundaryFeature(region)
    expect(feature).toMatchObject({ type: 'Feature', properties: { name: 'Sukkur', level: 'district' } })
    const parsed = parseBoundary(JSON.stringify(feature))
    expect(parsed.ok).toBe(true)
  })
})

describe('downloadBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('saves a .geojson file named after the region and releases the object URL', async () => {
    const create = vi.fn(() => 'blob:fake')
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
    const clicked: Array<{ href: string; download: string }> = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download })
    })

    downloadBoundary(makeRegion('r', 'Sukkur City', 'tehsil', 'sukkur'))

    expect(clicked).toEqual([{ href: 'blob:fake', download: 'sukkur-city.geojson' }])
    expect(revoke).toHaveBeenCalledWith('blob:fake')
    const blob = create.mock.calls[0] as unknown as [Blob]
    expect(JSON.parse(await blob[0].text())).toMatchObject({ type: 'Feature', geometry: { type: 'Polygon' } })
    expect(document.querySelector('a[download]')).toBeNull()
  })
})

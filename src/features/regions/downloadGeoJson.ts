import type { Region } from '@/api/geo'

/** A filesystem-safe name for the download: "Sukkur City" → "sukkur-city.geojson". */
export function geoJsonFileName(region: Pick<Region, 'name'>): string {
  const slug = region.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'region'}.geojson`
}

/** The boundary as a one-feature GeoJSON document — the shape most tools export, which the form's upload reads back. */
export function boundaryFeature(region: Pick<Region, 'name' | 'level' | 'boundary'>) {
  return { type: 'Feature', properties: { name: region.name, level: region.level }, geometry: region.boundary }
}

/** Saves a region's boundary to the user's machine as a `.geojson` file. */
export function downloadBoundary(region: Pick<Region, 'name' | 'level' | 'boundary'>) {
  const blob = new Blob([JSON.stringify(boundaryFeature(region), null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = geoJsonFileName(region)
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

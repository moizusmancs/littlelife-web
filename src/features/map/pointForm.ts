import type { UseFormSetValue } from 'react-hook-form'
import type { PointGeometry } from '@/api/facilities'
import type { LatLng } from './mapGeo'

/** The two fields any form that chooses a point on the map shares. They are typed text — a number input would let `e` and `-` through and hide what was actually typed. */
export interface PointFormValues {
  latitude: string
  longitude: string
}

const readNumber = (text: string): number | null => {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/**
 * A pair of typed coordinates as a position, or `null` while either is empty, not a number or outside the globe. This is the
 * one place that decides "is there a point yet" — the map's pin and the region note both follow it.
 */
export function readPosition(latitude: string, longitude: string): LatLng | null {
  const lat = readNumber(latitude)
  const lng = readNumber(longitude)
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return [lat, lng]
}

/** Coordinates as the form fields hold them: enough decimals to be about a metre, none of the trailing zeros. */
export const formatCoordinate = (value: number) => String(Number(value.toFixed(6)))

/** What a schema's `superRefine` hands us — only the part this file uses. */
interface IssueSink {
  addIssue: (issue: { code: 'custom'; path: string[]; message: string }) => void
}

/**
 * The coordinate rules, for any form's `superRefine`. **The API checks none of them** — longitude 200, latitude 95 and a swapped pair are all
 * `201` for shelters, infrastructure and essential locations alike — so this is the only line of defence. When a "latitude" is beyond 90
 * but would be a fine longitude, the message says they may be swapped, because that is the mistake it almost always is.
 */
export function addPointIssues(values: PointFormValues, ctx: IssueSink) {
  const lat = readNumber(values.latitude)
  const lng = readNumber(values.longitude)
  if (values.latitude.trim() === '') ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Enter the latitude, or click the map.' })
  else if (lat === null) ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'The latitude has to be a number, like 24.8607.' })
  else if (Math.abs(lat) > 90) {
    const swapped = lng !== null && Math.abs(lng) <= 90 && Math.abs(lat) <= 180
    ctx.addIssue({
      code: 'custom',
      path: ['latitude'],
      message: swapped ? 'Latitude is between −90 and 90. The two may be the wrong way round.' : 'Latitude is between −90 and 90.',
    })
  }
  if (values.longitude.trim() === '') ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Enter the longitude, or click the map.' })
  else if (lng === null) ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'The longitude has to be a number, like 67.0011.' })
  else if (Math.abs(lng) > 180) ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Longitude is between −180 and 180.' })
}

/** What a form says, under the coordinates, when someone tries to save a point that no region covers — nothing could ever show them the place. */
export const OUTSIDE_AREAS_MESSAGE = 'Pick a spot inside a shaded area of the map.'

/** The GeoJSON point for a form that passed its schema — `[longitude, latitude]`, the reverse of Leaflet's order. */
export function toPointGeometry(values: PointFormValues): PointGeometry {
  const position = readPosition(values.latitude, values.longitude)
  if (!position) throw new Error('toPointGeometry needs coordinates that passed the form schema')
  return { type: 'Point', coordinates: [position[1], position[0]] }
}

/** Writes a position into a form's two coordinate fields — what a click or drag on the map, or a fix from the browser, does. */
export function pointWriter<T extends PointFormValues>(setValue: UseFormSetValue<T>) {
  const set = setValue as unknown as UseFormSetValue<PointFormValues>
  return ([lat, lng]: LatLng) => {
    set('latitude', formatCoordinate(lat), { shouldDirty: true, shouldValidate: true })
    set('longitude', formatCoordinate(lng), { shouldDirty: true, shouldValidate: true })
  }
}

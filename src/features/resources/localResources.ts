import { distanceMeters, type LatLng } from '@/features/map/mapGeo'
import type { MapPlace } from '@/features/map/mapModel'

/**
 * The categories on the Local Resources tab. The design also lists **Fuel** and **Water**, but the API knows only three kinds of
 * essential location (ATM, grocery store, pharmacy) — there is nothing to list under those two, so they are not offered. Shelters are
 * here as well: the hub's mockup shows nearby shelters, and they are the most useful place on the list.
 */
export type LocalCategory = 'all' | 'shelters' | 'pharmacy' | 'grocery_store' | 'atm'

export const LOCAL_CATEGORIES: ReadonlyArray<{ id: LocalCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'shelters', label: 'Shelters' },
  { id: 'pharmacy', label: 'Pharmacies' },
  { id: 'grocery_store', label: 'Grocery stores' },
  { id: 'atm', label: 'ATMs' },
]

/** Which category a place belongs to — a shelter is `shelters`, an essential location its own type. Infrastructure has none. */
export function categoryOf(place: MapPlace): Exclude<LocalCategory, 'all'> | null {
  if (place.kind === 'shelter') return 'shelters'
  if (place.kind === 'essential') return place.data.type
  return null
}

/** Whether a place is on the list at all: shelters and essential locations only. */
export const isLocalResource = (place: MapPlace) => categoryOf(place) !== null

export const matchesCategory = (place: MapPlace, category: LocalCategory) => (category === 'all' ? isLocalResource(place) : categoryOf(place) === category)

/** How many places each category holds — shown on its chip, so an empty one is known before it is pressed. */
export function countByCategory(places: readonly MapPlace[]): Record<LocalCategory, number> {
  const counts: Record<LocalCategory, number> = { all: 0, shelters: 0, pharmacy: 0, grocery_store: 0, atm: 0 }
  for (const place of places) {
    const category = categoryOf(place)
    if (category) {
      counts[category] += 1
      counts.all += 1
    }
  }
  return counts
}

/**
 * The order of the list: nearest first once the visitor has said where they are, otherwise by name. Never reorders its input, and ties
 * (and places with the same name) keep a stable order.
 */
export function sortLocal(places: readonly MapPlace[], from: LatLng | null): MapPlace[] {
  const byName = (a: MapPlace, b: MapPlace) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.key.localeCompare(b.key)
  if (!from) return [...places].sort(byName)
  const distance = new Map(places.map((place) => [place.key, distanceMeters(from, place.position)]))
  return [...places].sort((a, b) => (distance.get(a.key) as number) - (distance.get(b.key) as number) || byName(a, b))
}

/** Where "Navigate" leads for a place: the route planner (Phase 7) with the shelter by id, or any other place by its coordinates. */
export function navigateHref(place: MapPlace): string {
  return place.kind === 'shelter' ? `/app/navigate?destination_shelter_id=${place.id}` : `/app/navigate?destination=${place.position[0]},${place.position[1]}`
}

/** The tabs of the Resources hub, in the order the design gives them. The query value for Missing Persons is `missing`. */
export type ResourcesTab = 'local' | 'aid' | 'campaigns' | 'missing'

export const RESOURCE_TABS: ReadonlyArray<{ id: ResourcesTab; label: string }> = [
  { id: 'local', label: 'Local resources' },
  { id: 'aid', label: 'Aid requests' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'missing', label: 'Missing persons' },
]

/** The tab named by `?tab=` — `missing-persons` is accepted as the detail pages' back links spell it — and Local for anything else. */
export function tabFromParam(value: string | null): ResourcesTab {
  if (value === 'missing-persons') return 'missing'
  return RESOURCE_TABS.some((tab) => tab.id === value) ? (value as ResourcesTab) : 'local'
}

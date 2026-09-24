import { cn } from '@/lib/utils'
import { formatDistance } from './mapGeo'
import type { MapPlace } from './mapModel'
import { TONE_COLOR } from './placeIcon'

export interface PlaceResultsProps {
  places: readonly MapPlace[]
  selectedKey: string | null
  /** Metres from the viewer to a place, when their location is known. */
  distanceOf: (place: MapPlace) => number | null
  onSelect: (place: MapPlace) => void
}

/** The places matching the search, as buttons: name, what and how far, and a dot in the status colour. Purely presentational. */
export function PlaceResults({ places, selectedKey, distanceOf, onSelect }: PlaceResultsProps) {
  return (
    <section aria-labelledby="results-heading">
      <div className="flex items-center gap-2 px-5 pt-3.5 pb-2">
        <h2 id="results-heading" className="font-body text-[11px] font-bold tracking-wider text-ink-500 uppercase">
          Places matching your search
        </h2>
        <span className="rounded-full bg-primary-50 px-1.75 py-px font-body text-[11px] font-semibold text-primary-700">{places.length}</span>
      </div>
      {places.length === 0 ? (
        <p className="px-5 pb-4 font-body text-body-sm text-ink-500">Nothing matches. Only places on the layers that are switched on are searched.</p>
      ) : (
        <ul>
          {places.map((place) => {
            const distance = distanceOf(place)
            return (
              <li key={place.key}>
                <button
                  type="button"
                  onClick={() => onSelect(place)}
                  aria-current={place.key === selectedKey ? 'true' : undefined}
                  className={cn('flex w-full items-center gap-3 border-b border-surface-border px-5 py-2.5 text-start hover:bg-surface-sunken', place.key === selectedKey && 'bg-primary-50')}
                >
                  <span className="size-2.5 flex-none rounded-full" style={{ background: TONE_COLOR[place.tone] }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-body-sm font-semibold text-ink-900">{place.name}</span>
                    <span className="block font-body text-[11px] text-ink-500">
                      {[place.typeLabel, place.statusLabel, distance !== null ? formatDistance(distance) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

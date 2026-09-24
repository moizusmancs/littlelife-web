import type { ReportedStatus } from '@/api/facilities'
import type { MapPlace } from '@/features/map/mapModel'
import { Button } from '@/components/ui/button'
import { LocalResourceRow } from './LocalResourceRow'

export interface LocalResourceListProps {
  /** The places to show, already filtered and in order. */
  places: readonly MapPlace[]
  /** How many of them there are in all, when `places` is only the first few. */
  total: number
  distanceOf: (place: MapPlace) => number | null
  reportingBusy: boolean
  onReport: (place: MapPlace, status: ReportedStatus) => void
  onShowMore: () => void
}

/** The rows, and — when there are more than are shown — "Show more". Purely presentational. */
export function LocalResourceList({ places, total, distanceOf, reportingBusy, onReport, onShowMore }: LocalResourceListProps) {
  return (
    <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised shadow-sm">
      <ul aria-label="Places">
        {places.map((place) => (
          <LocalResourceRow key={place.key} place={place} distanceMeters={distanceOf(place)} reportingBusy={reportingBusy} onReport={onReport} />
        ))}
      </ul>
      {total > places.length && (
        <div className="border-t border-surface-border p-3 text-center">
          <Button type="button" variant="ghost" size="sm" onClick={onShowMore}>
            Show more ({total - places.length} more)
          </Button>
        </div>
      )}
    </div>
  )
}

/** What stands in for the list: a skeleton while it loads, or a sentence saying why it is empty. */
export function LocalListPlaceholder({ kind, message }: { kind: 'loading' | 'empty'; message?: string }) {
  if (kind === 'loading') {
    return (
      <div className="flex flex-col gap-px overflow-hidden rounded-md border border-surface-border bg-surface-raised" aria-busy="true" aria-label="Loading places">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[72px] animate-pulse bg-surface-sunken" aria-hidden="true" />
        ))}
      </div>
    )
  }
  return <p className="rounded-md border border-dashed border-surface-border p-8 text-center font-body text-body-md text-ink-500">{message}</p>
}

/** The body of a tab whose screen isn't built yet (Aid requests, Campaigns and Missing persons arrive with Relief Operations). */
export function TabPlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-surface-border p-10 text-center">
      <h2 className="font-heading text-h3 font-bold text-ink-900">{title}</h2>
      <p className="font-body text-body-md text-ink-500">Not built yet — ships in {phase}.</p>
    </div>
  )
}

import type { ReactNode } from 'react'
import { formatCoordinates } from '@/features/map/mapGeo'
import { placeGlyph, TONE_COLOR } from '@/features/map/placeIcon'
import type { MapPlace } from '@/features/map/mapModel'
import { cn } from '@/lib/utils'

const ROW =
  'grid grid-cols-1 gap-2 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-4 xl:min-h-15 xl:items-center xl:px-5'

export interface FacilityTableProps {
  /** Names the list for a screen reader ("Infrastructure"). */
  label: string
  /** The `xl:grid-cols-[…]` template shared by the header and every row, so the columns line up. */
  columns: string
  /** The column labels shown from `xl` up (they are decoration there — each cell says what it is for a screen reader). */
  headers: readonly string[]
  children: ReactNode
}

/**
 * The frame of a facilities table. Pattern W-List; pixel reference Batch 5 §5g (uppercase 11px column labels, rows with a ring-tinted icon, pills, actions at the end).
 * From `xl` up it is a table whose header and rows share one column template; below that each row is a small card (on a tablet with its actions at the top right, on a phone
 * stacked under the name) — a viewport breakpoint alone can't know how much width the console's sidebar leaves, so the table starts late. Purely presentational.
 */
export function FacilityTable({ label, columns, headers, children }: FacilityTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised shadow-sm">
      <div className={cn('hidden h-11 items-center gap-4 border-b border-surface-border bg-surface-base px-5 font-body text-[11px] font-semibold tracking-wider text-ink-500 uppercase xl:grid', columns)} aria-hidden="true">
        {headers.map((header, index) => (
          <div key={header} className={index === headers.length - 1 ? 'text-end' : undefined}>
            {header}
          </div>
        ))}
      </div>
      <ul aria-label={label}>{children}</ul>
    </div>
  )
}

/** One row: the grid the table's `columns` template lays out from `xl`. */
export function FacilityRow({ columns, children }: { columns: string; children: ReactNode }) {
  return (
    <li className="border-b border-surface-border last:border-b-0">
      <div className={cn(ROW, columns)}>{children}</div>
    </li>
  )
}

/** The first cell: a ring-tinted icon (the place's tone), its name and "kind · coordinates" — the API has no street address. */
export function NameCell({ place }: { place: MapPlace }) {
  return (
    <div className="flex min-w-0 items-center gap-3 md:col-start-1 md:row-start-1 xl:col-auto xl:row-auto">
      <span className="flex size-9 flex-none items-center justify-center rounded-full border-2 bg-surface-raised" style={{ borderColor: TONE_COLOR[place.tone] }} aria-hidden="true">
        {placeGlyph(place, 18, TONE_COLOR[place.tone])}
      </span>
      <div className="min-w-0">
        <p className="font-body text-body-md font-semibold text-ink-900 [overflow-wrap:anywhere]">{place.name}</p>
        <p className="font-body text-[11px] text-ink-500 [overflow-wrap:anywhere]">
          {place.typeLabel} · {formatCoordinates(place.position)}
        </p>
      </div>
    </div>
  )
}

/** Any other cell: indented under the name below `xl`, its own column from there. */
export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('max-xl:ps-12 md:col-start-1 xl:col-auto', className)}>{children}</div>
}

/** The last cell: the row's icon buttons — top right on a tablet, under the name on a phone, the last column from `xl`. */
export function ActionsCell({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 max-md:ps-12 md:col-start-2 md:row-start-1 xl:col-auto xl:row-auto xl:justify-end">{children}</div>
}

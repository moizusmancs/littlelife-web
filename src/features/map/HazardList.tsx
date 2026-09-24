import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react'
import type { MapOverlayEntry } from '@/api/floodIntel'
import { cn } from '@/lib/utils'
import { RISK_COLOR } from './floodColor'
import { hazardBasis, hazardTitle } from './mapModel'

export interface HazardListProps {
  hazards: readonly MapOverlayEntry[]
  /** Whether the Flood layer is on — the list has nothing to say if it isn't. */
  enabled: boolean
  loading: boolean
  open: boolean
  onToggle: () => void
  selectedId: string | null
  onSelect: (entry: MapOverlayEntry) => void
}

/**
 * "Active hazards" (a collapsible list, per the spec): the zones in the current map view, worst first. Rows are buttons, which
 * is also how a keyboard user picks a zone, since the polygons on the map aren't focusable. It is the *view*, not "nearby" —
 * the overlay is queried by the visible rectangle, so panning changes it. Purely presentational.
 */
export function HazardList({ hazards, enabled, loading, open, onToggle, selectedId, onSelect }: HazardListProps) {
  return (
    <section aria-labelledby="hazards-heading">
      <h2 id="hazards-heading" className="m-0">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-5 pt-3.5 pb-2 text-start">
          <span className="font-body text-[11px] font-bold tracking-wider text-ink-500 uppercase">Active hazards in view</span>
          {enabled && !loading && <span className="rounded-full bg-status-critical-tint px-1.75 py-px font-body text-[11px] font-semibold text-status-critical">{hazards.length}</span>}
          <span className="flex-1" />
          {open ? <CaretDownIcon size={14} className="text-ink-500" aria-hidden="true" /> : <CaretRightIcon size={14} className="text-ink-500" aria-hidden="true" />}
        </button>
      </h2>

      {open &&
        (!enabled ? (
          <p className="px-5 pb-4 font-body text-body-sm text-ink-500">Turn on the Flood layer to see hazards.</p>
        ) : loading ? (
          <div className="flex flex-col gap-2 px-5 pb-4" aria-busy="true" aria-label="Loading hazards">
            {[0, 1].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
            ))}
          </div>
        ) : hazards.length === 0 ? (
          <p className="px-5 pb-4 font-body text-body-sm text-ink-500">No active hazards in this area.</p>
        ) : (
          <ul>
            {hazards.map((entry) => (
              <li key={entry.hazard_zone_id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  aria-current={entry.hazard_zone_id === selectedId ? 'true' : undefined}
                  className={cn('flex w-full items-center gap-3 border-b border-surface-border px-5 py-2.5 text-start hover:bg-surface-sunken', entry.hazard_zone_id === selectedId && 'bg-primary-50')}
                >
                  <span className="size-2.5 flex-none rounded-xs" style={{ background: RISK_COLOR[entry.risk_level] }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-body-sm font-semibold text-ink-900">{hazardTitle(entry)}</span>
                    <span className="block font-body text-[11px] text-ink-500">
                      {hazardBasis(entry)} · {formatDistanceToNowStrict(parseISO(entry.detected_at), { addSuffix: true })}
                    </span>
                  </span>
                  <CaretRightIcon size={14} className="flex-none text-ink-300" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}

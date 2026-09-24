import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CompassIcon } from '@phosphor-icons/react'
import type { MapOverlayEntry } from '@/api/floodIntel'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { HazardList } from './HazardList'
import { LayerChips } from './LayerChips'
import type { LayerId, LayerState } from './mapLayers'
import { MapSearchBar } from './MapSearchBar'
import type { MapPlace } from './mapModel'
import { PlaceResults } from './PlaceResults'

export interface PaneNotice {
  id: string
  tone: 'critical' | 'caution' | 'info'
  text: string
  onRetry?: () => void
}

export interface MapSidePaneProps {
  search: string
  onSearchChange: (value: string) => void
  layers: LayerState
  onToggleLayer: (id: LayerId) => void
  notices: readonly PaneNotice[]
  /** The viewer's-position note (`LocationNote`), if any. */
  locationNote: ReactNode
  /** The selected place or hazard card, if any. */
  selectedCard: ReactNode
  /** The places matching the search, or `null` when nothing is being searched. */
  placeResults: readonly MapPlace[] | null
  selectedPlaceKey: string | null
  distanceOf: (place: MapPlace) => number | null
  onSelectPlace: (place: MapPlace) => void
  hazards: readonly MapOverlayEntry[]
  hazardsEnabled: boolean
  hazardsLoading: boolean
  hazardsOpen: boolean
  onToggleHazards: () => void
  selectedHazardId: string | null
  onSelectHazard: (entry: MapOverlayEntry) => void
}

const NOTICE_STYLE = {
  critical: 'border-status-critical bg-status-critical-tint',
  caution: 'border-status-caution bg-status-caution-tint',
  info: 'border-surface-border bg-surface-sunken',
} as const

/**
 * The left pane of the map screen (Pattern W-Map-Split, mockup §2f): search and layer chips on top; below, anything worth
 * saying (load failures with a retry, the viewer's position), the selected card, the search results, and the collapsible
 * list of active hazards; and Find Safe Route pinned at the bottom. The mockup's Report Incident and Request Help buttons
 * are not here yet: their drawers belong to Community and Relief Operations (Phases 5 and 6), which will add them. Purely
 * presentational.
 */
export function MapSidePane(props: MapSidePaneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none flex-col gap-3 border-b border-surface-border px-5 py-4">
        <MapSearchBar value={props.search} onChange={props.onSearchChange} />
        <LayerChips layers={props.layers} onToggle={props.onToggleLayer} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {props.notices.map((notice) => (
          <div key={notice.id} role={notice.tone === 'critical' ? 'alert' : 'status'} className={cn('mx-5 mt-3 flex items-center gap-3 rounded-md border px-3.5 py-2.5 font-body text-body-sm text-ink-900', NOTICE_STYLE[notice.tone])}>
            <span className="min-w-0 flex-1">{notice.text}</span>
            {notice.onRetry && (
              <Button type="button" variant="secondary" size="sm" onClick={notice.onRetry}>
                Try again
              </Button>
            )}
          </div>
        ))}

        {props.locationNote}
        <div className={props.selectedCard ? 'mt-3' : undefined}>{props.selectedCard}</div>

        {props.placeResults && <PlaceResults places={props.placeResults} selectedKey={props.selectedPlaceKey} distanceOf={props.distanceOf} onSelect={props.onSelectPlace} />}

        <HazardList
          hazards={props.hazards}
          enabled={props.hazardsEnabled}
          loading={props.hazardsLoading}
          open={props.hazardsOpen}
          onToggle={props.onToggleHazards}
          selectedId={props.selectedHazardId}
          onSelect={props.onSelectHazard}
        />
      </div>

      <div className="flex-none border-t border-surface-border px-5 py-4">
        <Link to="/app/navigate" className={cn(buttonVariants({ size: 'lg' }), 'h-12 w-full rounded-lg bg-linear-to-br from-primary-500 to-peach-400')}>
          <CompassIcon size={18} weight="bold" aria-hidden="true" />
          Find Safe Route
        </Link>
      </div>
    </div>
  )
}

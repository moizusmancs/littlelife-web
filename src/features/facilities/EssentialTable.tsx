import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { ClockCounterClockwiseIcon, MapPinIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { EssentialLocation } from '@/api/facilities'
import { essentialPlace } from '@/features/map/mapModel'
import { BADGE_TONE } from './facilityModel'
import { ActionsCell, Cell, FacilityRow, FacilityTable, NameCell } from './FacilityTable'

const COLUMNS = 'xl:grid-cols-[minmax(0,2.4fr)_8rem_minmax(0,1.2fr)_minmax(0,1fr)_6.5rem]'

export interface EssentialTableProps {
  rows: EssentialLocation[]
  onShowLocation: (row: EssentialLocation) => void
  onShowReports: (row: EssentialLocation) => void
}

/**
 * ATMs, grocery stores and pharmacies. They have **no status of their own** — what is shown is the latest citizen report, or "Status unknown" if nobody has reported, never a guess at
 * open — so the actions are the place on a map and its **report log** (the one thing an admin can read that a citizen can't see). Nothing here is editable: the API has no edit and no delete.
 * Purely presentational.
 */
export function EssentialTable({ rows, onShowLocation, onShowReports }: EssentialTableProps) {
  return (
    <FacilityTable label="Essential locations" columns={COLUMNS} headers={['Place', 'Status', 'Last report', 'Added', 'Actions']}>
      {rows.map((row) => {
        const place = essentialPlace(row)
        return (
          <FacilityRow key={row.id} columns={COLUMNS}>
            <NameCell place={place} />
            <Cell>
              <Badge tone={BADGE_TONE[place.tone]}>{place.statusLabel}</Badge>
            </Cell>
            <Cell className="font-body text-body-sm text-ink-500">
              <span className="xl:sr-only">Last report </span>
              {row.status_reported_at ? formatDistanceToNowStrict(parseISO(row.status_reported_at), { addSuffix: true }) : 'No reports yet'}
            </Cell>
            <Cell className="font-body text-body-sm text-ink-500">
              <span className="xl:sr-only">Added </span>
              {format(parseISO(row.created_at), 'd MMM yyyy')}
            </Cell>
            <ActionsCell>
              <Button type="button" size="sm" variant="secondary" className="w-9 flex-none px-0" aria-label={`Location of ${row.name}`} onClick={() => onShowLocation(row)}>
                <MapPinIcon size={16} aria-hidden="true" />
              </Button>
              <Button type="button" size="sm" variant="secondary" className="w-9 flex-none px-0" aria-label={`Status reports for ${row.name}`} onClick={() => onShowReports(row)}>
                <ClockCounterClockwiseIcon size={16} aria-hidden="true" />
              </Button>
            </ActionsCell>
          </FacilityRow>
        )
      })}
    </FacilityTable>
  )
}

import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { MapPinIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Infrastructure } from '@/api/facilities'
import { infrastructurePlace } from '@/features/map/mapModel'
import { BADGE_TONE } from './facilityModel'
import { ActionsCell, Cell, FacilityRow, FacilityTable, NameCell } from './FacilityTable'

const COLUMNS = 'xl:grid-cols-[minmax(0,2.4fr)_6.5rem_minmax(0,1fr)_minmax(0,1fr)_6.5rem]'

export interface InfrastructureTableProps {
  rows: Infrastructure[]
  onShowLocation: (row: Infrastructure) => void
  onUpdateStatus: (row: Infrastructure) => void
}

/**
 * Hospitals, bridges and utilities: the status an admin keeps current (safe, at risk, damaged — citizens see it on the map), when it was last set, and when the entry was added.
 * **Update status** is the only edit the API has — a place's name, kind and position can't be changed, and there is no delete. Purely presentational.
 */
export function InfrastructureTable({ rows, onShowLocation, onUpdateStatus }: InfrastructureTableProps) {
  return (
    <FacilityTable label="Infrastructure" columns={COLUMNS} headers={['Facility', 'Status', 'Status updated', 'Added', 'Actions']}>
      {rows.map((row) => {
        const place = infrastructurePlace(row)
        return (
          <FacilityRow key={row.id} columns={COLUMNS}>
            <NameCell place={place} />
            <Cell>
              <Badge tone={BADGE_TONE[place.tone]}>{place.statusLabel}</Badge>
            </Cell>
            <Cell className="font-body text-body-sm text-ink-500">
              <span className="xl:sr-only">Status updated </span>
              {formatDistanceToNowStrict(parseISO(row.last_status_update), { addSuffix: true })}
            </Cell>
            <Cell className="font-body text-body-sm text-ink-500">
              <span className="xl:sr-only">Added </span>
              {format(parseISO(row.created_at), 'd MMM yyyy')}
            </Cell>
            <ActionsCell>
              <Button type="button" size="sm" variant="secondary" className="w-9 flex-none px-0" aria-label={`Location of ${row.name}`} onClick={() => onShowLocation(row)}>
                <MapPinIcon size={16} aria-hidden="true" />
              </Button>
              <Button type="button" size="sm" variant="secondary" className="w-9 flex-none px-0" aria-label={`Update status of ${row.name}`} onClick={() => onUpdateStatus(row)}>
                <PencilSimpleIcon size={16} aria-hidden="true" />
              </Button>
            </ActionsCell>
          </FacilityRow>
        )
      })}
    </FacilityTable>
  )
}

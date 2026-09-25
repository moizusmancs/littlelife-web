import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { MapPinIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Shelter } from '@/api/facilities'
import { shelterPlace } from '@/features/map/mapModel'
import { OccupancyBar } from '@/features/ngoShelters/OccupancyBar'
import { CertificationBadge } from '@/features/shelters/CertificationBadge'
import { BADGE_TONE } from './facilityModel'
import { ActionsCell, Cell, FacilityRow, FacilityTable, NameCell } from './FacilityTable'

const COLUMNS = 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_5rem_9.5rem_minmax(0,1.3fr)_6.5rem_3.5rem]'

export interface SheltersOversightTableProps {
  rows: Shelter[]
  /** Organisation names by id, as far as they have loaded. */
  organisationNames: ReadonlyMap<string, string>
  onShowLocation: (row: Shelter) => void
}

/**
 * Every shelter, read-only. **Oversight, not management:** shelters are registered, kept up to date and closed by the organisation that runs them (`/ngo/shelters`), so an admin can
 * see who runs each, whether it is open, certified and how full it is, and where it is — but not change it. The organisation is a name (looked up from the admin NGO list) linking to
 * its page, or a plain "No organisation" for a shelter the API says nobody manages. Purely presentational.
 */
export function SheltersOversightTable({ rows, organisationNames, onShowLocation }: SheltersOversightTableProps) {
  return (
    <FacilityTable label="Shelters" columns={COLUMNS} headers={['Shelter', 'Organisation', 'Status', 'Certification', 'Occupancy', 'Updated', '']}>
      {rows.map((row) => {
        const place = shelterPlace(row)
        const ngoId = row.managed_by_ngo_id
        const ngoName = ngoId ? organisationNames.get(ngoId) : undefined
        return (
          <FacilityRow key={row.id} columns={COLUMNS}>
            <NameCell place={place} />
            <Cell className="font-body text-body-sm text-ink-700 [overflow-wrap:anywhere]">
              <span className="xl:sr-only">Run by </span>
              {ngoId ? (
                <Link to={`/admin/ngos/${ngoId}`} className="font-semibold text-primary-700 hover:underline">
                  {ngoName ?? 'An organisation'}
                </Link>
              ) : (
                <span className="text-ink-500">No organisation</span>
              )}
            </Cell>
            <div className="flex flex-wrap items-center gap-2 max-xl:ps-12 md:col-start-1 xl:contents">
              <div>
                <Badge tone={BADGE_TONE[place.tone]}>{place.statusLabel}</Badge>
              </div>
              <div>
                <CertificationBadge status={row.certification_status} />
              </div>
            </div>
            <Cell className="md:max-w-sm xl:max-w-none xl:pe-3">
              <OccupancyBar shelter={row} label={`Occupancy of ${row.name}`} />
            </Cell>
            <Cell className="font-body text-body-sm text-ink-500">
              <span className="xl:sr-only">Updated </span>
              {formatDistanceToNowStrict(parseISO(row.updated_at), { addSuffix: true })}
            </Cell>
            <ActionsCell>
              <Button type="button" size="sm" variant="secondary" className="w-9 flex-none px-0" aria-label={`Location of ${row.name}`} onClick={() => onShowLocation(row)}>
                <MapPinIcon size={16} aria-hidden="true" />
              </Button>
            </ActionsCell>
          </FacilityRow>
        )
      })}
    </FacilityTable>
  )
}

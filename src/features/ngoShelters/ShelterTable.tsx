import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { EyeIcon, HouseLineIcon, PencilSimpleIcon, TentIcon, UsersIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import type { Shelter } from '@/api/facilities'
import { formatCoordinates } from '@/features/map/mapGeo'
import { capacityInfo, type Tone } from '@/features/map/mapModel'
import { CertificationBadge } from '@/features/shelters/CertificationBadge'
import { OccupancyBar } from './OccupancyBar'
import { OccupancyEditor } from './OccupancyEditor'
import { occupancyButtonId, shelterTypeLabel, type OccupancyDraft } from './shelterModel'

/** One shared column template so the header and every row line up from `xl` up. Only the name and the occupancy flex; the rest are fixed,
 *  because each row is its own grid and an `auto` column would size to that row's content and drift out of line with the others.
 *  It starts at `xl`, not `lg`: the console's 240px sidebar leaves a 1024px window about 735px, which six columns crush. */
const COLUMNS = 'xl:grid-cols-[minmax(0,2fr)_5.5rem_9.5rem_minmax(0,1.6fr)_6.5rem_8.5rem]'

/** The ring round a row's icon — the occupancy tone (mockup 2e), or plain when the shelter is closed and its headcount isn't the story. */
const RING: Record<Tone, string> = {
  safe: 'border-status-safe text-status-safe',
  caution: 'border-status-caution text-status-caution',
  critical: 'border-status-critical text-status-critical',
  neutral: 'border-ink-300 text-ink-500',
}

export interface ShelterTableProps {
  shelters: Shelter[]
  /** `ngo_admin` only — the API restricts `PATCH /shelters/{id}` to them; occupancy is open to any staff. */
  canEdit: boolean
  draft: OccupancyDraft | null
  /** The row's occupancy button — opens its editor, or closes it if it is already open. */
  onToggleOccupancy: (shelter: Shelter) => void
  onDraftChange: (text: string) => void
  onDraftSave: () => void
  onDraftCancel: () => void
  onEdit: (shelter: Shelter) => void
  /** Router state passed along to the detail page (it uses it to link back to this exact view). */
  detailState?: unknown
}

/**
 * The shelters table. Pattern W-List; pixel reference Batch 2 §2e: a ring-tinted icon, the name and where it is, Open/Closed and
 * certification badges, an occupancy bar, when it was last updated, and View / Update occupancy / Edit. Occupancy opens an editor
 * *inside the row* rather than a dialog. The mockup's address line becomes the kind and coordinates — the API has no street address.
 * Below `xl` each row is a small card — on a tablet with the actions at its top right, on a phone stacked under it. Purely presentational.
 */
export function ShelterTable({ shelters, canEdit, draft, onToggleOccupancy, onDraftChange, onDraftSave, onDraftCancel, onEdit, detailState }: ShelterTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised shadow-sm">
      <div
        className={`hidden h-11 items-center gap-4 border-b border-surface-border bg-surface-base px-5 font-body text-[11px] font-semibold tracking-wider text-ink-500 uppercase xl:grid ${COLUMNS}`}
        aria-hidden="true"
      >
        <div>Shelter</div>
        <div>Status</div>
        <div>Certification</div>
        <div>Occupancy</div>
        <div>Updated</div>
        <div className="text-end">Actions</div>
      </div>

      <ul>
        {shelters.map((shelter) => {
          const editing = draft?.shelterId === shelter.id
          const closed = shelter.status === 'closed'
          const Icon = shelter.type === 'relief_center' ? TentIcon : HouseLineIcon
          return (
            <li key={shelter.id} className="border-b border-surface-border last:border-b-0">
              <div className={cn('grid grid-cols-1 gap-2 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-4 xl:min-h-15 xl:items-center xl:px-5', COLUMNS, editing && 'bg-primary-50')}>
                <div className="flex min-w-0 items-center gap-3 md:col-start-1 md:row-start-1 xl:col-auto xl:row-auto">
                  <span className={cn('flex size-9 flex-none items-center justify-center rounded-full border-2 bg-surface-raised', RING[closed ? 'neutral' : capacityInfo(shelter).tone])} aria-hidden="true">
                    <Icon size={18} weight="fill" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-body text-body-md font-semibold text-ink-900 [overflow-wrap:anywhere]">{shelter.name}</p>
                    <p className="font-body text-[11px] text-ink-500 [overflow-wrap:anywhere]">
                      {shelterTypeLabel(shelter.type)} · {formatCoordinates([shelter.location.coordinates[1], shelter.location.coordinates[0]])}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 max-xl:ps-12 md:col-start-1 xl:contents">
                  <div>
                    <Badge tone={closed ? 'critical' : 'safe'}>{closed ? 'Closed' : 'Open'}</Badge>
                  </div>
                  <div>
                    <CertificationBadge status={shelter.certification_status} />
                  </div>
                </div>

                <div className="max-xl:ps-12 md:col-start-1 md:max-w-sm xl:col-auto xl:max-w-none xl:pe-5">
                  <OccupancyBar shelter={shelter} label={`Occupancy of ${shelter.name}`} />
                </div>

                <p className="font-body text-body-sm text-ink-500 max-xl:ps-12 md:col-start-1 xl:col-auto">
                  <span className="xl:sr-only">Updated </span>
                  {formatDistanceToNowStrict(parseISO(shelter.updated_at), { addSuffix: true })}
                </p>

                <div className="flex items-center gap-2 max-md:ps-12 md:col-start-2 md:row-start-1 xl:col-auto xl:row-auto xl:justify-end">
                  <Link to={`/ngo/shelters/${shelter.id}`} state={detailState} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-9 flex-none px-0')} aria-label={`View ${shelter.name}`}>
                    <EyeIcon size={16} aria-hidden="true" />
                  </Link>
                  <Button
                    id={occupancyButtonId(shelter.id)}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className={cn('w-9 flex-none px-0', editing && 'border-primary-500 bg-primary-50 text-primary-700')}
                    aria-label={`Update occupancy for ${shelter.name}`}
                    aria-expanded={editing}
                    onClick={() => onToggleOccupancy(shelter)}
                  >
                    <UsersIcon size={16} aria-hidden="true" />
                  </Button>
                  {canEdit && (
                    <Button type="button" size="sm" variant="secondary" className="w-9 flex-none px-0" aria-label={`Edit ${shelter.name}`} onClick={() => onEdit(shelter)}>
                      <PencilSimpleIcon size={16} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>

              {editing && draft && (
                <div className="border-t border-primary-200 bg-primary-50 px-4 py-3.5 xl:ps-[4.25rem] xl:pe-5">
                  <OccupancyEditor
                    shelter={shelter}
                    text={draft.text}
                    onTextChange={onDraftChange}
                    onSave={onDraftSave}
                    onCancel={onDraftCancel}
                    isSaving={draft.isSaving}
                    serverError={draft.error}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

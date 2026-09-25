import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { UsersIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { Shelter } from '@/api/facilities'
import { capacityInfo } from '@/features/map/mapModel'
import { CapacityMeter } from '@/features/shelters/CapacityMeter'
import { OccupancyEditor } from './OccupancyEditor'
import { occupancyButtonId, type OccupancyDraft } from './shelterModel'

export interface NgoShelterOccupancyCardProps {
  shelter: Shelter
  /** Whether the editor is open, and what it holds; `null` when closed. */
  draft: OccupancyDraft | null
  /** Occupancy is open to any staff of the organisation — but not for another organisation's shelter, which the page only shows. */
  canUpdate: boolean
  onOpen: () => void
  onTextChange: (text: string) => void
  onSave: () => void
  onCancel: () => void
}

/** How full the shelter is, when that was last updated, and **Update occupancy** — which opens the same stepper as the list's row, in the card. Purely presentational. */
export function NgoShelterOccupancyCard({ shelter, draft, canUpdate, onOpen, onTextChange, onSave, onCancel }: NgoShelterOccupancyCardProps) {
  return (
    <section aria-labelledby="occupancy-heading" className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm">
      <h2 id="occupancy-heading" className="font-heading text-h3 font-bold text-ink-900">
        Occupancy
      </h2>
      <CapacityMeter info={capacityInfo(shelter)} />
      {shelter.status === 'closed' && <p className="font-body text-body-sm font-semibold text-status-critical">Closed — citizens see this shelter as closed.</p>}
      <p className="font-body text-body-sm text-ink-500">Updated {formatDistanceToNowStrict(parseISO(shelter.updated_at), { addSuffix: true })}.</p>

      {draft ? (
        <OccupancyEditor
          className="border-t border-surface-border pt-4"
          shelter={shelter}
          text={draft.text}
          onTextChange={onTextChange}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={draft.isSaving}
          serverError={draft.error}
        />
      ) : (
        canUpdate && (
          <Button id={occupancyButtonId(shelter.id)} type="button" variant="secondary" size="sm" className="self-start" onClick={onOpen}>
            <UsersIcon size={16} aria-hidden="true" />
            Update occupancy
          </Button>
        )
      )}
    </section>
  )
}

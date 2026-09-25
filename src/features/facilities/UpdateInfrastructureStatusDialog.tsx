import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Infrastructure, InfrastructureStatus } from '@/api/facilities'
import { TONE_COLOR } from '@/features/map/placeIcon'
import { INFRA_STATUS_LABEL, INFRA_TYPE_LABEL } from './facilityModel'

const OPTIONS: ReadonlyArray<{ value: InfrastructureStatus; hint: string; color: string }> = [
  { value: 'safe', hint: 'No known threat.', color: TONE_COLOR.safe },
  { value: 'at_risk', hint: 'Threatened — it could be damaged or cut off.', color: TONE_COLOR.caution },
  { value: 'damaged', hint: 'Damaged or out of use.', color: TONE_COLOR.critical },
]

export interface UpdateInfrastructureStatusDialogProps {
  /** The item being updated; `null` closes the dialog. */
  target: Infrastructure | null
  status: InfrastructureStatus
  onStatusChange: (status: InfrastructureStatus) => void
  onSave: () => void
  onClose: () => void
  isSaving: boolean
  error: string | null
}

/**
 * Set an infrastructure item's status — safe, at risk or damaged (`PATCH /admin/infrastructure/{id}/status`, the only edit the API has). Any status can follow any other, so the
 * current one is not locked out: saving it again is a real `200` that **refreshes "status updated"**, which is how an admin confirms it is still true, and the dialog says so
 * rather than pretending nothing happened. Citizens see the colour on the map. Purely presentational.
 */
export function UpdateInfrastructureStatusDialog({ target, status, onStatusChange, onSave, onClose, isSaving, error }: UpdateInfrastructureStatusDialogProps) {
  const unchanged = target !== null && status === target.status
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isSaving) onSave()
  }
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && (
          <>
            <DialogTitle>Update status</DialogTitle>
            <DialogDescription>
              {target.name} · {INFRA_TYPE_LABEL[target.type]}. Citizens see its status on the map.
            </DialogDescription>
            <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
              {error && (
                <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
                  {error}
                </div>
              )}
              <fieldset>
                <legend className="sr-only">Status</legend>
                <div className="flex flex-col gap-2">
                  {OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-surface-border bg-surface-raised px-3 py-2.5 has-checked:border-2 has-checked:border-primary-500 has-checked:bg-primary-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary-500"
                    >
                      <input type="radio" name="infrastructure-status" value={option.value} checked={status === option.value} onChange={() => onStatusChange(option.value)} className="sr-only" />
                      <span className="mt-1 size-3 flex-none rounded-full" style={{ background: option.color }} aria-hidden="true" />
                      <span>
                        <span className="block font-body text-label font-semibold text-ink-900">
                          {INFRA_STATUS_LABEL[option.value]}
                          {option.value === target.status && (
                            <>
                              {' '}
                              <span className="font-normal text-ink-500">(current)</span>
                            </>
                          )}
                        </span>
                        <span className="block font-body text-body-sm text-ink-500">{option.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {unchanged && <p className="font-body text-body-sm text-ink-500">That is already its status. Saving it again just refreshes when it was last updated.</p>}
              <div className="flex justify-end gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={isSaving}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" isLoading={isSaving}>
                  {unchanged ? 'Confirm status' : 'Save status'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface ResolveZoneTarget {
  id: string
  title: string
  shortId: string
}

export interface ResolveZoneDialogProps {
  /** The zone being confirmed; the dialog is open exactly when this is set. */
  target: ResolveZoneTarget | null
  onClose: () => void
  onConfirm: () => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * Confirm/cancel for `PATCH /admin/hazard-zones/{id}/resolve` (no body). The copy says what really happens: the zone stops being active,
 * so it leaves the citizen map and no longer counts when someone asks whether they are in a hazard zone — and, since there is no route
 * to reactivate one, that it can't be undone. Purely presentational.
 */
export function ResolveZoneDialog({ target, onClose, onConfirm, isSubmitting, serverError }: ResolveZoneDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Resolve this hazard zone?</DialogTitle>
        <DialogDescription>
          {target ? `${target.title} (#${target.shortId}) ` : ''}stops being active: it leaves the citizen map and no longer counts when someone checks whether they are in a hazard zone. There is no way to reactivate a zone once it is resolved.
        </DialogDescription>
        {serverError && (
          <div role="alert" className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
            {serverError}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="primary" isLoading={isSubmitting} onClick={onConfirm}>
            Resolve zone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

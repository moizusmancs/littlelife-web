import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Region } from '@/api/geo'

export interface RemoveRegionDialogProps {
  /** The region to remove; the dialog is open exactly while this is set. */
  target: Region | null
  onClose: () => void
  onConfirm: () => void
  isSubmitting: boolean
  serverError: string | null
}

/** Confirm/cancel for taking a region out of the organisation's coverage — nothing is deleted, and it can be added again. */
export function RemoveRegionDialog({ target, onClose, onConfirm, isSubmitting, serverError }: RemoveRegionDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target && (
        <DialogContent>
          <DialogTitle>Remove {target.name}?</DialogTitle>
          <DialogDescription>
            Your organisation will no longer be listed as covering {target.name}. The region itself isn't affected, and
            you can add it again at any time.
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
            <Button type="button" variant="dangerOutline" isLoading={isSubmitting} onClick={onConfirm}>
              Remove region
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { RemoveTarget } from './connections'

export interface RemoveConnectionDialogProps {
  /** The dialog is open exactly when this is set. */
  target: RemoveTarget | null
  onClose: () => void
  onConfirm: () => void
  isSubmitting: boolean
  serverError: string | null
}

const COPY: Record<RemoveTarget['standing'], (label: string) => { title: string; body: string; confirm: string; keep: string }> = {
  connected: (label) => ({
    title: `Remove ${label}?`,
    body: "You'll no longer be connected, and neither of you will be able to see the other's live location. It ends for both of you — to reconnect, one of you has to send a new request.",
    confirm: 'Remove member',
    keep: 'Cancel',
  }),
  outgoing: (label) => ({
    title: `Cancel your request to ${label}?`,
    body: "They won't be able to accept it any more. You can send a new request later.",
    confirm: 'Cancel request',
    keep: 'Keep request',
  }),
  declined: (label) => ({
    title: `Remove the request with ${label}?`,
    body: 'It disappears from your list and theirs. Nothing else changes.',
    confirm: 'Remove',
    keep: 'Cancel',
  }),
}

/**
 * Confirm/cancel for `DELETE /safety-connections/{id}` — a real deletion, open to either side at any
 * status. It means three different things (cancelling a request you sent, severing a connection,
 * tidying away a declined one), so the wording follows the standing, and the connected case says
 * plainly that it ends for both people.
 */
export function RemoveConnectionDialog({ target, onClose, onConfirm, isSubmitting, serverError }: RemoveConnectionDialogProps) {
  const copy = target ? COPY[target.standing](target.label) : null

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {copy && (
          <>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.body}</DialogDescription>

            {serverError && (
              <div
                role="alert"
                className="mt-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
              >
                {serverError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isSubmitting}>
                  {copy.keep}
                </Button>
              </DialogClose>
              <Button type="button" variant="dangerOutline" isLoading={isSubmitting} onClick={onConfirm}>
                {copy.confirm}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

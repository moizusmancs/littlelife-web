import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { AdminNgo } from '@/api/identity'

export type NgoDecision = 'approve' | 'reject'

export interface NgoDecisionTarget {
  ngo: AdminNgo
  decision: NgoDecision
}

export interface NgoDecisionDialogProps {
  /** The decision being confirmed; the dialog is open exactly when this is set. */
  target: NgoDecisionTarget | null
  onClose: () => void
  onConfirm: () => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * Confirm/cancel for `POST /admin/ngos/{id}/approve` and `/reject` — neither takes a body. The copy
 * says what really happens. Approving does two things at once: the organisation becomes active and
 * its applicant is promoted to NGO admin *and signed out everywhere* (their sessions are revoked, so
 * they have to log in again to get the new role). Rejecting closes the application and touches
 * nothing else — the applicant stays a citizen and may apply again — and says plainly that no
 * reason is recorded or shown, because the backend has nowhere to keep one; a reason field here
 * would be a promise the system can't keep.
 */
export function NgoDecisionDialog({ target, onClose, onConfirm, isSubmitting, serverError }: NgoDecisionDialogProps) {
  const ngo = target?.ngo
  const approving = target?.decision === 'approve'

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>
          {approving ? 'Approve' : 'Reject'} {ngo?.name}?
        </DialogTitle>
        <DialogDescription>
          {approving
            ? `This makes the organisation active and promotes ${ngo?.created_by_email} to its NGO admin. They're signed out everywhere and need to log in again to get the new role.`
            : `The application is closed as rejected. ${ngo?.created_by_email} stays a citizen and can submit a new application. No reason is recorded or shown to them.`}
        </DialogDescription>

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
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={approving ? 'primary' : 'dangerOutline'}
            isLoading={isSubmitting}
            onClick={onConfirm}
          >
            {approving ? 'Approve organisation' : 'Reject application'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface RemoveVolunteerDialogProps {
  /** The email of the volunteer being removed; the dialog is open exactly when this is set. */
  volunteerEmail: string | null
  onClose: () => void
  onConfirm: () => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * Confirm/cancel for `PATCH /ngo/volunteers/{id}/deactivate`. The route is *named* deactivate but
 * does not deactivate anything — it takes them off the roster (role back to a plain citizen) and
 * signs them out everywhere, leaving the account itself active. The copy says what really happens,
 * including that it's reversible by inviting them again, rather than the misleading route name.
 */
export function RemoveVolunteerDialog({
  volunteerEmail,
  onClose,
  onConfirm,
  isSubmitting,
  serverError,
}: RemoveVolunteerDialogProps) {
  return (
    <Dialog open={volunteerEmail !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Remove {volunteerEmail} from your organisation?</DialogTitle>
        <DialogDescription>
          They go back to being a regular citizen and lose access to your organisation's console. Their
          account isn't suspended or deleted. They're signed out everywhere and can be invited again later.
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
          <Button type="button" variant="dangerOutline" isLoading={isSubmitting} onClick={onConfirm}>
            Remove volunteer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

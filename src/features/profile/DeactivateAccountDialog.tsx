import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface DeactivateAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * No form fields — `POST /auth/me/deactivate` takes no body (api/00-identity.md) — so this is a
 * plain confirm/cancel, not a form. Reversibility is the one fact worth restating right before
 * the destructive click, since "reactivates on next login" is easy to miss on the settings row
 * itself.
 */
export function DeactivateAccountDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  serverError,
}: DeactivateAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Deactivate your account?</DialogTitle>
        <DialogDescription>
          You'll be signed out everywhere immediately. Logging back in with your password reactivates the account —
          nothing is deleted.
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
            Deactivate account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

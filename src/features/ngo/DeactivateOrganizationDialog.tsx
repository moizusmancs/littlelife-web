import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface DeactivateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationName: string
  onConfirm: () => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * Confirm/cancel only — `POST /ngo/me/deactivate` takes no body (api/00-identity.md). Unlike
 * account deactivation this one is NOT reversible: there is no reactivation route, so that is the
 * one thing the copy leads with. It also says what does *not* happen (staff aren't signed out or
 * touched) so nobody expects a mass logout, and names the one concrete consequence the backend
 * enforces today (an inactive organisation can't send volunteer invitations).
 */
export function DeactivateOrganizationDialog({
  open,
  onOpenChange,
  organizationName,
  onConfirm,
  isSubmitting,
  serverError,
}: DeactivateOrganizationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Deactivate {organizationName}?</DialogTitle>
        <DialogDescription>
          This can't be undone — there is currently no way to reactivate an organisation. Staff accounts keep
          their roles and stay signed in, but the organisation can no longer send volunteer invitations.
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
            Deactivate organisation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

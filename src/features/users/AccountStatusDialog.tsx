import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { AccountStatusAction, AccountSummary } from '@/api/identity'
import type { StatusReasonFormValues } from './schemas'

export interface StatusChangeTarget {
  account: AccountSummary
  action: AccountStatusAction
}

export interface AccountStatusDialogProps {
  /** The change being confirmed; the dialog is open exactly when this is set. */
  target: StatusChangeTarget | null
  onClose: () => void
  register: UseFormRegister<StatusReasonFormValues>
  errors: FieldErrors<StatusReasonFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * Confirm + reason for `PATCH /admin/accounts/{id}/status`. The API's moderation log is a separate,
 * append-only record that does *not* follow status changes on its own (and its own doc says an
 * admin UI should almost always do both), so the reason typed here is what gets saved to it once
 * the change succeeds — one confirmation, both effects. The copy says what each change really does:
 * suspending signs them out everywhere immediately; reactivating changes nothing about sessions
 * (there are none), and for an account whose email was never verified it says they'll still be
 * asked to verify it.
 */
export function AccountStatusDialog({
  target,
  onClose,
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
}: AccountStatusDialogProps) {
  const account = target?.account
  const suspending = target?.action === 'suspend'
  const platformAdmin = account?.role === 'admin' || account?.role === 'super_admin'

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>
          {suspending ? 'Suspend' : 'Reactivate'} {account?.email}?
        </DialogTitle>
        <DialogDescription>
          {suspending
            ? "They're signed out everywhere immediately and can't log in until an admin reactivates them."
            : "They'll be able to log in again."}
          {suspending && platformAdmin && ' This is a platform admin account: suspending it removes their access to this console.'}
          {!suspending && account && !account.email_verified && " Their email is still unverified, so they'll be asked to verify it when they log in."}{' '}
          The reason below is saved to their moderation history.
        </DialogDescription>

        <form onSubmit={onSubmit} noValidate className="mt-4">
          {serverError && (
            <div
              role="alert"
              className="mb-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
            >
              {serverError}
            </div>
          )}

          <Label htmlFor="statusReason">Reason</Label>
          <Textarea
            id="statusReason"
            autoFocus
            placeholder={suspending ? 'e.g. Repeated false incident reports' : 'e.g. Reviewed and cleared'}
            hasError={!!errors.reason}
            aria-describedby={errors.reason ? 'status-reason-error' : undefined}
            {...register('reason')}
          />
          {errors.reason && (
            <p id="status-reason-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.reason.message}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={suspending ? 'dangerOutline' : 'primary'} isLoading={isSubmitting}>
              {suspending ? 'Suspend account' : 'Reactivate account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

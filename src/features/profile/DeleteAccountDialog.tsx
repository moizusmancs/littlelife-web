import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import type { DeleteAccountFormValues } from './schemas'

export interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  register: UseFormRegister<DeleteAccountFormValues>
  errors: FieldErrors<DeleteAccountFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * Password-confirmation dialog (WEB_DESIGN_PLAN.md §6.2) — `POST /auth/me/delete` requires
 * re-entering the current password (api/00-identity.md), so unlike Deactivate's plain
 * confirm/cancel this is a real single-field form. Irreversibility is stated plainly, twice
 * (title + description), since this is the one destructive action in the app with no recovery
 * path at all, not even an admin one.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
}: DeleteAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogDescription>
          This is permanent. Your reports, connections, and history are gone for good — there is no way to undo
          this, not even by an admin. Enter your password to confirm.
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

          <Label htmlFor="currentPassword">Current password</Label>
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            autoFocus
            hasError={!!errors.currentPassword}
            aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
            {...register('currentPassword')}
          />
          {errors.currentPassword && (
            <p id="current-password-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.currentPassword.message}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="dangerOutline" isLoading={isSubmitting}>
              Delete account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

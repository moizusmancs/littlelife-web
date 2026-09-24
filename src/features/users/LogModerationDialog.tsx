import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ModerationActionFormValues } from './schemas'

export interface LogModerationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountEmail: string
  register: UseFormRegister<ModerationActionFormValues>
  errors: FieldErrors<ModerationActionFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * `POST /admin/accounts/{id}/moderation-actions` — a type and a non-blank reason. The one thing the
 * copy has to get across: this only *records* a decision. Logging `suspend` or `block` here does
 * not suspend anything (that's the separate status control), so nobody is left believing an
 * account is locked because they wrote it down.
 */
export function LogModerationDialog({
  open,
  onOpenChange,
  accountEmail,
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
}: LogModerationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Log a moderation action</DialogTitle>
        <DialogDescription>
          Adds an entry to the history of {accountEmail}. This only records the decision. It doesn't change
          the account's status; use Suspend or Reactivate for that.
        </DialogDescription>

        <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
          {serverError && (
            <div
              role="alert"
              className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
            >
              {serverError}
            </div>
          )}

          <div>
            <Label htmlFor="moderationType">Action</Label>
            <Select id="moderationType" {...register('actionType')}>
              <option value="warn">Warn</option>
              <option value="suspend">Suspend</option>
              <option value="block">Block</option>
              <option value="unblock">Unblock</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="moderationReason">Reason</Label>
            <Textarea
              id="moderationReason"
              placeholder="What happened, and why this action"
              hasError={!!errors.reason}
              aria-describedby={errors.reason ? 'moderation-reason-error' : undefined}
              {...register('reason')}
            />
            {errors.reason && (
              <p id="moderation-reason-error" className="mt-1 font-body text-body-sm text-status-critical">
                {errors.reason.message}
              </p>
            )}
          </div>

          <div className="mt-2 flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={isSubmitting}>
              Log action
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

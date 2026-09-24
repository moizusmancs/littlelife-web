import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InviteVolunteerFormValues } from './schemas'

export interface InviteVolunteerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  register: UseFormRegister<InviteVolunteerFormValues>
  errors: FieldErrors<InviteVolunteerFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * `POST /ngo/volunteers/invitations` takes just an email, and the backend looks the person up —
 * they must already have a LittleLife citizen account, which is the one thing the copy says up
 * front. The server's own message is shown for the rest (`account not found`, already staff
 * elsewhere, organisation not active). Nothing about their account changes until they accept.
 */
export function InviteVolunteerDialog({
  open,
  onOpenChange,
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
}: InviteVolunteerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Invite a volunteer</DialogTitle>
        <DialogDescription>
          Enter the email of someone who already has a LittleLife account as a citizen. They'll see the
          invitation under Profile › Invitations, and nothing changes on their account until they accept.
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

          <Label htmlFor="inviteEmail">Volunteer's email</Label>
          <Input
            id="inviteEmail"
            type="email"
            autoComplete="off"
            autoFocus
            placeholder="name@example.com"
            hasError={!!errors.email}
            aria-describedby={errors.email ? 'invite-email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p id="invite-email-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.email.message}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={isSubmitting}>
              Send invitation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

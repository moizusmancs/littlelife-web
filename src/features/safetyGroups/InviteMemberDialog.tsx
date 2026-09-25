import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { InviteMemberFormValues, InviteMethod } from './schemas'

export interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How the person is named: by the email they signed up with, or by their Member ID. */
  method: InviteMethod
  onMethodChange: (method: InviteMethod) => void
  register: UseFormRegister<InviteMemberFormValues>
  errors: FieldErrors<InviteMemberFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

const COPY: Record<InviteMethod, { label: string; placeholder: string; description: string; other: string }> = {
  email: {
    label: 'Their email',
    placeholder: 'name@example.com',
    description:
      "Enter the email they use for LittleLife. They'll see your request under Safety Groups and are only connected once they accept.",
    other: 'Use a Member ID instead',
  },
  id: {
    label: 'Their Member ID',
    placeholder: '3165dfbc-a40e-415b-8e50-0062a0c94471',
    description:
      "Ask them to open Safety Groups in LittleLife and copy their Member ID, then paste it here. They'll see your request there and are only connected once they accept.",
    other: 'Use their email instead',
  },
}

/**
 * `POST /safety-connections` names the person by **email** (the default — trimmed and matched
 * case-insensitively by the server) or by **account id**, the "Member ID" it started with, still offered
 * underneath for someone whose email you don't have. Only active LittleLife members can be invited, and the
 * server says the same thing for "no such account" and "not an active member", so the copy doesn't
 * promise more than "we couldn't find an active member". Nothing happens on their side until they accept.
 */
export function InviteMemberDialog({
  open,
  onOpenChange,
  method,
  onMethodChange,
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
}: InviteMemberDialogProps) {
  const copy = COPY[method]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Invite a member</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>

        <form onSubmit={onSubmit} noValidate className="mt-4">
          {serverError && (
            <div
              role="alert"
              className="mb-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
            >
              {serverError}
            </div>
          )}

          <Label htmlFor="inviteRecipient">{copy.label}</Label>
          <Input
            // A fresh field per method, so switching never carries a half-typed email into the Member ID box.
            key={method}
            id="inviteRecipient"
            type={method === 'email' ? 'email' : 'text'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            placeholder={copy.placeholder}
            className={method === 'id' ? 'font-mono' : undefined}
            hasError={!!errors.recipient}
            aria-describedby={errors.recipient ? 'invite-recipient-error' : undefined}
            {...register('recipient')}
          />
          {errors.recipient && (
            <p id="invite-recipient-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.recipient.message}
            </p>
          )}
          <button
            type="button"
            className="mt-2 rounded-sm font-body text-body-sm text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            onClick={() => onMethodChange(method === 'email' ? 'id' : 'email')}
          >
            {copy.other}
          </button>

          <div className="mt-4">
            <Label htmlFor="inviteConnectionType">They are</Label>
            <Select id="inviteConnectionType" hasError={!!errors.connectionType} {...register('connectionType')}>
              <option value="family">Family</option>
              <option value="safety_group">A safety group contact</option>
            </Select>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={isSubmitting}>
              Send request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

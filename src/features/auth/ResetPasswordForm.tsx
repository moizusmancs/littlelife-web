import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import type { ResetPasswordFormValues } from './schemas'

export interface ResetPasswordFormProps {
  register: UseFormRegister<ResetPasswordFormValues>
  errors: FieldErrors<ResetPasswordFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * No reference mockup exists for this screen — built to match Login/Register's established
 * W-Auth card pattern directly. `email` and `token` are real form fields, not URL-only params
 * (see schemas.ts for why — the reset code has no fixed length, and there's no real mailer in
 * dev, so this can't be a click-a-link-only flow). If the URL carries `?email=&token=` — a real
 * emailed link, or one pasted from a server log in dev — ResetPasswordPage pre-fills these
 * fields via `defaultValues`; either way the user can review and submit them like any form.
 * Purely presentational; all form/mutation state lives in ResetPasswordPage.
 */
export function ResetPasswordForm({ register, errors, onSubmit, isSubmitting, serverError }: ResetPasswordFormProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError && (
        <div
          role="alert"
          className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
        >
          {serverError}
        </div>
      )}

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          leadingIcon={<EnvelopeSimpleIcon size={18} />}
          hasError={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className="mt-1 font-body text-body-sm text-status-critical">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="token">Reset code</Label>
        <Input
          id="token"
          autoComplete="one-time-code"
          hasError={!!errors.token}
          aria-describedby={errors.token ? 'token-error' : 'token-hint'}
          {...register('token')}
        />
        {errors.token ? (
          <p id="token-error" className="mt-1 font-body text-body-sm text-status-critical">
            {errors.token.message}
          </p>
        ) : (
          <p id="token-hint" className="mt-1 font-body text-body-sm text-ink-500">
            From the password reset email you were sent.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="newPassword">New password</Label>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          showLockIcon={false}
          hasError={!!errors.newPassword}
          aria-describedby={errors.newPassword ? 'new-password-error' : undefined}
          {...register('newPassword')}
        />
        {errors.newPassword && (
          <p id="new-password-error" className="mt-1 font-body text-body-sm text-status-critical">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          showLockIcon={false}
          hasError={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p id="confirm-password-error" className="mt-1 font-body text-body-sm text-status-critical">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" isLoading={isSubmitting} className="mt-2 w-full">
        Reset Password
      </Button>
    </form>
  )
}

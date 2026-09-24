import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import type { ChangePasswordFormValues } from './schemas'

export interface ChangePasswordCardProps {
  register: UseFormRegister<ChangePasswordFormValues>
  errors: FieldErrors<ChangePasswordFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * Pixel reference: the "Security → Password" row in Batch 4 NGO §4m — expanded into a real form,
 * since `PATCH /auth/password` needs the current password plus the new one. The mockup's "Last
 * changed 3 months ago", two-factor authentication and recovery codes have no backing data or
 * route, so they aren't shown. The copy states the one consequence that matters: a successful
 * change revokes every session (api/00-identity.md), so the user is signed out and logs back in
 * with the new password. Purely presentational; the mutation and the forced sign-out live in
 * MyAccountPage.
 */
export function ChangePasswordCard({ register, errors, onSubmit, isSubmitting, serverError }: ChangePasswordCardProps) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-raised p-6 shadow-sm">
      <h2 className="font-heading text-h3 font-bold text-ink-900">Password</h2>
      <p className="mt-1 font-body text-body-md text-ink-500">
        Changing your password signs you out everywhere — you'll log back in with the new one.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {serverError && (
          <div
            role="alert"
            className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
          >
            {serverError}
          </div>
        )}

        <div>
          <Label htmlFor="current-password">Current password</Label>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            showLockIcon={false}
            hasError={!!errors.currentPassword}
            aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
            {...register('currentPassword')}
          />
          {errors.currentPassword && (
            <p id="current-password-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.currentPassword.message}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
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
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              showLockIcon={false}
              hasError={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirm-new-password-error' : undefined}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p id="confirm-new-password-error" className="mt-1 font-body text-body-sm text-status-critical">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" isLoading={isSubmitting}>
            Change password
          </Button>
        </div>
      </form>
    </div>
  )
}

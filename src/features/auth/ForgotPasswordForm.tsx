import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { CheckCircleIcon, EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ForgotPasswordFormValues } from './schemas'

export interface ForgotPasswordFormProps {
  register: UseFormRegister<ForgotPasswordFormValues>
  errors: FieldErrors<ForgotPasswordFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
  /** True once the backend has responded successfully — swaps the form for a confirmation
   *  panel. The backend's `POST /auth/password/forgot` always returns the same 200 regardless
   *  of whether the email is registered (deliberately enumeration-safe), so this is the ONLY
   *  outcome this screen ever shows on success — there is no "email not found" state to build. */
  isSubmitted: boolean
  submittedEmail: string
}

/**
 * No reference mockup exists for this screen — built to match Login/Register's established
 * W-Auth card pattern directly rather than inventing new visual language. Purely
 * presentational; all form/mutation state lives in ForgotPasswordPage.
 */
export function ForgotPasswordForm({
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
  isSubmitted,
  submittedEmail,
}: ForgotPasswordFormProps) {
  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-status-safe-tint">
          <CheckCircleIcon weight="fill" size={30} className="text-status-safe" />
        </div>
        <h1 className="mt-4.5 font-heading text-h1 font-bold text-ink-900">Check your email</h1>
        <p className="mt-1.5 font-body text-body-md text-ink-500">
          If <span className="font-semibold text-ink-900">{submittedEmail}</span> is registered,
          we've sent a code to reset your password.
        </p>
        <Link
          to={`/reset-password?email=${encodeURIComponent(submittedEmail)}`}
          className="mt-7 font-body text-label font-semibold text-primary-700 hover:underline"
        >
          I have a code — Reset password
        </Link>
        <Link to="/login" className="mt-3 font-body text-body-sm text-ink-500 hover:underline">
          Back to Log In
        </Link>
      </div>
    )
  }

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
          autoFocus
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

      <Button type="submit" size="lg" isLoading={isSubmitting} className="mt-2 w-full">
        Send Reset Code
      </Button>

      <p className="text-center font-body text-body-sm text-ink-500">
        <Link to="/login" className="font-semibold text-primary-700 hover:underline">
          Back to Log In
        </Link>
      </p>
    </form>
  )
}

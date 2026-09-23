import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { EnvelopeSimpleIcon, GoogleLogoIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import type { LoginFormValues } from './schemas'

export interface LoginFormProps {
  register: UseFormRegister<LoginFormValues>
  errors: FieldErrors<LoginFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  /** Server-side failure message (invalid credentials, suspended account, network error) —
   *  distinct from field-level validation errors, which come from `errors` instead. */
  serverError: string | null
  /** A non-error status to show once, e.g. "password reset, log in with your new one" after
   *  ResetPasswordPage redirects here (that route returns no session to carry forward, so a
   *  redirect + message is the only way to close the loop). */
  infoMessage?: string | null
}

/**
 * Purely presentational — every value it renders and every event it fires comes from props.
 * All form state (React Hook Form's `useForm`) and the login mutation live in LoginPage.
 *
 * Matches Batch 1.dc.html §1a pixel-for-pixel with one deliberate exception: the mockup labels
 * this field "Email or phone," but `POST /auth/login` (api/00-identity.md) only ever accepts
 * `{email, password}` — there is no phone-login route. Labeling the field for a capability the
 * backend doesn't have would be misleading, so this stays "Email."
 */
export function LoginForm({ register, errors, onSubmit, isSubmitting, serverError, infoMessage }: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {infoMessage && !serverError && (
        <div className="rounded-sm border border-status-safe bg-status-safe-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
          {infoMessage}
        </div>
      )}
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
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          hasError={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p id="password-error" className="mt-1 font-body text-body-sm text-status-critical">
            {errors.password.message}
          </p>
        )}
        <div className="mt-1.5 flex justify-end">
          <Link to="/forgot-password" className="font-body text-label font-semibold text-primary-700 hover:underline">
            Forgot password?
          </Link>
        </div>
      </div>

      <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
        Log In
      </Button>

      <div className="flex items-center gap-3 font-body text-body-sm font-medium text-ink-500">
        <div className="h-px flex-1 bg-surface-border" />
        Or continue with
        <div className="h-px flex-1 bg-surface-border" />
      </div>

      <Button
        type="button"
        disabled
        variant="secondary"
        className="h-auto min-h-12 w-full flex-wrap justify-center gap-x-2.5 gap-y-1.5 border-surface-border py-2.5 whitespace-normal text-ink-300 disabled:border-surface-border disabled:bg-surface-raised disabled:text-ink-300"
        title="Coming soon"
      >
        <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
          <GoogleLogoIcon size={18} />
          Continue with Google
        </span>
        <Badge tone="caution">Coming soon</Badge>
      </Button>

      <p className="mt-2 text-center font-body text-body-sm text-ink-500">
        Are you a citizen?{' '}
        <Link to="/register" className="font-semibold text-primary-700 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  )
}

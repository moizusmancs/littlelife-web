import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'
import { getPasswordStrength } from './passwordStrength'
import type { RegisterFormValues } from './schemas'

export interface RegisterFormProps {
  register: UseFormRegister<RegisterFormValues>
  errors: FieldErrors<RegisterFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
  /** Watched from the parent's `useForm` purely to drive the strength meter's display — this
   *  component holds no state of its own for it. */
  passwordValue: string
}

const STRENGTH_COLORS = ['bg-surface-border', 'bg-status-critical', 'bg-status-caution', 'bg-status-safe', 'bg-status-safe']
const STRENGTH_LABEL_COLORS = ['', 'text-status-critical', 'text-status-caution', 'text-status-safe', 'text-status-safe']

/**
 * Matches Batch 3 Citizen.dc.html §3a's visual language for the fields that map to a real
 * backend capability. Per the product decision (this screen only takes what `POST
 * /auth/register` accepts, see RegisterPage), it does NOT include the mockup's name, phone/SMS
 * verification, or language-picker fields — none exist on the backend. `confirmPassword` and
 * `agreedToTerms` are additions beyond the mockup: client-side-only safety/legal gates that
 * are never sent to the API, not a claim of extra backend capability.
 */
export function RegisterForm({
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
  passwordValue,
}: RegisterFormProps) {
  const strength = getPasswordStrength(passwordValue)

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
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          showLockIcon={false}
          hasError={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : 'password-strength'}
          {...register('password')}
        />
        {errors.password ? (
          <p id="password-error" className="mt-1 font-body text-body-sm text-status-critical">
            {errors.password.message}
          </p>
        ) : (
          strength.score > 0 && (
            <div id="password-strength" className="mt-1.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((segment) => (
                  <div
                    key={segment}
                    className={cn('h-1 flex-1 rounded-full', segment <= strength.score ? STRENGTH_COLORS[strength.score] : 'bg-surface-border')}
                  />
                ))}
              </div>
              <p className={cn('mt-1 font-body text-body-sm', STRENGTH_LABEL_COLORS[strength.score])}>{strength.label}</p>
            </div>
          )
        )}
      </div>

      <div>
        <Label htmlFor="confirmPassword">Confirm password</Label>
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

      <div>
        <label className="flex items-start gap-2.5 font-body text-body-sm text-ink-700">
          <span className="mt-0.5">
            <Checkbox
              aria-describedby={errors.agreedToTerms ? 'terms-error' : undefined}
              {...register('agreedToTerms')}
            />
          </span>
          <span>
            I agree to the <span className="font-semibold text-primary-700">Terms</span> and{' '}
            <span className="font-semibold text-primary-700">Privacy Policy</span>, including location
            sharing during active alerts.
          </span>
        </label>
        {errors.agreedToTerms && (
          <p id="terms-error" className="mt-1 font-body text-body-sm text-status-critical">
            {errors.agreedToTerms.message}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" isLoading={isSubmitting} className="mt-1 w-full">
        Continue
      </Button>

      <p className="text-center font-body text-body-sm text-ink-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  )
}

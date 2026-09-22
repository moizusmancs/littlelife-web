import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { UserCircleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingProfileFormValues } from './schemas'

export interface OnboardingProfileFormProps {
  register: UseFormRegister<OnboardingProfileFormValues>
  errors: FieldErrors<OnboardingProfileFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
}

/**
 * No reference mockup exists for this screen (only Login/Register/OTP were designed) — built
 * to extend the same centered-card idiom the OTP screen established, matching the design
 * system's tokens directly rather than a pixel source. Purely presentational; all form/mutation
 * state lives in OnboardingProfilePage.
 */
export function OnboardingProfileForm({ register, errors, onSubmit, isSubmitting, serverError }: OnboardingProfileFormProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary-50">
        <UserCircleIcon weight="fill" size={30} className="text-primary-500" />
      </div>
      <h1 className="mt-4.5 font-heading text-h1 font-bold text-ink-900">What should we call you?</h1>
      <p className="mt-1.5 font-body text-body-md text-ink-500">
        This is how you'll appear to your safety group and to NGOs reviewing your reports.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-7 w-full">
        {serverError && (
          <div
            role="alert"
            className="mb-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 text-start font-body text-body-sm text-ink-900"
          >
            {serverError}
          </div>
        )}

        <div className="text-start">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            hasError={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p id="name-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.name.message}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" isLoading={isSubmitting} className="mt-6 w-full">
          Continue
        </Button>
      </form>
    </div>
  )
}

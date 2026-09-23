import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EditProfileFormValues } from './schemas'

export interface EditProfileFormProps {
  register: UseFormRegister<EditProfileFormValues>
  errors: FieldErrors<EditProfileFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
  /** True once the profile's real `name` has loaded — until then the field renders as a
   *  skeleton rather than a briefly-empty, briefly-submittable input. */
  isLoaded: boolean
  /** True right after a successful save, until the field is edited again (see EditProfilePage's
   *  comment on how this is derived from form dirtiness, not a separate timer). */
  showSaved: boolean
}

/**
 * No reference mockup pictures this exact panel — Batch 2 §2g ("Profile › Invitations") shows
 * the shared sidebar this renders beside, not the Edit Profile content itself — so this card
 * matches the design system's tokens directly (`W-Settings` panel: heading, subtitle, labeled
 * field, primary Save button), same approach as OnboardingProfileForm. `name` is the only field
 * here because it's the only field `PATCH /profile` accepts (api/05-profiling.md) — full profile
 * (photo, phone, etc., if the backend ever adds them) is out of scope until a later phase.
 * Purely presentational; all form/query/mutation state lives in EditProfilePage.
 */
export function EditProfileForm({
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
  isLoaded,
  showSaved,
}: EditProfileFormProps) {
  return (
    <div className="max-w-140 rounded-md border border-surface-border bg-surface-raised p-6 md:p-8">
      <h1 className="font-heading text-h2 font-bold text-ink-900">Edit Profile</h1>
      <p className="mt-1 font-body text-body-md text-ink-500">
        This is how you'll appear to your safety group and to NGOs reviewing your reports.
      </p>

      {!isLoaded ? (
        <div className="mt-6">
          <div className="h-5 w-24 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
          <div className="mt-1.5 h-12 w-full animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-6">
          {serverError && (
            <div
              role="alert"
              className="mb-4 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
            >
              {serverError}
            </div>
          )}

          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            hasError={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p id="name-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.name.message}
            </p>
          )}

          <div className="mt-6 flex items-center gap-4">
            <Button type="submit" isLoading={isSubmitting}>
              Save
            </Button>
            {showSaved && (
              <span className="flex items-center gap-1.5 font-body text-body-sm text-status-safe">
                <CheckCircleIcon weight="fill" size={18} />
                Saved
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

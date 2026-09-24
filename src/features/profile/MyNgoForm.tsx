import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RegisterNgoFormValues } from './schemas'

export interface MyNgoFormProps {
  register: UseFormRegister<RegisterNgoFormValues>
  errors: FieldErrors<RegisterNgoFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  serverError: string | null
  title: string
  description: string
  /** `h1` when this card is the first thing on the page, `h2` when a status card sits above it
   *  (the rejected → resubmit case) so the page never ends up with two `h1`s. */
  titleAs?: 'h1' | 'h2'
}

/**
 * No reference mockup pictures this screen — WEB_DESIGN_PLAN.md §9 describes it only in prose
 * ("a status card (no NGO / pending / active) plus a 'Register an NGO' form when none exists").
 * Built as one inline W-Settings card, same idiom as EditProfileForm/AccountSettingsPanel, rather
 * than the spec's "drawer" — there's no list this opens from, so an inline form matches the rest
 * of this Profile shell better than introducing a new overlay pattern for one screen. This is
 * only the form; MyNgoPage decides whether to show it at all (no submission yet, or the latest
 * one was rejected) and renders MyNgoStatusCard for everything else. Purely presentational; all
 * form/query/mutation state lives in MyNgoPage.
 */
export function MyNgoForm({
  register,
  errors,
  onSubmit,
  isSubmitting,
  serverError,
  title,
  description,
  titleAs: Title = 'h1',
}: MyNgoFormProps) {
  return (
    <div className="max-w-140 rounded-md border border-surface-border bg-surface-raised p-6 md:p-8">
      <Title className="font-heading text-h2 font-bold text-ink-900">{title}</Title>
      <p className="mt-1 font-body text-body-md text-ink-500">{description}</p>

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
          <Label htmlFor="ngo-name">Organisation name</Label>
          <Input
            id="ngo-name"
            hasError={!!errors.name}
            aria-describedby={errors.name ? 'ngo-name-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p id="ngo-name-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="ngo-contact-email">Contact email (optional)</Label>
          <Input
            id="ngo-contact-email"
            type="email"
            autoComplete="email"
            hasError={!!errors.contactEmail}
            aria-describedby={errors.contactEmail ? 'ngo-contact-email-error' : undefined}
            {...register('contactEmail')}
          />
          {errors.contactEmail && (
            <p id="ngo-contact-email-error" className="mt-1 font-body text-body-sm text-status-critical">
              {errors.contactEmail.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="ngo-contact-phone">Contact phone (optional)</Label>
          <Input id="ngo-contact-phone" autoComplete="tel" {...register('contactPhone')} />
        </div>

        <Button type="submit" size="lg" isLoading={isSubmitting} className="mt-2 w-full">
          Register NGO
        </Button>
      </form>
    </div>
  )
}

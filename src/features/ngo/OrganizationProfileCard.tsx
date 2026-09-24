import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { format, parseISO } from 'date-fns'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getInitials } from '@/lib/utils'
import type { NgoStatus } from '@/api/identity'
import type { OrganizationSettingsFormValues } from './schemas'

const STATUS_BADGE: Record<NgoStatus, { label: string; tone: 'safe' | 'caution' | 'critical' | 'info' }> = {
  active: { label: 'Active', tone: 'safe' },
  pending_approval: { label: 'Pending approval', tone: 'caution' },
  rejected: { label: 'Not approved', tone: 'critical' },
  suspended: { label: 'Suspended', tone: 'critical' },
  deactivated: { label: 'Deactivated', tone: 'info' },
}

export interface OrganizationProfileCardProps {
  /** The organisation as the server last returned it — drives the header, not the live inputs,
   *  so the name above the form doesn't change under the cursor while typing. */
  organization: { name: string; status: NgoStatus; created_at: string }
  register: UseFormRegister<OrganizationSettingsFormValues>
  errors: FieldErrors<OrganizationSettingsFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onDiscard: () => void
  isSubmitting: boolean
  /** Whether any field differs from what the server has — Save and Discard only act on real changes. */
  isDirty: boolean
  serverError: string | null
  /** True right after a successful save, until a field is edited again (derived from form
   *  dirtiness in OrganizationSettingsPage, not a timer). */
  showSaved: boolean
}

/**
 * Pixel reference: Batch 4 NGO §4l "Organization Settings" — the "Organization profile" card:
 * initials tile + name/contact fields. Only what `GET`/`PATCH /ngo/me` really has is built: name,
 * contact email, contact phone (the mockup also shows a logo upload, a registration number, a
 * public description, and a card of notification toggles — none has a field or route). Save and
 * Discard live at the card's foot (WEB_DESIGN_PLAN.md §6.3: "Save (contact info section)") instead
 * of the mockup's page-header bar, so they stay next to the fields on narrow screens too. The
 * mockup's "Registered since" chip becomes the real `created_at`. Purely presentational; all
 * query/form/mutation state lives in OrganizationSettingsPage.
 */
export function OrganizationProfileCard({
  organization,
  register,
  errors,
  onSubmit,
  onDiscard,
  isSubmitting,
  isDirty,
  serverError,
  showSaved,
}: OrganizationProfileCardProps) {
  const badge = STATUS_BADGE[organization.status] ?? STATUS_BADGE.deactivated

  return (
    <div className="rounded-md border border-surface-border bg-surface-raised p-6 shadow-sm">
      <h2 className="font-heading text-h3 font-bold text-ink-900">Organization profile</h2>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="flex size-16 flex-none items-center justify-center rounded-lg bg-status-trust-tint font-heading text-h2 font-extrabold text-status-trust"
          aria-hidden="true"
        >
          {getInitials(organization.name)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-heading text-body-lg font-bold break-words text-ink-900">{organization.name}</p>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          <p className="mt-0.5 font-body text-body-sm text-ink-500">
            Registered {format(parseISO(organization.created_at), 'MMM yyyy')}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {serverError && (
          <div
            role="alert"
            className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
          >
            {serverError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="org-name">Organisation name</Label>
            <Input
              id="org-name"
              hasError={!!errors.name}
              aria-describedby={errors.name ? 'org-name-error' : undefined}
              {...register('name')}
            />
            {errors.name && (
              <p id="org-name-error" className="mt-1 font-body text-body-sm text-status-critical">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="org-contact-email">Contact email</Label>
            <Input
              id="org-contact-email"
              type="email"
              autoComplete="off"
              hasError={!!errors.contactEmail}
              aria-describedby={errors.contactEmail ? 'org-contact-email-error' : undefined}
              {...register('contactEmail')}
            />
            {errors.contactEmail && (
              <p id="org-contact-email-error" className="mt-1 font-body text-body-sm text-status-critical">
                {errors.contactEmail.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="org-contact-phone">Contact phone</Label>
            <Input id="org-contact-phone" autoComplete="off" {...register('contactPhone')} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {showSaved && (
            <span className="me-auto flex items-center gap-1.5 font-body text-body-sm text-status-safe">
              <CheckCircleIcon weight="fill" size={18} />
              Saved
            </span>
          )}
          <Button type="button" variant="ghost" disabled={!isDirty || isSubmitting} onClick={onDiscard}>
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty} isLoading={isSubmitting}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  )
}

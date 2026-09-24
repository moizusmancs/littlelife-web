import type { FormEvent } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { BuildingsIcon, CheckCircleIcon, EnvelopeSimpleIcon, SealCheckIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getInitials } from '@/lib/utils'
import type { EditProfileFormValues } from '@/features/profile/schemas'

export interface AccountProfileCardProps {
  email: string
  roleLabel: string
  /** The signed-in NGO staff member's organisation, when they have one — omitted for platform admins. */
  organizationName?: string | null
  /** The server's current name — `null` until the first load. Drives the header, not the live input. */
  name: string | null
  register: UseFormRegister<EditProfileFormValues>
  errors: FieldErrors<EditProfileFormValues>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  isDirty: boolean
  serverError: string | null
  /** True right after a successful save, until the field is edited again. */
  showSaved: boolean
  /** Whether the name has loaded (or failed) — until then the name field is a skeleton. */
  isLoaded: boolean
  /** A real load failure (e.g. `404 "profile not found"`); shown in place of the name field with a
   *  retry, while the rest of the card (email, role) stays visible. */
  loadError: string | null
  onRetry: () => void
}

/**
 * Pixel reference: Batch 4 NGO §4m "My Account" — the profile card: large initials avatar, the name,
 * role and organisation chips, then the fields. Only what the backend really has is built: the
 * name is the one editable field (`PATCH /profile`), the email is shown read-only (there's no route
 * to change it), and the role/organisation chips come from the session and `GET /ngo/me`. The
 * mockup also has a job title, a mobile number, an interface-language picker and a "Since <date>"
 * chip — none has a field or route (`GET /auth/me` returns no created-at). Purely presentational;
 * all query/form/mutation state lives in MyAccountPage (via `useEditProfile`).
 */
export function AccountProfileCard({
  email,
  roleLabel,
  organizationName,
  name,
  register,
  errors,
  onSubmit,
  isSubmitting,
  isDirty,
  serverError,
  showSaved,
  isLoaded,
  loadError,
  onRetry,
}: AccountProfileCardProps) {
  const displayName = name?.trim() ? name : null
  const initials = getInitials(displayName ?? '') || email.slice(0, 2).toUpperCase()

  return (
    <div className="rounded-md border border-surface-border bg-surface-raised p-6 shadow-sm">
      <h2 className="font-heading text-h3 font-bold text-ink-900">Profile</h2>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="flex size-16 flex-none items-center justify-center rounded-full bg-primary-100 font-heading text-h3 font-bold text-primary-700"
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-heading text-body-lg font-bold break-words text-ink-900">
            {displayName ?? (isLoaded && !loadError ? 'Add your name' : '\u00a0')}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="trust">{roleLabel}</Badge>
            {organizationName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 font-body text-[11px] font-medium text-ink-700">
                <BuildingsIcon size={12} aria-hidden="true" />
                {organizationName}
              </span>
            )}
          </div>
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

        <div>
          <Label htmlFor="account-email">Email</Label>
          <Input
            id="account-email"
            type="email"
            readOnly
            value={email}
            aria-describedby="account-email-hint"
            leadingIcon={<EnvelopeSimpleIcon size={18} />}
            trailingSlot={<SealCheckIcon weight="fill" size={18} className="text-status-trust" aria-label="Verified" />}
            className="text-ink-700"
          />
          <p id="account-email-hint" className="mt-1 font-body text-body-sm text-ink-500">
            The email you sign in with — it can't be changed here.
          </p>
        </div>

        <div>
          <Label htmlFor="account-name">Full name</Label>
          {loadError ? (
            <div className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5">
              <p role="alert" className="font-body text-body-sm text-ink-900">
                {loadError}
              </p>
              <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : !isLoaded ? (
            <div className="h-12 w-full animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
          ) : (
            <>
              <Input
                id="account-name"
                autoComplete="name"
                hasError={!!errors.name}
                aria-describedby={errors.name ? 'account-name-error' : undefined}
                {...register('name')}
              />
              {errors.name && (
                <p id="account-name-error" className="mt-1 font-body text-body-sm text-status-critical">
                  {errors.name.message}
                </p>
              )}
            </>
          )}
        </div>

        {!loadError && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {showSaved && (
              <span className="me-auto flex items-center gap-1.5 font-body text-body-sm text-status-safe">
                <CheckCircleIcon weight="fill" size={18} />
                Saved
              </span>
            )}
            <Button type="submit" disabled={!isLoaded || !isDirty} isLoading={isSubmitting}>
              Save changes
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}

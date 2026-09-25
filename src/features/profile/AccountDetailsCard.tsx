import { format, parseISO } from 'date-fns'
import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'

export interface AccountDetailsCardProps {
  /** The account's sign-in email. */
  email: string
  /** Whether the email has been verified — shown as a badge. */
  emailVerified: boolean
  /** When the account was created (`GET /profile`'s `created_at`), or `undefined` until the profile has loaded. */
  memberSince: string | undefined
}

/**
 * The read-only facts about the account that the API returns and Edit Profile didn't show: the email (which is how you sign in
 * and how people invite you to a safety group) and how long you've been a member. **Nothing here is editable because nothing
 * can be** — `PATCH /profile` takes a name and a home region and nothing else, and no route changes an email; there is no phone
 * number, photo or date of birth anywhere in the API, so there are no such fields to add. Purely presentational.
 */
export function AccountDetailsCard({ email, emailVerified, memberSince }: AccountDetailsCardProps) {
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-6 shadow-sm" aria-labelledby="account-details-heading">
      <h2 id="account-details-heading" className="font-heading text-h3 font-bold text-ink-900">
        Your account
      </h2>
      <p className="mt-1 font-body text-body-sm text-ink-500">The email you sign in with, and the one people use to invite you to a safety group.</p>

      <dl className="mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 flex-none items-center justify-center rounded-full bg-primary-100 text-primary-700" aria-hidden="true">
            <EnvelopeSimpleIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <dt className="font-body text-body-sm text-ink-500">Email</dt>
            <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-body-md font-semibold text-ink-900">
              <span className="[overflow-wrap:anywhere]">{email}</span>
              {emailVerified && <Badge tone="trust">Verified</Badge>}
            </dd>
          </div>
        </div>
        <div className="border-t border-surface-border pt-3">
          <dt className="font-body text-body-sm text-ink-500">Member since</dt>
          <dd className="font-body text-body-md text-ink-900">
            {memberSince ? format(parseISO(memberSince), 'd MMMM yyyy') : <span className="inline-block h-4 w-28 animate-pulse rounded-sm bg-surface-sunken align-middle" aria-label="Loading" role="status" />}
          </dd>
        </div>
      </dl>
    </section>
  )
}

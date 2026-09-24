import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { AccountStatusBadge } from '@/features/account/AccountStatusBadge'
import type { Volunteer } from '@/api/identity'

export interface NgoVolunteersCardProps {
  volunteers: Volunteer[] | undefined
  isLoading: boolean
  error: string | null
  onRetry: () => void
}

/**
 * The organisation's volunteer roster, read-only (`GET /admin/ngos/{id}/volunteers`) — the same
 * fields as the NGO's own roster: email, the account's status, and when the *account* was created.
 * Each email links to that account's page, which is where an admin can act on it; nothing here
 * changes anything. Purely presentational.
 */
export function NgoVolunteersCard({ volunteers, isLoading, error, onRetry }: NgoVolunteersCardProps) {
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm" aria-labelledby="ngo-volunteers-heading">
      <h2 id="ngo-volunteers-heading" className="font-heading text-h3 font-bold text-ink-900">
        Volunteers{volunteers && volunteers.length > 0 ? ` · ${volunteers.length}` : ''}
      </h2>

      {isLoading ? (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true" aria-label="Loading volunteers">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-sm bg-surface-sunken" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-3">
          <p role="alert" className="font-body text-body-sm text-status-critical">
            {error}
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : !volunteers || volunteers.length === 0 ? (
        <p className="mt-3 font-body text-body-md text-ink-500">This organisation has no volunteers.</p>
      ) : (
        <ul className="mt-3 divide-y divide-surface-border">
          {volunteers.map((volunteer) => (
            <li key={volunteer.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 first:pt-1">
              <Link
                to={`/admin/users/${volunteer.id}`}
                className="min-w-0 flex-1 basis-56 font-body text-body-md font-medium text-primary-700 [overflow-wrap:anywhere] hover:underline"
              >
                {volunteer.email}
              </Link>
              <AccountStatusBadge status={volunteer.status} />
              <span className="font-body text-body-sm text-ink-500">
                Account created {format(parseISO(volunteer.created_at), 'd MMM yyyy')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

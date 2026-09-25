import { format, parseISO } from 'date-fns'
import { UserMinusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { AccountStatusBadge } from '@/features/account/AccountStatusBadge'
import type { Volunteer } from '@/api/identity'

/** One shared column template so the header and every row line up from `md` up. */
const COLUMNS = 'xl:grid-cols-[minmax(0,1fr)_7rem_9.5rem_auto]'

export interface VolunteerRosterProps {
  volunteers: Volunteer[]
  onRemove: (volunteer: Volunteer) => void
}

/**
 * The roster from `GET /ngo/volunteers`, in the server's order (newest first). Pattern W-List; the
 * closest pixel reference is the NGO allocations table (Batch 4 §4f) — uppercase 11px column
 * labels over 48px rows — since the Volunteers screen itself has no mockup.
 *
 * Only what the API returns is shown: email, the *account's* status, and when the account was
 * created (labelled as exactly that — the roster has no "joined" date). There is no name column
 * because names live in the profile, which has no NGO-side route.
 *
 * Below `md` each row becomes a two-line card (email + Remove, then status + date) instead of
 * squeezing four columns into a phone. Purely presentational; removal belongs to the page.
 */
export function VolunteerRoster({ volunteers, onRemove }: VolunteerRosterProps) {
  return (
    <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised shadow-sm">
      <div
        className={`hidden h-10 items-center gap-4 border-b border-surface-border bg-surface-base px-5 font-body text-[11px] font-semibold tracking-wider text-ink-500 uppercase xl:grid ${COLUMNS}`}
        aria-hidden="true"
      >
        <div>Volunteer</div>
        <div>Status</div>
        <div>Account created</div>
        <div className="w-24" />
      </div>

      <ul>
        {volunteers.map((volunteer) => (
          <li
            key={volunteer.id}
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-surface-border px-4 py-3.5 last:border-b-0 xl:gap-x-4 xl:px-5 ${COLUMNS}`}
          >
            <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
              <div
                className="flex size-9 flex-none items-center justify-center rounded-full bg-primary-100 font-heading text-label font-semibold text-primary-700"
                aria-hidden="true"
              >
                {volunteer.email.slice(0, 2).toUpperCase()}
              </div>
              <span className="min-w-0 font-body text-body-md font-medium text-ink-900 [overflow-wrap:anywhere]">
                {volunteer.email}
              </span>
            </div>

            <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 ps-12 xl:contents">
              <div className="flex items-center xl:col-start-2 xl:row-start-1">
                <AccountStatusBadge status={volunteer.status} />
              </div>
              <span className="font-body text-body-sm text-ink-500 xl:col-start-3 xl:row-start-1">
                <span className="xl:hidden">Account created </span>
                {format(parseISO(volunteer.created_at), 'd MMM yyyy')}
              </span>
            </div>

            <div className="col-start-2 row-start-1 flex justify-end xl:col-start-4">
              <Button
                type="button"
                variant="dangerOutline"
                size="sm"
                onClick={() => onRemove(volunteer)}
                aria-label={`Remove ${volunteer.email} from your organisation`}
              >
                <UserMinusIcon size={16} aria-hidden="true" />
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

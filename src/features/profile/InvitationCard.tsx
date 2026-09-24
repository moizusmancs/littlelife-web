import { format, parseISO } from 'date-fns'
import { CheckIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import type { VolunteerInvitation } from '@/api/identity'

export interface InvitationCardProps {
  invitation: VolunteerInvitation
  onAccept: () => void
  onDecline: () => void
  /** Which action is currently in flight for THIS invitation — drives that button's spinner. */
  busy: 'accept' | 'decline' | null
  /** True while any invitation's action is in flight, so buttons can't be double-fired (accept in
   *  particular signs the account out). */
  disabled: boolean
}

/**
 * Pixel reference: Batch 2 (`LittleLife Web Mockups.dc.html`) §2g — avatar with a small trust-teal
 * check badge, NGO name, one meta line, Decline (ghost) + Accept (primary). The mockup's meta
 * carries "Invited by <person> · <role>" plus a second line of region/coverage detail; the real
 * `GET /volunteer-invitations` returns only the NGO's name and the invite date, so the meta line
 * is just "Invited <date>" — nothing is invented for the rest. Stacks on narrow screens (buttons
 * drop below, full width). Purely presentational; the actions belong to InvitationsPage.
 */
export function InvitationCard({ invitation, onAccept, onDecline, busy, disabled }: InvitationCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-surface-border bg-surface-raised p-4.5 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative flex-none">
          <div
            className="flex size-12 items-center justify-center rounded-full bg-primary-100 font-heading text-body-md font-bold text-primary-700"
            aria-hidden="true"
          >
            {getInitials(invitation.ngo_name)}
          </div>
          <span
            className="absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full border-2 border-surface-raised bg-status-trust"
            aria-hidden="true"
          >
            <CheckIcon weight="bold" size={10} className="text-white" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-heading text-body-lg font-bold break-words text-ink-900">{invitation.ngo_name}</p>
          <p className="mt-0.5 font-body text-body-sm text-ink-500">
            Invited {format(parseISO(invitation.created_at), 'd MMM yyyy')}
          </p>
        </div>
      </div>

      <div className="flex flex-none gap-2 sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="flex-1 sm:flex-none"
          isLoading={busy === 'decline'}
          disabled={disabled}
          onClick={onDecline}
          aria-label={`Decline invitation from ${invitation.ngo_name}`}
        >
          Decline
        </Button>
        <Button
          type="button"
          className="flex-1 sm:flex-none"
          isLoading={busy === 'accept'}
          disabled={disabled}
          onClick={onAccept}
          aria-label={`Accept invitation from ${invitation.ngo_name}`}
        >
          Accept
        </Button>
      </div>
    </div>
  )
}

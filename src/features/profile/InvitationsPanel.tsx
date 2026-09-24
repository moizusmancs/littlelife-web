import { EnvelopeOpenIcon, InfoIcon } from '@phosphor-icons/react'
import type { VolunteerInvitation } from '@/api/identity'
import { InvitationCard } from './InvitationCard'

export interface InvitationsPanelProps {
  invitations: VolunteerInvitation[]
  onAccept: (invitation: VolunteerInvitation) => void
  onDecline: (invitation: VolunteerInvitation) => void
  /** The action currently in flight, if any — `null` when idle. */
  pending: { id: string; action: 'accept' | 'decline' } | null
  /** A real server error from the last accept/decline (404 "invitation not found", 409
   *  "invitation is not pending" / "ngo is not active"), shown above the list. */
  actionError: string | null
}

/**
 * Pixel reference: Batch 2 §2g "Profile › Invitations" — title + explanatory paragraph, an info
 * banner about one-role-per-account, a "PENDING · n" label, then a card per invitation. The
 * mockup's "PAST · n" section (declined/accepted history) is NOT built: `GET
 * /volunteer-invitations` returns pending invitations only, so there's no history to show.
 * Empty state is added (the mockup only pictures a populated list). Purely presentational.
 */
export function InvitationsPanel({ invitations, onAccept, onDecline, pending, actionError }: InvitationsPanelProps) {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-h2 font-bold text-ink-900">Volunteer invitations</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">
          NGOs operating in your area can invite you to volunteer. Accepting converts this account to an
          NGO volunteer account — you'll be signed out of the citizen app and continue in the NGO console.
        </p>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
        >
          {actionError}
        </div>
      )}

      {invitations.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border px-6 py-10 text-center">
          <EnvelopeOpenIcon size={32} className="text-ink-300" aria-hidden="true" />
          <p className="mt-3 font-body text-body-md font-semibold text-ink-900">No pending invitations</p>
          <p className="mt-1 font-body text-body-sm text-ink-500">
            When an NGO invites you to volunteer, it'll show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2.5 rounded-md border border-status-info/30 bg-status-info-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
            <InfoIcon weight="fill" size={20} className="mt-px flex-none text-status-info" aria-hidden="true" />
            One account holds one role at a time. You can ask the NGO admin to remove you later to return to a
            citizen account.
          </div>

          <h2 className="font-body text-[11px] font-bold tracking-[0.8px] text-ink-500 uppercase">
            Pending · {invitations.length}
          </h2>

          <ul className="flex flex-col gap-3">
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <InvitationCard
                  invitation={invitation}
                  onAccept={() => onAccept(invitation)}
                  onDecline={() => onDecline(invitation)}
                  busy={pending?.id === invitation.id ? pending.action : null}
                  disabled={pending !== null}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

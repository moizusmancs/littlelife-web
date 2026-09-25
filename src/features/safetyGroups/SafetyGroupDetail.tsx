import type { ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowLeftIcon, XIcon } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import type { SafetyConnection } from '@/api/trust'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { ConnectionTypeBadge } from './ConnectionTypeBadge'
import { MemberAvatar } from './MemberAvatar'
import { otherParty, partyLabel, sentByMe, standingOf, TYPE_LABEL, type Standing } from './connections'
import type { ConnectionAction } from './useConnectionActions'

export interface SafetyGroupDetailProps {
  connection: SafetyConnection
  me: string
  /** Notices / errors from the last action, drawn under the header. */
  banner?: ReactNode
  /** For a connected member: their live location, and the switch that shares yours. */
  liveLocation?: ReactNode
  shareCard?: ReactNode
  /** The action in flight for this connection, if any. */
  busy: ConnectionAction | null
  onAccept: () => void
  onDecline: () => void
  /** Opens the confirm dialog. */
  onRemove: () => void
}

const STATUS: Record<Standing, { tone: 'safe' | 'caution' | 'critical' | 'info'; text: string }> = {
  connected: { tone: 'safe', text: 'Connected' },
  incoming: { tone: 'caution', text: 'Waiting for you' },
  outgoing: { tone: 'caution', text: 'Waiting for their reply' },
  declined: { tone: 'critical', text: 'Declined' },
}

const day = (iso: string) => format(parseISO(iso), 'd MMM yyyy')

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="font-body text-body-sm text-ink-500 sm:w-40 sm:flex-none">{label}</dt>
      <dd className="min-w-0 font-body text-body-md text-ink-900">{children}</dd>
    </div>
  )
}

/**
 * /app/safety-groups/:id — one connection. A back link, who it is (their name and email as far as the backend
 * shows them; the full Member ID is here too, with a copy button, since it is the one thing that always identifies them), the facts the API does return (kind, standing, who asked, when), and the
 * actions that fit where it stands: Accept/Decline for a request waiting on you, Cancel request for one
 * you sent, Remove for a connected or declined one. For a connected member the container also passes their live location and the
 * switch that shares yours (one switch for everyone connected — the relay can't aim at one person). Purely presentational.
 */
export function SafetyGroupDetail({ connection, me, banner, liveLocation, shareCard, busy, onAccept, onDecline, onRemove }: SafetyGroupDetailProps) {
  const standing = standingOf(connection, me)
  const party = otherParty(connection, me)
  const otherId = party.accountId
  const label = partyLabel(party)
  const status = STATUS[standing]
  const disabled = busy !== null

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        to="/app/safety-groups"
        className="inline-flex w-fit items-center gap-1.5 rounded-sm font-body text-body-md text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        <ArrowLeftIcon size={16} aria-hidden="true" />
        Back to Safety Groups
      </Link>

      <div className="flex items-center gap-4">
        <MemberAvatar name={party.name} className="size-14" />
        <div className="min-w-0">
          <h1 className="font-heading text-h2 font-bold break-words text-ink-900">{label}</h1>
          {party.name.trim() && party.email && <p className="font-body text-body-md break-all text-ink-700">{party.email}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ConnectionTypeBadge type={connection.connection_type} />
            <Badge tone={status.tone}>{status.text}</Badge>
          </div>
        </div>
      </div>

      {banner}

      {liveLocation}

      {shareCard}

      <section aria-labelledby="member-id-heading" className="rounded-md border border-surface-border bg-surface-raised p-4 shadow-sm">
        <h2 id="member-id-heading" className="font-body text-body-md font-semibold text-ink-900">
          Member ID
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 font-mono text-body-sm break-all text-ink-900 select-all" data-testid="member-id">
            {otherId}
          </p>
          <CopyButton text={otherId} label="Member ID" />
        </div>
      </section>

      <section aria-labelledby="details-heading" className="rounded-md border border-surface-border bg-surface-raised px-4 shadow-sm">
        <h2 id="details-heading" className="sr-only">
          Details
        </h2>
        <dl className="divide-y divide-surface-border">
          <Fact label="Relationship">{TYPE_LABEL[connection.connection_type]}</Fact>
          <Fact label="Requested by">{sentByMe(connection, me) ? 'You' : 'Them'}</Fact>
          <Fact label="Requested on">{day(connection.created_at)}</Fact>
          {connection.responded_at && (
            <Fact label={connection.status === 'accepted' ? 'Accepted on' : 'Declined on'}>{day(connection.responded_at)}</Fact>
          )}
        </dl>
      </section>

      {standing === 'incoming' && (
        <div className="flex flex-col gap-3 rounded-md border border-primary-200 bg-primary-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="font-body text-body-md text-ink-900">This person wants to connect with you.</p>
          <div className="flex flex-none gap-2">
            <Button type="button" variant="ghost" className="flex-1 lg:flex-none" isLoading={busy === 'decline'} disabled={disabled} onClick={onDecline}>
              Decline
            </Button>
            <Button type="button" className="flex-1 lg:flex-none" isLoading={busy === 'accept'} disabled={disabled} onClick={onAccept}>
              Accept
            </Button>
          </div>
        </div>
      )}

      {standing !== 'incoming' && (
        <div className="flex flex-col gap-2">
          <div>
            <Button type="button" variant="dangerOutline" isLoading={busy === 'remove'} disabled={disabled} onClick={onRemove}>
              <XIcon size={14} weight="bold" aria-hidden="true" />
              {standing === 'connected' ? 'Remove member' : standing === 'outgoing' ? 'Cancel request' : 'Remove'}
            </Button>
          </div>
          {standing === 'connected' && (
            <p className="font-body text-body-sm text-ink-500">Removing ends the connection for both of you.</p>
          )}
        </div>
      )}
    </div>
  )
}

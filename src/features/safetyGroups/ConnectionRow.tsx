import { format, parseISO } from 'date-fns'
import { CaretRightIcon } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import type { SafetyConnection } from '@/api/trust'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ConnectionTypeBadge } from './ConnectionTypeBadge'
import { MemberAvatar } from './MemberAvatar'
import { otherParty, partyLabel, sentByMe, standingOf, type Standing } from './connections'
import type { ConnectionAction } from './useConnectionActions'

export interface ConnectionRowProps {
  connection: SafetyConnection
  me: string
  /** The action in flight for THIS connection, if any — that button shows its spinner. */
  busy: ConnectionAction | null
  /** True while any connection's action is in flight, so nothing can be fired twice. */
  disabled: boolean
  onAccept: () => void
  onDecline: () => void
  /** Opens the confirm dialog to remove (cancel / sever / tidy away) the connection. */
  onRemove: () => void
  /** This member is sharing their live location right now (a position heard within the last three heartbeats). */
  live?: boolean
}

const day = (iso: string) => format(parseISO(iso), 'd MMM yyyy')

/** The one line under the name: what happened, and when. */
function metaLine(connection: SafetyConnection, standing: Standing, me: string): string {
  switch (standing) {
    case 'incoming':
      return `Wants to connect · ${day(connection.created_at)}`
    case 'outgoing':
      return `You invited them · ${day(connection.created_at)}`
    case 'connected':
      return `Connected since ${day(connection.responded_at ?? connection.created_at)}`
    case 'declined': {
      const when = day(connection.responded_at ?? connection.updated_at)
      return sentByMe(connection, me) ? `They declined · ${when}` : `You declined · ${when}`
    }
  }
}

/**
 * One connection as a row: who (their name, else their email, else "Member" + the start of their id), which kind, and the line saying where it stands,
 * with the name linking to its detail screen. What sits on the right depends on that standing — a
 * request waiting on you gets Accept/Decline, one you sent gets Cancel request, a declined one gets
 * Remove, and a connected one just shows a caret (its removal is on the detail screen, where the
 * consequences are spelled out). The actions sit beside the name only from `lg`: the profile sidebar
 * takes ~300px from every width between `md` and `lg`, so they drop below it (full width) until then.
 * Purely presentational.
 */
export function ConnectionRow({ connection, me, busy, disabled, onAccept, onDecline, onRemove, live = false }: ConnectionRowProps) {
  const standing = standingOf(connection, me)
  const party = otherParty(connection, me)
  const label = partyLabel(party)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md border bg-surface-raised p-4 shadow-sm lg:flex-row lg:items-center lg:gap-4',
        standing === 'incoming' ? 'border-primary-200 bg-primary-50' : 'border-surface-border',
      )}
    >
      <Link
        to={`/app/safety-groups/${connection.id}`}
        className="group flex min-w-0 flex-1 items-center gap-3.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        <MemberAvatar name={party.name} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 font-heading text-body-lg font-bold break-words text-ink-900 group-hover:underline">{label}</span>
            <ConnectionTypeBadge type={connection.connection_type} />
            {live && <Badge tone="trust">Live</Badge>}
          </span>
          {party.name.trim() && party.email && (
            <span className="mt-0.5 block font-body text-body-sm break-all text-ink-700">{party.email}</span>
          )}
          <span className="mt-0.5 block font-body text-body-sm text-ink-500">{metaLine(connection, standing, me)}</span>
        </span>
        {standing === 'connected' && <CaretRightIcon size={18} className="flex-none text-ink-300" aria-hidden="true" />}
      </Link>

      {standing === 'incoming' && (
        <div className="flex flex-none gap-2 lg:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 lg:flex-none"
            isLoading={busy === 'decline'}
            disabled={disabled}
            onClick={onDecline}
            aria-label={`Decline request from ${label}`}
          >
            Decline
          </Button>
          <Button
            type="button"
            className="flex-1 lg:flex-none"
            isLoading={busy === 'accept'}
            disabled={disabled}
            onClick={onAccept}
            aria-label={`Accept request from ${label}`}
          >
            Accept
          </Button>
        </div>
      )}

      {(standing === 'outgoing' || standing === 'declined') && (
        <Button
          type="button"
          variant="ghost"
          className="flex-none self-start lg:self-auto"
          isLoading={busy === 'remove'}
          disabled={disabled}
          onClick={onRemove}
          aria-label={standing === 'outgoing' ? `Cancel your request to ${label}` : `Remove the declined request with ${label}`}
        >
          {standing === 'outgoing' ? 'Cancel request' : 'Remove'}
        </Button>
      )}
    </div>
  )
}

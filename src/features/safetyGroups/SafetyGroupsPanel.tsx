import type { ReactNode } from 'react'
import { PlusIcon, UsersThreeIcon } from '@phosphor-icons/react'
import type { SafetyConnection } from '@/api/trust'
import { Button } from '@/components/ui/button'
import { ConnectionRow } from './ConnectionRow'
import { MemberIdCard } from './MemberIdCard'
import { groupConnections } from './connections'
import type { ConnectionAction } from './useConnectionActions'

export interface SafetyGroupsPanelProps {
  connections: SafetyConnection[]
  /** The signed-in account's id — shown as their Member ID, and how each row's direction is worked out. */
  me: string
  /** The signed-in account's email, shown as the main way to be invited. */
  email?: string
  onInvite: () => void
  /** Notices / errors from the last action, drawn between the header and the lists. */
  banner?: ReactNode
  pending: { id: string; action: ConnectionAction } | null
  onAccept: (connection: SafetyConnection) => void
  onDecline: (connection: SafetyConnection) => void
  onRemove: (connection: SafetyConnection) => void
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="font-body text-[11px] font-bold tracking-[0.8px] text-ink-500 uppercase">{children}</h2>
}

/**
 * /app/safety-groups. There is no group entity behind this — the backend only has pairwise
 * connections — so the screen is the signed-in account's *circle*: everyone they're connected to, and
 * the requests going each way. Sections, most urgent first: requests waiting on you, the people you're
 * connected to, requests you've sent, and ones that were declined. A section with nothing in it isn't
 * drawn. The mockup's "Create group" has nothing to call, so the primary action is "Invite member".
 * Each person is shown by name, else email, else "Member XXXXXXXX" — an outgoing request always shows the last
 * (or the email you typed, see `withInviteHints`), because the backend keeps the recipient's details from the person who asked.
 * Purely presentational; every action belongs to SafetyGroupsPage.
 */
export function SafetyGroupsPanel({ connections, me, email, onInvite, banner, pending, onAccept, onDecline, onRemove }: SafetyGroupsPanelProps) {
  const groups = groupConnections(connections, me)

  const renderRows = (list: SafetyConnection[]) => (
    <ul className="flex flex-col gap-3">
      {list.map((connection) => (
        <li key={connection.id}>
          <ConnectionRow
            connection={connection}
            me={me}
            busy={pending?.id === connection.id ? pending.action : null}
            disabled={pending !== null}
            onAccept={() => onAccept(connection)}
            onDecline={() => onDecline(connection)}
            onRemove={() => onRemove(connection)}
          />
        </li>
      ))}
    </ul>
  )

  const section = (heading: string, list: SafetyConnection[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-3" aria-label={heading}>
        <SectionLabel>
          {heading} · {list.length}
        </SectionLabel>
        {renderRows(list)}
      </section>
    )

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="max-w-xl min-w-0">
          <h1 className="font-heading text-h2 font-bold text-ink-900">Safety Groups</h1>
          <p className="mt-1 font-body text-body-md text-ink-500">
            The family and trusted people you're connected to. Connected people are the ones your live location can be
            shared with during an emergency.
          </p>
        </div>
        <Button type="button" onClick={onInvite}>
          <PlusIcon size={16} weight="bold" aria-hidden="true" />
          Invite member
        </Button>
      </div>

      {banner}

      <MemberIdCard memberId={me} email={email} />

      {connections.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border px-6 py-10 text-center">
          <UsersThreeIcon size={32} className="text-ink-300" aria-hidden="true" />
          <p className="mt-3 font-body text-body-md font-semibold text-ink-900">Nobody in your circle yet</p>
          <p className="mt-1 max-w-sm font-body text-body-sm text-ink-500">
            Invite a family member with their email, or give them your email or Member ID so they can invite you.
          </p>
          <Button type="button" variant="secondary" className="mt-4" onClick={onInvite}>
            Invite a member
          </Button>
        </div>
      ) : (
        <>
          {section('Requests for you', groups.incoming)}
          {section('Connected', groups.connected)}
          {section('Waiting for a reply', groups.outgoing)}
          {section('Declined', groups.declined)}
        </>
      )}
    </div>
  )
}

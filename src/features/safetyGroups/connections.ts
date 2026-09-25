import type { ConnectionType, SafetyConnection } from '@/api/trust'

/**
 * Where a connection stands *for the signed-in account*. The backend returns one row per
 * connection with no direction label, so this is worked out by comparing the two account ids with
 * your own:
 *  - `incoming`  — pending, and you're the recipient: it's waiting on *you* to accept or decline
 *  - `outgoing`  — pending, and you sent it: waiting on them
 *  - `connected` — accepted
 *  - `declined`  — declined by the recipient (you or them — `sentByMe` says which)
 */
export type Standing = 'incoming' | 'outgoing' | 'connected' | 'declined'

export const TYPE_LABEL: Record<ConnectionType, string> = {
  family: 'Family',
  safety_group: 'Safety group',
}

export const sentByMe = (connection: SafetyConnection, me: string) => connection.requester_account_id === me

export function standingOf(connection: SafetyConnection, me: string): Standing {
  if (connection.status === 'accepted') return 'connected'
  if (connection.status === 'declined') return 'declined'
  return sentByMe(connection, me) ? 'outgoing' : 'incoming'
}

/** The person on the other side of the connection, as far as the backend lets you see them (`name`/`email` are `""` when it doesn't). */
export interface Party {
  accountId: string
  name: string
  email: string
}

export function otherParty(connection: SafetyConnection, me: string): Party {
  return sentByMe(connection, me)
    ? { accountId: connection.recipient_account_id, name: connection.recipient_name, email: connection.recipient_email }
    : { accountId: connection.requester_account_id, name: connection.requester_name, email: connection.requester_email }
}

/** The first eight characters of an account id — the last-resort way to tell two people apart. */
export const shortId = (accountId: string) => accountId.slice(0, 8).toUpperCase()

/**
 * What to call someone: their name, else their email, else "Member 8D0D395C" (the start of their account id).
 * The last case is what an *outgoing* request shows, since the backend keeps the recipient's details from the
 * person who asked until they accept — see `withInviteHints` for how the email you typed is put back.
 */
export function partyLabel(party: Party): string {
  return party.name.trim() || party.email.trim() || `Member ${shortId(party.accountId)}`
}

export const personLabel = (connection: SafetyConnection, me: string) => partyLabel(otherParty(connection, me))

/** What a removal confirmation is about: the standing decides the wording, `label` is who it's with. */
export interface RemoveTarget {
  standing: Exclude<Standing, 'incoming'>
  label: string
}

/** The removal confirmation for a connection, or `null` for a request waiting on you — that one is answered with Accept/Decline, not removed. */
export function removeTargetOf(connection: SafetyConnection, me: string): RemoveTarget | null {
  const standing = standingOf(connection, me)
  return standing === 'incoming' ? null : { standing, label: personLabel(connection, me) }
}

export interface GroupedConnections {
  incoming: SafetyConnection[]
  connected: SafetyConnection[]
  outgoing: SafetyConnection[]
  declined: SafetyConnection[]
}

/** Splits the list into the four sections the screen shows, each keeping the server's newest-first order. */
export function groupConnections(connections: SafetyConnection[], me: string): GroupedConnections {
  const groups: GroupedConnections = { incoming: [], connected: [], outgoing: [], declined: [] }
  for (const connection of connections) groups[standingOf(connection, me)].push(connection)
  return groups
}

/** How many requests are waiting for *this* account's answer — the count on the sidebar's Safety Groups item. */
export const incomingCount = (connections: SafetyConnection[], me: string) =>
  connections.filter((c) => standingOf(c, me) === 'incoming').length

/** What a Member ID looks like: the account's UUID. */
export const MEMBER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

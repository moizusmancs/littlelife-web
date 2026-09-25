import type { ConnectionStatus, ConnectionType, SafetyConnection } from '@/api/trust'

/**
 * Test fixtures: three people and the connections between them, **as the server would return them to ME**.
 * That includes its visibility rule (api/06-trust.md, *who sees whom*): the requester's name and email are always
 * present, and the recipient's only once the connection is accepted or when the recipient is the viewer — so a request
 * ME sent, pending or declined, has both recipient fields `""`.
 */
export const ME = '3165dfbc-a40e-415b-8e50-0062a0c94471'
export const AMNA = '8d0d395c-fb51-4e7c-945b-62f6b52e5e49'
export const BILAL = '5d4e7c55-8f8b-49d1-8c7b-b204cf431ad4'

export const PEOPLE: Record<string, { name: string; email: string }> = {
  [ME]: { name: 'Hina Khan', email: 'hina@example.com' },
  [AMNA]: { name: 'Amna Khan', email: 'amna@example.com' },
  [BILAL]: { name: 'Bilal Rehman', email: 'bilal@example.com' },
}

interface LinkOptions {
  id?: string
  type?: ConnectionType
  /** Who is looking. Defaults to ME. */
  viewer?: string
  created_at?: string
  responded_at?: string
}

/** A connection from `from` to `to`, shaped as the server returns it to `viewer`. */
export function link(from: string, to: string, status: ConnectionStatus, options: LinkOptions = {}): SafetyConnection {
  const viewer = options.viewer ?? ME
  const showRecipient = status === 'accepted' || to === viewer
  return {
    id: options.id ?? `${from.slice(0, 2)}-${to.slice(0, 2)}-${status}`,
    requester_account_id: from,
    requester_name: PEOPLE[from].name,
    requester_email: PEOPLE[from].email,
    recipient_account_id: to,
    recipient_name: showRecipient ? PEOPLE[to].name : '',
    recipient_email: showRecipient ? PEOPLE[to].email : '',
    connection_type: options.type ?? 'family',
    status,
    created_at: options.created_at ?? '2026-09-20T06:00:00Z',
    ...(status === 'pending' ? {} : { responded_at: options.responded_at ?? (status === 'accepted' ? '2026-09-21T08:00:00Z' : '2026-09-22T09:00:00Z') }),
    updated_at: options.created_at ?? '2026-09-20T06:00:00Z',
  }
}

/** A request AMNA sent to ME. */
export const incoming = (options: LinkOptions = {}) => link(AMNA, ME, 'pending', { id: 'c-in', ...options })

/** A request ME sent to AMNA — the recipient's name and email are hidden from ME. */
export const outgoing = (options: LinkOptions = {}) => link(ME, AMNA, 'pending', { id: 'c-out', ...options })

/** ME and AMNA, connected (ME asked) — both people's details shown. */
export const connected = (options: LinkOptions = {}) => link(ME, AMNA, 'accepted', { id: 'c-ok', ...options })

/** A request ME sent to AMNA that she declined — still nothing about her for ME to see. */
export const declined = (options: LinkOptions = {}) => link(ME, AMNA, 'declined', { id: 'c-no', ...options })

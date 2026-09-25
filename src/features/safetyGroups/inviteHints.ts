import type { SafetyConnection } from '@/api/trust'
import { sentByMe } from './connections'

/**
 * The email you typed when you invited someone, remembered on this device.
 *
 * The backend keeps the recipient's name and email from the person who asked until they accept (their
 * account ids are public, so answering a request-by-id with an email would turn an id into an address —
 * api/06-trust.md, *who sees whom*), so an outgoing pending or declined request comes back with both
 * `""`. Without this it would read "Member 84785B59" for someone you had just typed an email for. Nothing
 * here is learned from the server: it is only what *you* entered, keyed by your own account id so another
 * account on the same browser can't see it, and dropped in favour of the real details once they're shown.
 * `localStorage` can throw (private windows, blocked site data), so every access is guarded and the screen
 * simply falls back to "Member XXXXXXXX".
 */
const keyFor = (me: string) => `ll:safety-invites:${me}`
const MAX_HINTS = 100

type Hints = Record<string, string>

export function readInviteHints(me: string): Hints {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyFor(me)) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Hints) : {}
  } catch {
    return {}
  }
}

/** Remembers that connection `connectionId` was sent to `email`. Oldest hints go first past a hundred. */
export function rememberInvite(me: string, connectionId: string, email: string) {
  try {
    const next = { ...readInviteHints(me), [connectionId]: email }
    const kept = Object.entries(next).slice(-MAX_HINTS)
    localStorage.setItem(keyFor(me), JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Not remembering is fine — the row just says "Member XXXXXXXX".
  }
}

/**
 * Puts the remembered email back on the requests you sent that the server gave no recipient details for.
 * Only fills an *empty* email on a connection you sent that isn't accepted — anything the server did send
 * (an accepted connection's real name and email) is left exactly as it came.
 */
export function withInviteHints(connections: SafetyConnection[], me: string): SafetyConnection[] {
  const hints = readInviteHints(me)
  return connections.map((connection) => {
    const hint = hints[connection.id]
    const hidden = connection.recipient_name === '' && connection.recipient_email === ''
    return hint && sentByMe(connection, me) && connection.status !== 'accepted' && hidden
      ? { ...connection, recipient_email: hint }
      : connection
  })
}

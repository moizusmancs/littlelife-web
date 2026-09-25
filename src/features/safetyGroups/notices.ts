import type { SafetyConnection } from '@/api/trust'
import { personLabel, standingOf } from './connections'
import type { ConnectionAction } from './useConnectionActions'

/** The confirmation shown after the server has done `action` on `connection` (as it stood when acted on). */
export function actionNotice(action: ConnectionAction, connection: SafetyConnection, me: string): string {
  const label = personLabel(connection, me)
  if (action === 'accept') return `You're now connected to ${label}.`
  if (action === 'decline') return `You declined the request from ${label}.`
  switch (standingOf(connection, me)) {
    case 'connected':
      return `${label} was removed from your safety groups.`
    case 'outgoing':
      return `Your request to ${label} was cancelled.`
    default:
      return `The request with ${label} was removed.`
  }
}

/** `sentTo` is what was typed: the email, or "Member 8D0D395C" for an id — the server tells the requester nothing more about the recipient. */
export const requestSentNotice = (sentTo: string) => `Request sent to ${sentTo}. You'll be connected once they accept it.`

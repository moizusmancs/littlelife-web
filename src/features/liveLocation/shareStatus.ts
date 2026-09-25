import type { LiveLocationSnapshot } from './liveLocationController'

/**
 * What the "Share my live location" switch is doing, in the order the reasons matter. `off` is the resting state; everything after it
 * says *why* a switched-on share isn't (yet) reaching anyone, so the card never claims "sharing" while it isn't.
 */
export type ShareStatus =
  | 'off'
  | 'unsupported'
  | 'denied'
  | 'paused'
  | 'blocked-unauthorized'
  | 'blocked-not-allowed'
  | 'unavailable'
  | 'connecting'
  | 'reconnecting'
  | 'locating'
  | 'sharing'

export function shareStatus(snapshot: Pick<LiveLocationSnapshot, 'sharing' | 'visible' | 'blocked' | 'channel' | 'fix'>): ShareStatus {
  if (snapshot.fix === 'denied') return 'denied'
  if (snapshot.fix === 'unsupported') return 'unsupported'
  if (!snapshot.sharing) return 'off'
  if (!snapshot.visible) return 'paused'
  if (snapshot.blocked === 'unauthorized') return 'blocked-unauthorized'
  if (snapshot.blocked === 'not-allowed') return 'blocked-not-allowed'
  if (snapshot.fix === 'unavailable') return 'unavailable'
  if (snapshot.channel === 'reconnecting') return 'reconnecting'
  if (snapshot.channel !== 'live') return 'connecting'
  return snapshot.fix === 'active' ? 'sharing' : 'locating'
}

/** The line under the switch. */
export const SHARE_STATUS_TEXT: Record<ShareStatus, string> = {
  off: 'Off. Nobody can see where you are.',
  unsupported: "This browser can't share your location.",
  denied: 'Your browser blocked location access. Allow it in the site settings, then turn this on again.',
  paused: 'Paused — this tab is in the background. Sharing resumes when you come back.',
  'blocked-unauthorized': 'Your session has ended. Log in again to share your location.',
  'blocked-not-allowed': 'Live location is only available during an active alert.',
  unavailable: "Can't find your position right now — trying again.",
  connecting: 'Connecting…',
  reconnecting: 'Connection lost — reconnecting…',
  locating: 'Finding your position…',
  sharing: 'Sharing your live location.',
}

/** Whether the switch shows as on: a share that is switched on, even one that is paused or waiting, is on. */
export const isShareOn = (snapshot: Pick<LiveLocationSnapshot, 'sharing'>) => snapshot.sharing

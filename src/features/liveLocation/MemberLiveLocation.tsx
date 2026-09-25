import { MapPinLineIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BlockReason, ChannelState } from './liveLocationController'
import { ageLabel, formatCoordinates, isLive, type LivePosition } from './liveLocationModel'
import { MemberLocationMap } from './MemberLocationMap'

export interface MemberLiveLocationProps {
  /** Who it is, as the screen calls them ("Amna Khan"). */
  name: string
  /** Their last position heard since this screen opened, or `undefined` if none has arrived. */
  position: LivePosition | undefined
  /** The current time, so a position can turn from "live" to "last seen" without anything else changing. */
  now: number
  /** This browser's own connection to the relay. */
  channel: ChannelState
  blocked: BlockReason | null
  onRetry: () => void
}

/**
 * A connected member's place on their detail page. Their position arrives only when they're sharing **and** their tab is open in front (the web has no
 * background location), and only while *this* tab is listening, so the honest states are: live (a ping in the last three heartbeats), last seen (older),
 * or nothing heard — which the card says is "not sharing right now", not "offline", since the relay can't tell the difference between a member who stopped, one
 * whose tab is hidden and one who hasn't opened the app. The relay keeps no history and no snapshot, so a position seen once is only what this session heard.
 * Purely presentational.
 */
export function MemberLiveLocation({ name, position, now, channel, blocked, onRetry }: MemberLiveLocationProps) {
  const live = position ? isLive(position, now) : false

  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-4 shadow-sm" aria-labelledby="live-location-heading">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="live-location-heading" className="font-body text-body-md font-semibold text-ink-900">
          Live location
        </h2>
        {position && <Badge tone={live ? 'trust' : 'caution'}>{live ? 'Live' : 'Not live'}</Badge>}
      </div>

      {position ? (
        <div className="mt-3 flex flex-col gap-3">
          <MemberLocationMap position={[position.lat, position.lng]} live={live} label={`Map showing where ${name} is`} />
          <p className="font-body text-body-sm text-ink-700" role="status" aria-live="polite">
            {live ? `Updated ${ageLabel(now - position.receivedAt)}` : `Last seen ${ageLabel(now - position.receivedAt)}`} ·{' '}
            <span className="font-mono">{formatCoordinates(position.lat, position.lng)}</span>
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center rounded-md border border-dashed border-surface-border px-4 py-8 text-center">
          <MapPinLineIcon size={30} className="text-ink-300" aria-hidden="true" />
          <p className="mt-2 font-body text-body-md font-semibold text-ink-900">{name} isn't sharing right now</p>
          <p className="mt-1 max-w-sm font-body text-body-sm text-ink-500" role="status" aria-live="polite">
            {blocked === 'not-allowed'
              ? 'Live location is only available during an active alert.'
              : blocked === 'unauthorized'
                ? 'Your session has ended. Log in again to see live locations.'
                : channel === 'connecting'
                  ? 'Connecting…'
                  : channel === 'reconnecting'
                    ? 'Connection lost — reconnecting…'
                    : "Their location appears here while they're sharing it and this page is open."}
          </p>
          {blocked === 'not-allowed' && (
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

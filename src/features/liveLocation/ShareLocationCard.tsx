import { BroadcastIcon, InfoIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SHARE_STATUS_TEXT, type ShareStatus } from './shareStatus'

export interface ShareLocationCardProps {
  /** What the share is doing (see `shareStatus`). */
  status: ShareStatus
  /** Whether the switch is on — a share can be on but paused or waiting. */
  on: boolean
  /** How many people are connected (accepted) — the ones who would see it. */
  connectedCount: number
  onChange: (on: boolean) => void
  /** Try the channel again after the gate or a lost session refused it. */
  onRetry: () => void
}

/**
 * The switch that shares the signed-in person's live location. **It is one switch for everyone they're connected to**, not one per person as the
 * design plan drew it: the relay sends every position to every accepted connection and has no way to aim one at a single member, so a per-person
 * switch would promise something the backend can't do — the card says so instead. It is also **foreground-only** (WEB_DESIGN_PLAN §8): a web page
 * can't read the position in the background, so sharing pauses when the tab does, and the card says that too rather than imply the mobile app's behaviour.
 * Off unless someone is connected. Purely presentational.
 */
export function ShareLocationCard({ status, on, connectedCount, onChange, onRetry }: ShareLocationCardProps) {
  const noOne = connectedCount === 0
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-4 shadow-sm" aria-labelledby="share-location-heading">
      <div className="flex items-start gap-3.5">
        <span className="flex size-10 flex-none items-center justify-center rounded-full bg-status-trust-tint text-status-trust" aria-hidden="true">
          <BroadcastIcon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="share-location-heading" className="font-body text-body-md font-semibold text-ink-900">
            Share my live location
          </h2>
          <p className="mt-0.5 font-body text-body-sm text-ink-500">
            {noOne
              ? 'Connect with someone first — your location goes to the people you\'re connected to.'
              : `Sent to ${connectedCount === 1 ? 'the 1 person' : `all ${connectedCount} people`} you're connected to. There's no setting for just one of them.`}
          </p>
        </div>
        <Switch checked={on} onCheckedChange={onChange} disabled={noOne && !on} aria-labelledby="share-location-heading" aria-describedby="share-location-status" />
      </div>

      <p id="share-location-status" role="status" aria-live="polite" className="mt-3 font-body text-body-sm font-semibold text-ink-700">
        {noOne && !on ? '' : SHARE_STATUS_TEXT[status]}
      </p>
      {(status === 'blocked-not-allowed' || status === 'unavailable') && (
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}

      <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-sunken px-3 py-2.5 font-body text-body-sm text-ink-700">
        <InfoIcon size={16} className="mt-px flex-none text-ink-500" aria-hidden="true" />
        Works only while this tab is open and in front. Browsers can't share location in the background, so it pauses when you switch tabs, minimise the window or lock your phone.
      </p>
    </section>
  )
}

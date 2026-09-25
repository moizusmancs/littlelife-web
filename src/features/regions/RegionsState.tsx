import { PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

export interface RegionsStateProps {
  kind: 'loading' | 'error' | 'empty'
  /** For `error`: the message. */
  message?: string
  onRetry?: () => void
  onAdd?: () => void
}

/** What the Regions screen shows in place of the tree and detail: skeleton, a failed load, or "no regions yet". */
export function RegionsState({ kind, message, onRetry, onAdd }: RegionsStateProps) {
  if (kind === 'loading') {
    return (
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]" aria-busy="true" aria-label="Loading regions">
        <div className="flex flex-col gap-2 rounded-md border border-surface-border bg-surface-raised p-3" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-sm bg-surface-sunken" />
          ))}
        </div>
        <div className="hidden h-96 animate-pulse rounded-md bg-surface-sunken lg:block" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="rounded-md border border-surface-border bg-surface-raised p-6">
      {kind === 'error' ? (
        <>
          <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
            {message}
          </div>
          <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : (
        <>
          <h2 className="font-heading text-h3 font-bold text-ink-900">No regions yet</h2>
          <p className="mt-1.5 max-w-prose font-body text-body-md text-ink-500">
            Regions are the provinces, districts and tehsils everything else is placed in — start with a province, then add the districts under it.
          </p>
          <Button type="button" className="mt-4" onClick={onAdd}>
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            Add region
          </Button>
        </>
      )}
    </div>
  )
}

import { Button } from '@/components/ui/button'

/** What stands in for a list of zones or predictions: a skeleton while it loads, an alert with a retry when it failed, or a sentence saying why it is empty. Purely presentational. */
export function ZoneListState({ kind, message, noun, onRetry }: { kind: 'loading' | 'error' | 'empty'; message?: string; noun: string; onRetry?: () => void }) {
  if (kind === 'loading') {
    return (
      <div className="flex flex-col gap-px p-3" aria-busy="true" aria-label={`Loading ${noun}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
        ))}
      </div>
    )
  }
  if (kind === 'error') {
    return (
      <div className="p-4">
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-critical bg-status-critical-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
          <span className="min-w-0 flex-1">{message ?? `Couldn't load ${noun}.`}</span>
          {onRetry && (
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    )
  }
  return <p className="p-8 text-center font-body text-body-md text-ink-500">{message}</p>
}

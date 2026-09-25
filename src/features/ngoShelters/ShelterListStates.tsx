import { HouseLineIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

/** Loading skeleton / load-failure card for the shelters list. `error` is `null` while loading. Purely presentational. */
export function SheltersLoadState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <div className="rounded-md border border-surface-border bg-surface-raised p-6">
        <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
          {error}
        </div>
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised" aria-busy="true" aria-label="Loading shelters">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b border-surface-border px-4 py-4 last:border-b-0 xl:px-5" aria-hidden="true">
          <div className="size-9 flex-none animate-pulse rounded-full bg-surface-sunken" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
        </div>
      ))}
    </div>
  )
}

export interface SheltersEmptyStateProps {
  /** `ngo_admin` can register; a volunteer is told who can. */
  canRegister: boolean
  onRegister: () => void
}

/** The organisation manages no shelters yet (`GET /ngo/shelters` is `[]`). Purely presentational. */
export function SheltersEmptyState({ canRegister, onRegister }: SheltersEmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <HouseLineIcon size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-heading text-h3 font-bold text-ink-900">No shelters yet</h2>
      <p className="mt-1 max-w-sm font-body text-body-md text-ink-500">
        {canRegister
          ? 'Register a shelter or relief center your organisation runs. It starts open and empty, and pending certification.'
          : "Your organisation hasn't registered a shelter yet. An organisation admin can register one, and it will appear here."}
      </p>
      {canRegister && (
        <Button type="button" className="mt-5" onClick={onRegister}>
          Register a shelter
        </Button>
      )}
    </div>
  )
}

/** Shelters exist, but the search or filter hides all of them. Purely presentational. */
export function SheltersNoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <MagnifyingGlassIcon size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-heading text-h3 font-bold text-ink-900">No shelters match</h2>
      <p className="mt-1 max-w-sm font-body text-body-md text-ink-500">Nothing fits that search and filter. Try something broader.</p>
      <Button type="button" variant="secondary" className="mt-5" onClick={onClear}>
        Show all shelters
      </Button>
    </div>
  )
}

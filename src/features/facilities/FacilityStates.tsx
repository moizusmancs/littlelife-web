import { HouseLineIcon, MagnifyingGlassIcon, WarningIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

/** Loading skeleton, or a failed load with a retry (`error` is `null` while loading). Purely presentational. */
export function FacilitiesLoadState({ label, error, onRetry }: { label: string; error: string | null; onRetry: () => void }) {
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
    <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised" aria-busy="true" aria-label={`Loading ${label}`}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b border-surface-border px-4 py-4 last:border-b-0 xl:px-5" aria-hidden="true">
          <div className="size-9 flex-none animate-pulse rounded-full bg-surface-sunken" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded-sm bg-surface-sunken" />
        </div>
      ))}
    </div>
  )
}

/**
 * Some regions' requests failed while the others answered: what is shown is real but incomplete, and it says so with a way to ask again — a partial list that
 * looked complete would be worse than none. Purely presentational.
 */
export function PartialLoadNotice({ failed, onRetry }: { failed: number; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-sm border border-status-caution bg-status-caution-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
      <WarningIcon size={16} weight="fill" className="flex-none text-status-caution" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {failed === 1 ? "One region couldn't be loaded" : `${failed} regions couldn't be loaded`}, so this list may be missing places.
      </span>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export interface FacilitiesEmptyStateProps {
  /** "shelters", "infrastructure items", "essential locations". */
  noun: string
  /** Where they were looked for: "in Sindh › Sukkur", or "in any region". */
  where: string
  /** What an admin can do about it, if anything (Add …). */
  action?: { label: string; onClick: () => void }
  /** A sentence about why there might be none, or who adds them. */
  hint: string
}

/** The scope holds none of this kind. Purely presentational. */
export function FacilitiesEmptyState({ noun, where, action, hint }: FacilitiesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <HouseLineIcon size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-heading text-h3 font-bold text-ink-900">
        No {noun} {where}
      </h2>
      <p className="mt-1 max-w-md font-body text-body-md text-ink-500">{hint}</p>
      {action && (
        <Button type="button" className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

/** There are some, but the search and filters hide all of them. Purely presentational. */
export function FacilitiesNoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <MagnifyingGlassIcon size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-heading text-h3 font-bold text-ink-900">Nothing matches</h2>
      <p className="mt-1 max-w-sm font-body text-body-md text-ink-500">Nothing fits that search and those filters. Try something broader.</p>
      <Button type="button" variant="secondary" className="mt-5" onClick={onClear}>
        Clear search and filters
      </Button>
    </div>
  )
}

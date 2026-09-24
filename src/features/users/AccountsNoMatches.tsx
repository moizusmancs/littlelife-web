import { Button } from '@/components/ui/button'

/** Shown when the search and filters leave nothing — not an error, and not an empty platform. */
export function AccountsNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center">
      <h2 className="font-heading text-h3 font-bold text-ink-900">No accounts match</h2>
      <p className="mt-1 max-w-sm font-body text-body-md text-ink-500">
        Nothing fits that search and those filters. Try fewer filters or a different search.
      </p>
      <Button type="button" variant="secondary" className="mt-5" onClick={onClear}>
        Clear search and filters
      </Button>
    </div>
  )
}

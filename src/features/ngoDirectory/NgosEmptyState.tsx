import { BuildingsIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { NgoTab } from './ngoFilters'

export interface NgosEmptyStateProps {
  tab: NgoTab
  /** True when a search is narrowing the tab — then "nothing here" means "nothing matches". */
  searching: boolean
  onClear: () => void
}

/** The list has nothing to show: no matches for a search, an empty inbox, or an empty tab. */
export function NgosEmptyState({ tab, searching, onClear }: NgosEmptyStateProps) {
  const inbox = tab === 'pending_approval' && !searching
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <BuildingsIcon size={24} aria-hidden="true" />
      </div>
      <h2 className="mt-4 font-heading text-h3 font-bold text-ink-900">
        {searching ? 'No organisations match' : inbox ? 'Nothing waiting for approval' : 'No organisations here'}
      </h2>
      <p className="mt-1 max-w-sm font-body text-body-md text-ink-500">
        {searching
          ? 'Nothing fits that search in this tab. Try a different search, or look under All.'
          : inbox
            ? 'Every application has been decided. New ones appear here as citizens submit them.'
            : 'No organisation has this status.'}
      </p>
      {(searching || tab !== 'all') && (
        <Button type="button" variant="secondary" className="mt-5" onClick={onClear}>
          {searching ? 'Clear search' : 'Show all organisations'}
        </Button>
      )}
    </div>
  )
}

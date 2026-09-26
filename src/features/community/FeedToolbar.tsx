import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CATEGORY_FILTERS, type CategoryFilter } from './feedModel'

export interface FeedToolbarProps {
  query: string
  onQueryChange: (query: string) => void
  category: CategoryFilter
  counts: Record<CategoryFilter, number>
  onCategoryChange: (category: CategoryFilter) => void
}

/**
 * Search (over what people wrote, the category and the status) and the category chips, each with how many reports it holds within the
 * search. The design's filter popover (category / distance / date / verification) is folded into these chips and the tabs — distance is
 * Nearby, verification is Verified, and there is no date filter. Purely presentational.
 */
export function FeedToolbar({ query, onQueryChange, category, counts, onCategoryChange }: FeedToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="w-full sm:max-w-sm">
        <label htmlFor="community-search" className="sr-only">
          Search reports
        </label>
        <Input
          id="community-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search reports…"
          className="h-10 text-body-md"
          leadingIcon={<MagnifyingGlassIcon size={16} aria-hidden="true" />}
          trailingSlot={
            query ? (
              <button type="button" onClick={() => onQueryChange('')} aria-label="Clear search" className="rounded-sm text-ink-500 hover:text-ink-900">
                <XIcon size={16} aria-hidden="true" />
              </button>
            ) : undefined
          }
        />
      </div>
      <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
        {CATEGORY_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            onClick={() => onCategoryChange(id)}
            className={cn(
              'flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 font-body text-body-sm font-semibold whitespace-nowrap transition-colors',
              category === id ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken',
            )}
          >
            {label}{' '}
            <span className={cn('font-medium', category === id ? 'text-white/80' : 'text-ink-500')}>{counts[id]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

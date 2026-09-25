import { cn } from '@/lib/utils'
import { ACTIVITY_FILTERS, filterLabel, type ActivityFilter } from './activityModel'

export interface ActivityFiltersProps {
  filter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
}

/** One pill per kind of activity, plus All — each a toggle button (`aria-pressed`), wrapping rather than scrolling. Purely presentational. */
export function ActivityFilters({ filter, onFilterChange }: ActivityFiltersProps) {
  return (
    <div role="group" aria-label="Filter activity" className="flex flex-wrap gap-2">
      {ACTIVITY_FILTERS.map((value) => {
        const selected = filter === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => onFilterChange(value)}
            className={cn(
              'inline-flex h-8 items-center rounded-full border px-3 font-body text-label font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
              selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken',
            )}
          >
            {filterLabel(value)}
          </button>
        )
      })}
    </div>
  )
}

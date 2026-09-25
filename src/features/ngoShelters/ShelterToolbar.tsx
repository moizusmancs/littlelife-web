import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { SHELTER_FILTERS, SHELTER_FILTER_LABEL, type ShelterFilter } from './shelterModel'

export interface ShelterToolbarProps {
  filter: ShelterFilter
  onFilterChange: (filter: ShelterFilter) => void
  /** How many shelters each filter would show for the current search. */
  counts: Record<ShelterFilter, number>
  search: string
  onSearchChange: (value: string) => void
}

/**
 * A search box and the quick filters — All, Open, Closed, At capacity, Pending certification — each with how many it would show, so
 * the two figures in the KPI row that need attention can be opened in one press. Pills wrap rather than scroll. Purely presentational.
 */
export function ShelterToolbar({ filter, onFilterChange, counts, search, onSearchChange }: ShelterToolbarProps) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <div className="relative flex items-center md:max-w-sm xl:w-72">
        <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 text-ink-500" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search shelters"
          aria-label="Search shelters"
          className="h-9 w-full rounded-sm border border-surface-border bg-surface-sunken ps-9 pe-3 font-body text-body-sm text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none"
        />
      </div>
      <div role="group" aria-label="Filter shelters" className="flex flex-wrap gap-2">
        {SHELTER_FILTERS.map((value) => {
          const selected = filter === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => onFilterChange(value)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-body text-label font-semibold whitespace-nowrap',
                selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken',
              )}
            >
              {SHELTER_FILTER_LABEL[value]}
              <span className={cn('text-[11px]', selected ? 'text-white/85' : 'text-ink-500')}>{counts[value]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { FilterPills, type FilterPillsProps } from './FilterPills'

export interface FacilityToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  /** What the search box says it searches ("Search shelters"). */
  searchLabel: string
  /** The region scope control (or anything else that belongs beside the search). */
  scope: ReactNode
  groups: readonly FilterPillsProps[]
}

/** The search box, the region scope, and one pill group per filter (type, status). Purely presentational; the page owns every value. */
export function FacilityToolbar({ search, onSearchChange, searchLabel, scope, groups }: FacilityToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex w-full items-center sm:w-80">
          <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 text-ink-500" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            className="h-9 w-full rounded-sm border border-surface-border bg-surface-sunken ps-9 pe-3 font-body text-body-sm text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none"
          />
        </div>
        {scope}
      </div>
      {groups.map((group) => (
        <FilterPills key={group.label} {...group} />
      ))}
    </div>
  )
}

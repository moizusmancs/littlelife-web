import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { NGO_STATUS_LABEL, NGO_TABS, type NgoTab } from './ngoFilters'

export interface NgosToolbarProps {
  tab: NgoTab
  onTabChange: (tab: NgoTab) => void
  /** Count per tab, shown beside its label; `undefined` while loading. */
  counts: Record<NgoTab, number> | undefined
  search: string
  onSearchChange: (value: string) => void
}

/**
 * Status tabs with counts, and a search field — pixel reference Batch 5 §5e. The tabs are the
 * real `ngo_status` values (the mockup's "Approved" is `active`); the pending count is drawn in the
 * caution tint whenever there is anything waiting, as in the mockup. On a phone the tabs scroll
 * sideways rather than wrap.
 */
export function NgosToolbar({ tab, onTabChange, counts, search, onSearchChange }: NgosToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Filter by status" className="flex gap-6 overflow-x-auto border-b border-surface-border">
        {NGO_TABS.map((value) => {
          const selected = tab === value
          const count = counts?.[value]
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTabChange(value)}
              className={cn(
                '-mb-px flex flex-none items-center gap-1.5 border-b-2 py-2.5 font-body text-label font-semibold whitespace-nowrap',
                selected ? 'border-primary-500 text-primary-700' : 'border-transparent text-ink-500 hover:text-ink-900',
              )}
            >
              {value === 'all' ? 'All' : NGO_STATUS_LABEL[value]}
              {count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[11px] font-semibold',
                    value === 'pending_approval' && count > 0
                      ? 'bg-status-caution-tint text-status-caution'
                      : 'text-ink-500',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="relative flex items-center md:w-80">
        <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 text-ink-500" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, email or ID"
          aria-label="Search organisations"
          className="h-9 w-full rounded-sm border border-surface-border bg-surface-sunken ps-9 pe-3 font-body text-body-sm text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none"
        />
      </div>
    </div>
  )
}

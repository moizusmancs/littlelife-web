import { Link } from 'react-router-dom'
import { CaretRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { Region, RegionLevel } from '@/api/geo'
import { REGION_LEVELS, REGION_LEVEL_LABEL, type RegionRow } from './regionTree'

export interface RegionTreePanelProps {
  /** Tree mode: the rows to draw, already flattened for what's expanded. */
  rows: RegionRow[]
  /** Filter mode (a search or a level chosen): the flat matches; `null` shows the tree. */
  matches: Region[] | null
  /** A match's ancestors as text, for its subtitle. */
  parentPathOf: (region: Region) => string
  selectedId: string | undefined
  onToggle: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
  level: RegionLevel | 'all'
  onLevelChange: (level: RegionLevel | 'all') => void
  /** The list's `?q=…&level=…`, carried onto each region's link so selecting one keeps the filter. */
  linkSearch: string
  className?: string
}

const linkFor = (id: string, search: string) => ({ pathname: `/admin/regions/${id}`, search })

const rowLink = (selected: boolean) =>
  cn(
    'flex min-h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-sm px-2 py-1.5 font-body text-body-md',
    selected ? 'bg-primary-50 font-semibold text-primary-700' : 'text-ink-900 hover:bg-surface-sunken',
  )

/**
 * The left half of Admin Regions (pixel reference Batch 5 §5f): a name search and level filter over
 * a collapsible province › district › tehsil tree. With nothing typed or chosen it's the tree — each
 * row's caret opens its sub-regions and its count says how many there are; as soon as there's a
 * search or level filter it becomes a flat list of matches with each one's parent path underneath,
 * since a match deep in a collapsed branch would otherwise be invisible. Selecting is a link, so the
 * URL is the selection. Pure presentation.
 */
export function RegionTreePanel({
  rows,
  matches,
  parentPathOf,
  selectedId,
  onToggle,
  search,
  onSearchChange,
  level,
  onLevelChange,
  linkSearch,
  className,
}: RegionTreePanelProps) {
  return (
    <section
      aria-label="Region hierarchy"
      className={cn('flex min-h-0 flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-3 shadow-sm', className)}
    >
      <div className="relative flex items-center">
        <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 text-ink-500" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Find region…"
          aria-label="Search regions"
          className="h-9 w-full rounded-sm border border-surface-border bg-surface-sunken ps-9 pe-3 font-body text-body-sm text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none"
        />
      </div>

      <div role="group" aria-label="Filter by level" className="flex flex-wrap gap-1">
        {(['all', ...REGION_LEVELS] as const).map((value) => {
          const selected = level === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => onLevelChange(value)}
              className={cn(
                'h-8 rounded-full border px-2.5 font-body text-label font-semibold',
                selected ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-border text-ink-500 hover:text-ink-900',
              )}
            >
              {value === 'all' ? 'All' : REGION_LEVEL_LABEL[value]}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 overflow-y-auto lg:max-h-[65vh]">
        {matches ? (
          matches.length === 0 ? (
            <p className="px-2 py-6 text-center font-body text-body-md text-ink-500">No regions match.</p>
          ) : (
            <ul aria-label="Matching regions" className="flex flex-col">
              {matches.map((region) => {
                const selected = region.id === selectedId
                const parents = parentPathOf(region)
                return (
                  <li key={region.id}>
                    <Link to={linkFor(region.id, linkSearch)} aria-current={selected ? 'page' : undefined} className={cn(rowLink(selected), 'items-start')}>
                      <span className="min-w-0">
                        <span className="block [overflow-wrap:anywhere]">{region.name}</span>
                        {parents && <span className="block font-body text-body-sm font-normal text-ink-500 [overflow-wrap:anywhere]">{parents}</span>}
                      </span>
                      <span className="flex-none pt-0.5 font-body text-body-sm font-normal text-ink-500">{REGION_LEVEL_LABEL[region.level]}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )
        ) : (
          <ul aria-label="Regions" className="flex flex-col">
            {rows.map((row) => {
              const selected = row.region.id === selectedId
              return (
                <li key={row.region.id} className="flex items-center" style={{ paddingInlineStart: `${row.depth * 1.25}rem` }}>
                  {row.childCount > 0 ? (
                    <button
                      type="button"
                      aria-expanded={row.expanded}
                      aria-label={`${row.expanded ? 'Collapse' : 'Expand'} ${row.region.name}`}
                      onClick={() => onToggle(row.region.id)}
                      className="flex size-9 flex-none items-center justify-center rounded-sm text-ink-500 hover:bg-surface-sunken"
                    >
                      <CaretRightIcon size={14} weight="bold" className={cn('transition-transform', row.expanded && 'rotate-90')} aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="size-9 flex-none" aria-hidden="true" />
                  )}
                  <Link to={linkFor(row.region.id, linkSearch)} aria-current={selected ? 'page' : undefined} className={rowLink(selected)}>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{row.region.name}</span>
                    {row.childCount > 0 && (
                      <>
                        <span aria-hidden="true" className="flex-none font-body text-body-sm font-normal text-ink-500">
                          {row.childCount}
                        </span>
                        <span className="sr-only">{`, ${row.childCount} sub-region${row.childCount === 1 ? '' : 's'}`}</span>
                      </>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

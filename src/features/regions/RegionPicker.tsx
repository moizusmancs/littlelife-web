import { CaretRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { Region } from '@/api/geo'
import { REGION_LEVEL_LABEL } from './regionTree'

export interface RegionPickerProps {
  /** The regions drilled into so far, top first; empty at the top level. */
  trail: Region[]
  /** What's listed at this depth, each with how many sub-regions it holds. */
  options: Array<{ region: Region; childCount: number }>
  /** Flat search results, or `null` to browse. */
  matches: Region[] | null
  /** A result's ancestors as text, for its subtitle. */
  parentPathOf: (region: Region) => string
  search: string
  onSearchChange: (value: string) => void
  /** Open a region's sub-regions. */
  onOpen: (regionId: string) => void
  /** Go back up: `0` is the top level, `n` the level inside the n-th region of the trail. */
  onTrailSelect: (depth: number) => void
  selectedId: string | null
  onSelect: (regionId: string) => void
  /** Regions that can't be chosen, with the reason shown beside them. */
  unavailable: ReadonlyMap<string, string>
  /** Height limit of the scrolling list, for a screen with more room than a dialog (default `max-h-72`). */
  listClassName?: string
}

/**
 * Choose one region — a province, a district or a tehsil — by drilling down province › district ›
 * tehsil, or by searching by name. Every row is selectable at its own level (an NGO can cover a whole
 * province or a single tehsil), and a row with sub-regions has a separate arrow to open them, so
 * choosing and browsing don't compete. Rows are radio buttons, so arrow keys and screen readers work
 * without any custom handling. Regions with no parent (the API allows them) sit at the top level.
 * Pure presentation — see `useRegionPicker` for the state.
 */
export function RegionPicker({
  trail,
  options,
  matches,
  parentPathOf,
  search,
  onSearchChange,
  onOpen,
  onTrailSelect,
  selectedId,
  onSelect,
  unavailable,
  listClassName = 'max-h-72',
}: RegionPickerProps) {
  const row = (region: Region, subtitle: string, childCount: number) => {
    const reason = unavailable.get(region.id)
    return (
      <li key={region.id} className="flex items-center">
        <label
          className={cn(
            'flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1.5 has-checked:bg-primary-50',
            reason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-sunken',
          )}
        >
          <input
            type="radio"
            name="region"
            checked={selectedId === region.id}
            disabled={reason !== undefined}
            onChange={() => onSelect(region.id)}
            className="size-4 flex-none accent-primary-500"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-body text-body-md text-ink-900 [overflow-wrap:anywhere]">{region.name}</span>
            <span className="block font-body text-body-sm text-ink-500 [overflow-wrap:anywhere]">
              {[REGION_LEVEL_LABEL[region.level], subtitle, reason].filter(Boolean).join(' · ')}
            </span>
          </span>
        </label>
        {childCount > 0 && (
          <button
            type="button"
            onClick={() => onOpen(region.id)}
            aria-label={`Show the ${childCount} sub-region${childCount === 1 ? '' : 's'} of ${region.name}`}
            className="flex size-11 flex-none items-center justify-center rounded-sm text-ink-500 hover:bg-surface-sunken"
          >
            <CaretRightIcon size={16} weight="bold" aria-hidden="true" />
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex items-center">
        <MagnifyingGlassIcon size={16} className="pointer-events-none absolute left-3 text-ink-500" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name"
          aria-label="Search regions"
          className="h-10 w-full rounded-sm border border-surface-border bg-surface-sunken ps-9 pe-3 font-body text-body-md text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none"
        />
      </div>

      {!matches && (
        <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 font-body text-body-sm text-ink-500">
          {trail.length === 0 ? (
            <span aria-current="page">All regions</span>
          ) : (
            <button type="button" onClick={() => onTrailSelect(0)} className="font-semibold text-primary-700 hover:underline">
              All regions
            </button>
          )}
          {trail.map((region, index) => (
            <span key={region.id} className="flex items-center gap-1">
              <CaretRightIcon size={12} aria-hidden="true" />
              {index === trail.length - 1 ? (
                <span aria-current="page" className="[overflow-wrap:anywhere]">
                  {region.name}
                </span>
              ) : (
                <button type="button" onClick={() => onTrailSelect(index + 1)} className="font-semibold text-primary-700 [overflow-wrap:anywhere] hover:underline">
                  {region.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      <fieldset className="min-w-0">
        <legend className="sr-only">Region</legend>
        {matches ? (
          matches.length === 0 ? (
            <p className="py-6 text-center font-body text-body-md text-ink-500">No regions match.</p>
          ) : (
            <ul aria-label="Matching regions" className={cn('flex flex-col overflow-y-auto', listClassName)}>
              {matches.map((region) => row(region, parentPathOf(region), 0))}
            </ul>
          )
        ) : (
          <ul aria-label={trail.length > 0 ? `Inside ${trail[trail.length - 1].name}` : 'Regions'} className={cn('flex flex-col overflow-y-auto', listClassName)}>
            {options.map(({ region, childCount }) => row(region, '', childCount))}
          </ul>
        )}
      </fieldset>
    </div>
  )
}

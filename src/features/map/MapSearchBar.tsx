import { MagnifyingGlassIcon } from '@phosphor-icons/react'

export interface MapSearchBarProps {
  value: string
  onChange: (value: string) => void
}

/**
 * The pill search from the mockup. It filters what is on the map and in the lists by name, type and status — there is
 * no geocoder behind it, so it can't find roads or towns (the mockup's "roads" wording is dropped from the placeholder).
 */
export function MapSearchBar({ value, onChange }: MapSearchBarProps) {
  return (
    <div className="relative flex items-center">
      <MagnifyingGlassIcon size={18} className="pointer-events-none absolute left-3.5 text-ink-500" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search shelters, hospitals, pharmacies…"
        aria-label="Search the map"
        className="h-11 w-full rounded-full border border-surface-border bg-surface-sunken ps-10 pe-4 font-body text-body-md text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none"
      />
    </div>
  )
}

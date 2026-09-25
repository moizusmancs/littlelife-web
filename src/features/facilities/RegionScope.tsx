import { CaretDownIcon, GlobeHemisphereEastIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface RegionScopeProps {
  /** The chosen region's path (`Sindh › Sukkur`), or `null` for "everywhere". */
  path: string | null
  onChoose: () => void
  onClear: () => void
}

/**
 * Which part of the country the list is about (mockup 5g's "Sindh ▾"): everywhere by default, or one province, district or tehsil chosen in the shared region picker, with a
 * button to go back to everywhere. The API answers only per region, so this is really "which requests are made". Purely presentational.
 */
export function RegionScope({ path, onChoose, onClear }: RegionScopeProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onChoose}
        className={cn(
          'flex h-9 max-w-full items-center gap-2 rounded-sm border border-surface-border bg-surface-raised px-3 font-body text-label font-medium text-ink-900 hover:bg-surface-sunken',
          path && 'border-primary-500 bg-primary-50 text-primary-700',
        )}
        aria-label={path ? `Region: ${path}. Change region` : 'Region: all regions. Choose a region'}
      >
        <GlobeHemisphereEastIcon size={16} className="flex-none text-ink-500" aria-hidden="true" />
        <span className="min-w-0 truncate">{path ?? 'All regions'}</span>
        <CaretDownIcon size={12} className="flex-none text-ink-500" aria-hidden="true" />
      </button>
      {path && (
        <button type="button" onClick={onClear} className="flex size-9 flex-none items-center justify-center rounded-sm border border-surface-border bg-surface-raised text-ink-500 hover:bg-surface-sunken" aria-label="Show all regions">
          <XIcon size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

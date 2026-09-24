import { MapPinIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { ProfileResponse } from '@/api/profiling'
import { REGION_LEVEL_LABEL } from '@/features/regions/regionTree'

export interface HomeRegionCardProps {
  /** `false` while the profile is loading. */
  isLoaded: boolean
  /** The home region as a short line ("Sukkur City, Sukkur"), or `null` when none is set. */
  label: string | null
  level: ProfileResponse['home_region_level'] | null
  /** The full path ("Sindh › Sukkur › Sukkur City"), shown under the name when there's more than the name. */
  path: string | null
  onChoose: () => void
  onClear: () => void
  isClearing: boolean
  /** Why clearing failed, if it did. */
  error: string | null
}

/**
 * The citizen's home region on Edit Profile: what it is now, and how to change or remove it. It's
 * optional — the API never requires one and a profile without it is complete — so "not set" is a
 * normal state with a plain invitation rather than a warning, and removing it is one click with no
 * confirmation (it's cheap to set again). Choosing opens the shared region picker (see
 * `useHomeRegion`). Purely presentational.
 */
export function HomeRegionCard({ isLoaded, label, level, path, onChoose, onClear, isClearing, error }: HomeRegionCardProps) {
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-6 shadow-sm" aria-labelledby="home-region-heading">
      <h2 id="home-region-heading" className="font-heading text-h3 font-bold text-ink-900">
        Home region
      </h2>
      <p className="mt-1 font-body text-body-sm text-ink-500">The area you live in. It's optional, and you can change or remove it any time.</p>

      {!isLoaded ? (
        <div className="mt-4 h-11 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-full bg-primary-100 text-primary-700" aria-hidden="true">
              <MapPinIcon size={20} />
            </div>
            {label ? (
              <div className="min-w-0">
                <p className="font-body text-body-md font-semibold text-ink-900 [overflow-wrap:anywhere]">{label}</p>
                <p className="font-body text-body-sm text-ink-500 [overflow-wrap:anywhere]">
                  {level ? REGION_LEVEL_LABEL[level] : ''}
                  {path && path.includes('›') ? ` · ${path}` : ''}
                </p>
              </div>
            ) : (
              <p className="font-body text-body-md text-ink-500">Not set</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {label && (
              <Button type="button" variant="ghost" size="sm" isLoading={isClearing} onClick={onClear}>
                Remove
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" disabled={isClearing} onClick={onChoose}>
              {label ? 'Change' : 'Choose region'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
          {error}
        </div>
      )}
    </section>
  )
}

import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react'
import type { RegionCoverage } from '@/features/regions/useRegionCoverage'

interface CoverageNoteProps {
  coverage: RegionCoverage
  className?: string
  /** Said after the warning, for a screen with more to add. */
  detail?: string
  /**
   * For a form that is choosing where to put a place: outside every region it says so as **a reason the place can't be saved**. Without it (a place that
   * already exists) the same fact is worded as what it means for who will see the place.
   */
  blocking?: boolean
}

/**
 * Where a place's point sits among the platform's regions, in terms of what matters to whoever is looking at it: every facility read is
 * **per region** (a place outside every region is never returned to citizens), so a point in a region says so, and one outside every
 * region says it won't be seen — or, while choosing a place, that it can't be saved. Says nothing when it can't be told. Purely presentational.
 */
export function CoverageNote({ coverage, className, detail, blocking = false }: CoverageNoteProps) {
  if (coverage.status === 'none') return null
  if (coverage.status === 'inside') {
    return (
      <p role="status" className={`flex items-start gap-2 font-body text-body-sm text-ink-700 ${className ?? ''}`}>
        <CheckCircleIcon size={16} weight="fill" className="mt-px flex-none text-status-safe" aria-hidden="true" />
        <span>
          In <span className="font-semibold text-ink-900">{coverage.path}</span> — citizens looking at that region will see it.
        </span>
      </p>
    )
  }
  if (blocking) {
    return (
      <p role="status" className={`flex items-start gap-2 rounded-sm border border-status-critical bg-status-critical-tint px-3 py-2 font-body text-body-sm text-ink-900 ${className ?? ''}`}>
        <WarningIcon size={16} weight="fill" className="mt-px flex-none text-status-critical" aria-hidden="true" />
        <span>
          This spot is outside the shaded areas, so it can't be saved — nobody would ever see a place here. Click inside a shaded area, or check the coordinates (latitude
          first, then longitude).
          {detail && <> {detail}</>}
        </span>
      </p>
    )
  }
  return (
    <p role="status" className={`flex items-start gap-2 rounded-sm border border-status-caution bg-status-caution-tint px-3 py-2 font-body text-body-sm text-ink-900 ${className ?? ''}`}>
      <WarningIcon size={16} weight="fill" className="mt-px flex-none text-status-caution" aria-hidden="true" />
      <span>
        This point isn't inside any region on the platform, so citizens won't see it on their map or in their lists. Check the coordinates —
        latitude comes first, then longitude.
        {detail && <> {detail}</>}
      </span>
    </p>
  )
}

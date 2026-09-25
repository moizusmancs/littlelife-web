import { cn } from '@/lib/utils'
import type { Shelter } from '@/api/facilities'
import { capacityInfo } from '@/features/map/mapModel'
import { CAPACITY_BAR, CAPACITY_PERCENT_TEXT } from '@/features/shelters/capacityTones'

/**
 * A shelter's occupancy in a table row: "412 / 450", the percentage in the tone that rises with how full it is, and a bar. The
 * compact form of `CapacityMeter` (no "Capacity" label, no over-capacity sentence — the API doesn't let a shelter record being over-full).
 * Purely presentational.
 */
export function OccupancyBar({ shelter, label }: { shelter: Pick<Shelter, 'capacity_current' | 'capacity_total'>; label: string }) {
  const info = capacityInfo(shelter)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between font-body text-[11px] font-medium text-ink-700">
        <span>
          <span className="font-bold text-ink-900">{info.current.toLocaleString('en-US')}</span> / {info.total.toLocaleString('en-US')}
        </span>
        <span className={cn('font-semibold', CAPACITY_PERCENT_TEXT[info.tone])}>{info.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={info.barPercent}>
        <div className={cn('h-full rounded-full bg-linear-to-r', CAPACITY_BAR[info.tone])} style={{ width: `${info.barPercent}%` }} />
      </div>
    </div>
  )
}

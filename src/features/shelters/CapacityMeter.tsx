import { cn } from '@/lib/utils'
import type { CapacityInfo } from '@/features/map/mapModel'
import { CAPACITY_BAR, CAPACITY_PERCENT_TEXT } from './capacityTones'

/**
 * A shelter's occupancy: "Capacity 210 / 400", the percentage, and a bar whose colour rises with how full it is. Over-capacity is
 * said plainly and the bar is held at full. Shared by the map's place card and the shelter page. Purely presentational.
 */
export function CapacityMeter({ info }: { info: CapacityInfo }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between font-body text-body-sm font-medium text-ink-900">
        <span>
          Capacity <span className="font-bold">{info.current}</span> / {info.total}
        </span>
        <span className={cn('font-semibold', CAPACITY_PERCENT_TEXT[info.tone])}>{info.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label="Shelter occupancy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={info.barPercent}>
        <div className={cn('h-full rounded-full bg-linear-to-r', CAPACITY_BAR[info.tone])} style={{ width: `${info.barPercent}%` }} />
      </div>
      {info.over && <p className="font-body text-body-sm font-semibold text-status-critical">Over capacity — {info.current - info.total} more than it holds.</p>}
    </div>
  )
}

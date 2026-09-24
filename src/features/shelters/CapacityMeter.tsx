import { cn } from '@/lib/utils'
import type { CapacityInfo, Tone } from '@/features/map/mapModel'

const BAR: Record<Tone, string> = { safe: 'from-status-safe to-[#7cc57f]', caution: 'from-status-caution to-[#f0c24a]', critical: 'from-status-critical to-[#ef7b7b]', neutral: 'from-ink-500 to-ink-300' }
const PERCENT_TEXT: Record<Tone, string> = { safe: 'text-status-safe', caution: 'text-status-caution', critical: 'text-status-critical', neutral: 'text-ink-500' }

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
        <span className={cn('font-semibold', PERCENT_TEXT[info.tone])}>{info.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label="Shelter occupancy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={info.barPercent}>
        <div className={cn('h-full rounded-full bg-linear-to-r', BAR[info.tone])} style={{ width: `${info.barPercent}%` }} />
      </div>
      {info.over && <p className="font-body text-body-sm font-semibold text-status-critical">Over capacity — {info.current - info.total} more than it holds.</p>}
    </div>
  )
}

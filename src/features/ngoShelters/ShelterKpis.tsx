import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { ShelterTotals } from './shelterModel'

function Kpi({ label, children, tone }: { label: string; children: ReactNode; tone?: 'critical' | 'caution' }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-surface-border bg-surface-raised px-4 py-3.5 shadow-sm">
      <dt className="font-body text-body-sm font-medium text-ink-500">{label}</dt>
      <dd className={cn('font-heading text-h2 font-bold text-ink-900', tone === 'critical' && 'text-status-critical', tone === 'caution' && 'text-status-caution')}>{children}</dd>
    </div>
  )
}

const percentTone = (percent: number) => (percent < 75 ? 'text-status-safe' : percent < 90 ? 'text-status-caution' : 'text-status-critical')

/**
 * The four figures above the shelters table (mockup 2e): total capacity, how many are in it and what share that is, how many shelters
 * are at capacity, and how many still await certification. The last two are coloured only when there is something to act on. Purely
 * presentational.
 */
export function ShelterKpis({ totals }: { totals: ShelterTotals }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-label="Shelter totals">
      <Kpi label="Total capacity">{totals.capacity.toLocaleString('en-US')}</Kpi>
      <Kpi label="Occupied">
        {totals.occupied.toLocaleString('en-US')} <span className={cn('font-body text-label font-semibold', percentTone(totals.percent))}>{totals.percent}%</span>
      </Kpi>
      <Kpi label="At capacity" tone={totals.full > 0 ? 'critical' : undefined}>
        {totals.full}
      </Kpi>
      <Kpi label="Pending certification" tone={totals.pendingCertification > 0 ? 'caution' : undefined}>
        {totals.pendingCertification}
      </Kpi>
    </dl>
  )
}

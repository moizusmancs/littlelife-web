import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import type { Shelter } from '@/api/facilities'
import { capacityInfo } from '@/features/map/mapModel'
import { CapacityMeter } from './CapacityMeter'

/** How full the shelter is, when that was last updated, and — if it is closed — that it is. Purely presentational. */
export function ShelterCapacityCard({ shelter }: { shelter: Shelter }) {
  return (
    <section aria-labelledby="capacity-heading" className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm">
      <h2 id="capacity-heading" className="font-heading text-h3 font-bold text-ink-900">
        Capacity
      </h2>
      <CapacityMeter info={capacityInfo(shelter)} />
      {shelter.status === 'closed' && <p className="font-body text-body-sm font-semibold text-status-critical">This shelter is closed right now.</p>}
      <p className="font-body text-body-sm text-ink-500">Updated {formatDistanceToNowStrict(parseISO(shelter.updated_at), { addSuffix: true })}.</p>
    </section>
  )
}

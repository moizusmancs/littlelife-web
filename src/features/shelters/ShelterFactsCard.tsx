import { format, parseISO } from 'date-fns'
import type { Shelter } from '@/api/facilities'
import { CERTIFICATION_LABEL, shelterPlace } from '@/features/map/mapModel'

/** The shelter's plain facts from the API: kind, certification, when it was registered and last changed. Purely presentational. */
export function ShelterFactsCard({ shelter, extraRows = [] }: { shelter: Shelter; /** More facts for a page that knows more (the organisation's: who manages it). */ extraRows?: Array<[string, string]> }) {
  const rows: Array<[string, string]> = [
    ['Type', shelterPlace(shelter).typeLabel],
    ['Certification', CERTIFICATION_LABEL[shelter.certification_status]],
    ['Registered', format(parseISO(shelter.created_at), 'd MMM yyyy')],
    ['Last updated', format(parseISO(shelter.updated_at), 'd MMM yyyy, HH:mm')],
    ...extraRows,
  ]
  return (
    <section aria-labelledby="details-heading" className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm">
      <h2 id="details-heading" className="font-heading text-h3 font-bold text-ink-900">
        Details
      </h2>
      <dl className="flex flex-col gap-2 font-body text-body-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-ink-500">{label}</dt>
            <dd className="text-end font-medium text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

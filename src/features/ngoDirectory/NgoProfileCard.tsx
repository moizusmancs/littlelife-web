import { format, parseISO } from 'date-fns'
import type { AdminNgo } from '@/api/identity'
import { NgoStatusBadge } from './NgoStatusBadge'

const when = (iso: string) => format(parseISO(iso), 'd MMM yyyy, HH:mm')

/**
 * The organisation's own fields, exactly as `GET /admin/ngos/{id}` returns them. The decision row is
 * worded from the status because the API only records "decided by / at" (the schema has no separate
 * rejected-by): a rejected NGO says *Rejected*, anything that was ever active says *Approved* — a
 * suspended or deactivated organisation was approved first. It's absent while the NGO is pending.
 */
export function NgoProfileCard({ ngo }: { ngo: AdminNgo }) {
  const decision =
    ngo.approved_at && ngo.approved_by_email
      ? ([
          ngo.status === 'rejected' ? 'Rejected' : 'Approved',
          `${when(ngo.approved_at)} by ${ngo.approved_by_email}`,
        ] as const)
      : null

  const rows: Array<[string, React.ReactNode]> = [
    ['Organisation ID', <span key="id" className="font-mono text-body-sm [overflow-wrap:anywhere]">{ngo.id}</span>],
    ['Status', <NgoStatusBadge key="status" status={ngo.status} />],
    ['Contact email', ngo.contact_email ? <span key="e" className="[overflow-wrap:anywhere]">{ngo.contact_email}</span> : <span key="e" className="text-ink-500">Not provided</span>],
    ['Contact phone', ngo.contact_phone ?? <span key="p" className="text-ink-500">Not provided</span>],
    ['Submitted', when(ngo.created_at)],
    ...(decision ? ([[decision[0], <span key="d" className="[overflow-wrap:anywhere]">{decision[1]}</span>]] as Array<[string, React.ReactNode]>) : []),
    ['Last updated', when(ngo.updated_at)],
  ]

  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm" aria-labelledby="ngo-profile-heading">
      <h2 id="ngo-profile-heading" className="font-heading text-h3 font-bold text-ink-900">
        Organisation
      </h2>
      <dl className="mt-3 divide-y divide-surface-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="flex-none font-body text-body-sm text-ink-500">{label}</dt>
            <dd className="min-w-0 text-end font-body text-body-md text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

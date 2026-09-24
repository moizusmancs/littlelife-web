import { format, parseISO } from 'date-fns'
import { AccountRoleBadge } from '@/features/account/AccountRoleBadge'
import { AccountStatusBadge } from '@/features/account/AccountStatusBadge'
import type { AccountSummary } from '@/api/identity'

const when = (iso: string) => format(parseISO(iso), 'd MMM yyyy, HH:mm')

/** The account's own fields, exactly as `GET /admin/accounts/{id}` returns them. */
export function AccountSummaryCard({ account }: { account: AccountSummary }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Account ID', <span key="id" className="font-mono text-body-sm [overflow-wrap:anywhere]">{account.id}</span>],
    ['Email', <span key="email" className="[overflow-wrap:anywhere]">{account.email}</span>],
    ['Role', <AccountRoleBadge key="role" role={account.role} />],
    ['Status', <AccountStatusBadge key="status" status={account.status} />],
    ['Email verified', account.email_verified ? 'Yes' : 'No'],
    ['Created', when(account.created_at)],
    ['Last updated', when(account.updated_at)],
  ]

  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm" aria-labelledby="account-details-heading">
      <h2 id="account-details-heading" className="font-heading text-h3 font-bold text-ink-900">
        Account details
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

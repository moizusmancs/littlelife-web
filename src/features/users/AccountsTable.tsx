import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { EyeIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { AccountRoleBadge } from '@/features/account/AccountRoleBadge'
import { AccountStatusBadge } from '@/features/account/AccountStatusBadge'
import type { AccountStatusAction, AccountSummary } from '@/api/identity'
import { rowStatusAction } from './accountFilters'

/** One shared column template so the header and every row line up from `xl` up (the console's 240px sidebar leaves a 768px window only ~480px, and 1024px only ~735px — too little for six columns). Every column but
 *  the first is fixed-width — each row is its own grid, so an `auto` actions column would size to
 *  that row's buttons (a Reactivate row is wider than a Suspend row, the caller's own row has none)
 *  and push the columns before it out of line. */
const COLUMNS = 'xl:grid-cols-[minmax(0,1fr)_8.5rem_11rem_7.5rem_13rem]'

export interface AccountsTableProps {
  accounts: AccountSummary[]
  /** The signed-in admin's own account id: marked "You", and given no status action. */
  currentAccountId: string | undefined
  onStatusAction: (account: AccountSummary, action: AccountStatusAction) => void
  /** Router state passed along to the detail page (it uses it to link back to this exact view). */
  detailState?: unknown
}

/**
 * The accounts table for one page. Pattern W-List; pixel reference Batch 5 §5d (uppercase 11px
 * column labels, avatar + identity, pills, eye + action at the end). Only what an account summary
 * carries is shown — email, role, status, created — so the mockup's organisation, region, reports
 * and credibility columns are absent, as are its name/handle/phone. Each row offers View (the
 * detail screen) and one status action; the caller's own row offers none. Below `xl` each row
 * becomes a small card. Purely presentational.
 */
export function AccountsTable({ accounts, currentAccountId, onStatusAction, detailState }: AccountsTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-surface-border bg-surface-raised shadow-sm">
      <div
        className={`hidden h-10 items-center gap-4 border-b border-surface-border bg-surface-base px-5 font-body text-[11px] font-semibold tracking-wider text-ink-500 uppercase xl:grid ${COLUMNS}`}
        aria-hidden="true"
      >
        <div>Account</div>
        <div>Role</div>
        <div>Status</div>
        <div>Created</div>
        <div />
      </div>

      <ul>
        {accounts.map((account) => {
          const isSelf = account.id === currentAccountId
          const action = rowStatusAction(account, isSelf)
          return (
            <li
              key={account.id}
              className={`grid grid-cols-1 gap-2 border-b border-surface-border px-4 py-3.5 last:border-b-0 xl:items-center xl:gap-x-4 xl:px-5 ${COLUMNS}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex size-9 flex-none items-center justify-center rounded-full bg-primary-100 font-heading text-label font-semibold text-primary-700"
                  aria-hidden="true"
                >
                  {account.email.slice(0, 2).toUpperCase()}
                </div>
                <span className="min-w-0 font-body text-body-md font-medium text-ink-900 [overflow-wrap:anywhere]">
                  {account.email}
                </span>
                {isSelf && (
                  <span className="flex-none rounded-full bg-surface-sunken px-2 py-0.5 font-body text-[11px] font-semibold text-ink-700">
                    You
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 ps-12 xl:contents">
                <div className="flex items-center">
                  <AccountRoleBadge role={account.role} />
                </div>
                <div className="flex items-center">
                  <AccountStatusBadge status={account.status} />
                </div>
                <span className="font-body text-body-sm text-ink-500">
                  <span className="xl:hidden">Created </span>
                  {format(parseISO(account.created_at), 'd MMM yyyy')}
                </span>
              </div>

              <div className="flex items-center gap-2 ps-12 xl:ps-0 xl:justify-end">
                <Link
                  to={`/admin/users/${account.id}`}
                  state={detailState}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  aria-label={`View ${account.email}`}
                >
                  <EyeIcon size={16} aria-hidden="true" />
                  View
                </Link>
                {/* A fixed-width slot (even when empty, on the caller's own row) keeps View in line. */}
                <div className="xl:w-24">
                  {action && (
                    <Button
                      type="button"
                      size="sm"
                      className="xl:w-full"
                      variant={action === 'suspend' ? 'dangerOutline' : 'secondary'}
                      onClick={() => onStatusAction(account, action)}
                      aria-label={`${action === 'suspend' ? 'Suspend' : 'Reactivate'} ${account.email}`}
                    >
                      {action === 'suspend' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

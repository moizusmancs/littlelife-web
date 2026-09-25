import { Link } from 'react-router-dom'
import { CaretRightIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { AccountRoleBadge } from '@/features/account/AccountRoleBadge'
import { AccountStatusBadge } from '@/features/account/AccountStatusBadge'
import type { AccountStatusAction, AccountSummary } from '@/api/identity'

export interface AccountDetailHeaderProps {
  account: AccountSummary
  isSelf: boolean
  /** The status changes the API would accept for this account (empty for the caller's own). */
  actions: AccountStatusAction[]
  onStatusAction: (action: AccountStatusAction) => void
  /** Where the breadcrumb leads: the list, with whatever search/filters it was left on. */
  backTo: string
}

/**
 * Breadcrumb, identity (avatar, email, role and status pills) and the status controls. There is no
 * name here on purpose — profile names have no admin-side route. The caller's own account gets a
 * sentence instead of buttons: the backend would let an admin suspend themselves (and lock them out
 * on the spot), so the guard has to be here. Purely presentational.
 */
export function AccountDetailHeader({ account, isSelf, actions, onStatusAction, backTo }: AccountDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-body text-body-sm text-ink-500">
        <Link to={backTo} className="flex-none font-semibold whitespace-nowrap text-primary-700 hover:underline">
          Users &amp; Accounts
        </Link>
        <CaretRightIcon size={12} aria-hidden="true" />
        <span aria-current="page" className="min-w-0 [overflow-wrap:anywhere]">
          {account.email}
        </span>
      </nav>

      <div className="flex flex-col gap-4 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="flex size-14 flex-none items-center justify-center rounded-full bg-primary-100 font-heading text-h3 font-bold text-primary-700"
            aria-hidden="true"
          >
            {account.email.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-h2 font-bold text-ink-900 [overflow-wrap:anywhere]">{account.email}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <AccountRoleBadge role={account.role} />
              <AccountStatusBadge status={account.status} />
              {isSelf && (
                <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-body text-[11px] font-semibold text-ink-700">
                  You
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {actions.includes('suspend') && (
            <Button type="button" variant="dangerOutline" onClick={() => onStatusAction('suspend')}>
              Suspend account
            </Button>
          )}
          {actions.includes('reactivate') && (
            <Button type="button" variant="secondary" onClick={() => onStatusAction('reactivate')}>
              Reactivate account
            </Button>
          )}
          {isSelf && (
            <p className="font-body text-body-sm text-ink-500 lg:max-w-64">
              This is your own account, so its status can't be changed or moderated here.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

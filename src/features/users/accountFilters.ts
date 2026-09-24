import type { AccountStatus, AccountStatusAction, AccountSummary } from '@/api/identity'
import type { Role } from '@/store/auth'

export const ROLE_FILTERS: Role[] = ['user', 'ngo_volunteer', 'ngo_admin', 'admin', 'super_admin']
export const STATUS_FILTERS: AccountStatus[] = ['active', 'pending_verification', 'suspended', 'deactivated']

export interface AccountFilters {
  q: string
  role: 'all' | Role
  status: 'all' | AccountStatus
}

/**
 * The list's search and filters, applied client-side: `GET /admin/accounts` takes only
 * `limit`/`offset`. The text search matches anywhere in the email or the account id (admins paste
 * ids from logs), case-insensitively.
 */
export function filterAccounts(accounts: AccountSummary[], { q, role, status }: AccountFilters): AccountSummary[] {
  const needle = q.trim().toLowerCase()
  return accounts.filter(
    (account) =>
      (role === 'all' || account.role === role) &&
      (status === 'all' || account.status === status) &&
      (needle === '' || account.email.toLowerCase().includes(needle) || account.id.toLowerCase().includes(needle)),
  )
}

export interface AccountGroupCounts {
  citizens: number
  ngoStaff: number
  admins: number
}

/** The header's "N citizens · N NGO staff · N admins" breakdown. */
export function countByGroup(accounts: AccountSummary[]): AccountGroupCounts {
  const counts: AccountGroupCounts = { citizens: 0, ngoStaff: 0, admins: 0 }
  for (const { role } of accounts) {
    if (role === 'user') counts.citizens += 1
    else if (role === 'ngo_admin' || role === 'ngo_volunteer') counts.ngoStaff += 1
    else counts.admins += 1
  }
  return counts
}

/**
 * Which status changes to offer for an account — exactly the ones the API would accept, and none
 * for the caller's own account: the backend has no guard (an admin who suspends themselves gets a
 * `200` and is locked out on the spot), so this is the guard. `reactivate` is offered only for
 * suspended and deactivated accounts, never `pending_verification` — the API would flip that to
 * `active` without the email ever being verified.
 */
export function availableStatusActions(account: AccountSummary, isSelf: boolean): AccountStatusAction[] {
  if (isSelf) return []
  const actions: AccountStatusAction[] = []
  if (account.status !== 'suspended') actions.push('suspend')
  if (account.status === 'suspended' || account.status === 'deactivated') actions.push('reactivate')
  return actions
}

/** The single action a list row offers: reactivate a suspended account, otherwise suspend. */
export function rowStatusAction(account: AccountSummary, isSelf: boolean): AccountStatusAction | null {
  const actions = availableStatusActions(account, isSelf)
  if (actions.includes('reactivate') && account.status === 'suspended') return 'reactivate'
  return actions.includes('suspend') ? 'suspend' : null
}

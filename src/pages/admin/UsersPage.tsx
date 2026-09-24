import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { AccountStatusDialog } from '@/features/users/AccountStatusDialog'
import { AccountsNoMatches } from '@/features/users/AccountsNoMatches'
import { ListPagination } from '@/components/ui/list-pagination'
import { AccountsTable } from '@/features/users/AccountsTable'
import { AccountsToolbar } from '@/features/users/AccountsToolbar'
import { UsersLoadState } from '@/features/users/UsersLoadState'
import {
  ROLE_FILTERS,
  STATUS_FILTERS,
  countByGroup,
  filterAccounts,
  type AccountFilters,
} from '@/features/users/accountFilters'
import { useAccountStatusChange } from '@/features/users/useAccountStatusChange'
import { ADMIN_ACCOUNTS_QUERY_KEY, getAllAccounts } from '@/api/identity'
import { PAGE_SIZES } from '@/lib/pagination'
import { extractErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/store/auth'

const parseRole = (value: string | null): AccountFilters['role'] =>
  ROLE_FILTERS.find((role) => role === value) ?? 'all'
const parseStatus = (value: string | null): AccountFilters['status'] =>
  STATUS_FILTERS.find((status) => status === value) ?? 'all'
const parsePageSize = (value: string | null) => PAGE_SIZES.find((size) => String(size) === value) ?? PAGE_SIZES[0]

interface ListState {
  /** The raw search text (untrimmed, so a space typed mid-word isn't eaten). */
  q: string
  role: AccountFilters['role']
  status: AccountFilters['status']
  size: number
  page: number
}

const readState = (params: URLSearchParams): ListState => ({
  q: params.get('q') ?? '',
  role: parseRole(params.get('role')),
  status: parseStatus(params.get('status')),
  size: parsePageSize(params.get('size')),
  page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
})

/** Only what differs from the defaults, so an untouched list has a clean `/admin/users`. */
const toParams = ({ q, role, status, size, page }: ListState) => {
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  if (role !== 'all') params.set('role', role)
  if (status !== 'all') params.set('status', status)
  if (size !== PAGE_SIZES[0]) params.set('size', String(size))
  if (page > 1) params.set('page', String(page))
  return params
}

/**
 * Container for /admin/users (`admin` and `super_admin`, via the Admin route group). Owns the
 * all-accounts query, the search/filter/paging state, and the suspend/reactivate flow;
 * AccountsToolbar/AccountsTable/AccountsPagination and the dialogs are pure presentation.
 *
 * `GET /admin/accounts` only pages (`limit`/`offset`) — no search, no role or status filter — so
 * the whole list is loaded (see `getAllAccounts`) and searched, filtered and paged here. That keeps
 * the mockup's search and role filter real instead of pretending a page of 20 is the whole platform.
 * The view (search, role, status, page, page size) is read from the URL once, kept in React state
 * from then on, and mirrored back to the URL — so a hard reload, or Back from an account's page,
 * lands on the same view. State is the source of truth rather than the URL on purpose: React
 * Router's `setSearchParams` updater sees the params of the *last render*, so two changes made
 * before the next render (click a role, then type in search) made the second silently undo the
 * first. Changing any filter returns to page 1.
 */
export function UsersPage() {
  const currentAccountId = useAuthStore((s) => s.user?.id)
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ListState>(() => readState(params))
  const [notice, setNotice] = useState<PageNotice | null>(null)

  useEffect(() => {
    const next = toParams(view)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [view, params, setParams])

  const { q: search, role, status, size: pageSize, page: requestedPage } = view
  /** A filter change: apply it and go back to the first page. */
  const changeFilter = (patch: Partial<Pick<ListState, 'q' | 'role' | 'status' | 'size'>>) =>
    setView((previous) => ({ ...previous, ...patch, page: 1 }))

  const query = useQuery({ queryKey: ADMIN_ACCOUNTS_QUERY_KEY, queryFn: getAllAccounts })
  const statusChange = useAccountStatusChange({ onNotice: setNotice })

  const all = query.data?.accounts
  const filtered = useMemo(() => (all ? filterAccounts(all, { q: search, role, status }) : []), [all, search, role, status])
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(requestedPage, lastPage)
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const counts = all ? countByGroup(all) : null
  const truncated = query.data !== undefined && query.data.total > query.data.accounts.length

  const clearFilters = () => changeFilter({ q: '', role: 'all', status: 'all' })
  const listSearch = toParams(view).toString()

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-h2 font-bold text-ink-900">Users &amp; Accounts</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">
          {counts && query.data
            ? `${query.data.total} accounts · ${counts.citizens} citizens · ${counts.ngoStaff} NGO staff · ${counts.admins} admins`
            : 'Every account on the platform, whatever its role.'}
        </p>
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {truncated && query.data && (
        <Notice tone="caution">
          Showing the newest {query.data.accounts.length} of {query.data.total} accounts; older ones aren't loaded.
        </Notice>
      )}

      <AccountsToolbar
        search={search}
        onSearchChange={(value) => changeFilter({ q: value })}
        role={role}
        onRoleChange={(value) => changeFilter({ role: value })}
        status={status}
        onStatusChange={(value) => changeFilter({ status: value })}
      />

      {query.isPending ? (
        <UsersLoadState error={null} onRetry={() => void query.refetch()} />
      ) : query.isError ? (
        <UsersLoadState error={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : filtered.length === 0 ? (
        <AccountsNoMatches onClear={clearFilters} />
      ) : (
        <div className="flex flex-col gap-3">
          <AccountsTable
            accounts={visible}
            currentAccountId={currentAccountId}
            onStatusAction={statusChange.open}
            detailState={{ listSearch: listSearch ? `?${listSearch}` : '' }}
          />
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={(next) => setView((previous) => ({ ...previous, page: next }))}
            onPageSizeChange={(next) => changeFilter({ size: next })}
          />
        </div>
      )}

      <AccountStatusDialog {...statusChange.dialogProps} />
    </div>
  )
}

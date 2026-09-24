import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ListPagination } from '@/components/ui/list-pagination'
import { Notice, type PageNotice } from '@/components/ui/notice'
import { NgoDecisionDialog } from '@/features/ngoDirectory/NgoDecisionDialog'
import { NgosEmptyState } from '@/features/ngoDirectory/NgosEmptyState'
import { NgosLoadState } from '@/features/ngoDirectory/NgosLoadState'
import { NgosTable } from '@/features/ngoDirectory/NgosTable'
import { NgosToolbar } from '@/features/ngoDirectory/NgosToolbar'
import { DEFAULT_NGO_TAB, NGO_TABS, countByTab, filterNgos, type NgoTab } from '@/features/ngoDirectory/ngoFilters'
import { useNgoDecision } from '@/features/ngoDirectory/useNgoDecision'
import { ADMIN_NGOS_QUERY_KEY, getAllNgos } from '@/api/identity'
import { extractErrorMessage } from '@/api/errors'
import { PAGE_SIZES } from '@/lib/pagination'

interface ListState {
  tab: NgoTab
  /** The raw search text (untrimmed, so a space typed mid-word isn't eaten). */
  q: string
  size: number
  page: number
}

const readState = (params: URLSearchParams): ListState => ({
  tab: NGO_TABS.find((tab) => tab === params.get('tab')) ?? DEFAULT_NGO_TAB,
  q: params.get('q') ?? '',
  size: PAGE_SIZES.find((size) => String(size) === params.get('size')) ?? PAGE_SIZES[0],
  page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
})

/** Only what differs from the defaults, so an untouched list has a clean `/admin/ngos`. */
const toParams = ({ tab, q, size, page }: ListState) => {
  const params = new URLSearchParams()
  if (tab !== DEFAULT_NGO_TAB) params.set('tab', tab)
  if (q.trim()) params.set('q', q.trim())
  if (size !== PAGE_SIZES[0]) params.set('size', String(size))
  if (page > 1) params.set('page', String(page))
  return params
}

/**
 * Container for /admin/ngos (`admin` and `super_admin`, via the Admin route group). Owns the
 * all-organisations query, the tab/search/paging state, and the approve/reject flow; NgosToolbar/
 * NgosTable/ListPagination and the dialog are pure presentation.
 *
 * It opens on the *Pending approval* tab — the applications waiting for a decision are the reason an
 * admin comes here (the mockup opens on Approved). `GET /admin/ngos` could filter by status
 * server-side, but there are few organisations, so they're all loaded once and the tabs, their
 * counts and the search (which the API doesn't offer) are done here; that is one request until
 * there are 100 organisations. As on the accounts list, the view lives in React state and is
 * mirrored to the URL — not driven by it — so two quick changes can't undo each other.
 */
export function NgosPage() {
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ListState>(() => readState(params))
  const [notice, setNotice] = useState<PageNotice | null>(null)

  useEffect(() => {
    const next = toParams(view)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [view, params, setParams])

  const { tab, q: search, size: pageSize, page: requestedPage } = view
  const changeView = (patch: Partial<Pick<ListState, 'tab' | 'q' | 'size'>>) =>
    setView((previous) => ({ ...previous, ...patch, page: 1 }))

  const query = useQuery({ queryKey: ADMIN_NGOS_QUERY_KEY, queryFn: getAllNgos })
  const decision = useNgoDecision({ onNotice: setNotice })

  const all = query.data?.ngos
  const filtered = useMemo(() => (all ? filterNgos(all, { tab, q: search }) : []), [all, tab, search])
  const counts = useMemo(() => (all ? countByTab(all) : undefined), [all])
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(requestedPage, lastPage)
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const truncated = query.data !== undefined && query.data.total > query.data.ngos.length
  const listSearch = toParams(view).toString()
  const searching = search.trim() !== ''

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-h2 font-bold text-ink-900">NGOs</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">
          {counts && query.data
            ? `${query.data.total} organisations · ${counts.pending_approval} awaiting approval`
            : 'Every organisation on the platform, and the applications waiting for a decision.'}
        </p>
      </div>

      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {truncated && query.data && (
        <Notice tone="caution">
          Showing the newest {query.data.ngos.length} of {query.data.total} organisations; older ones aren't loaded.
        </Notice>
      )}

      <NgosToolbar
        tab={tab}
        onTabChange={(next) => changeView({ tab: next })}
        counts={counts}
        search={search}
        onSearchChange={(value) => changeView({ q: value })}
      />

      {query.isPending ? (
        <NgosLoadState error={null} onRetry={() => void query.refetch()} />
      ) : query.isError ? (
        <NgosLoadState error={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : filtered.length === 0 ? (
        <NgosEmptyState
          tab={tab}
          searching={searching}
          onClear={() => (searching ? changeView({ q: '' }) : changeView({ tab: 'all' }))}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <NgosTable
            ngos={visible}
            onApprove={(ngo) => decision.open(ngo, 'approve')}
            onReject={(ngo) => decision.open(ngo, 'reject')}
            detailState={{ listSearch: listSearch ? `?${listSearch}` : '' }}
          />
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={(next) => setView((previous) => ({ ...previous, page: next }))}
            onPageSizeChange={(next) => changeView({ size: next })}
          />
        </div>
      )}

      <NgoDecisionDialog {...decision.dialogProps} />
    </div>
  )
}

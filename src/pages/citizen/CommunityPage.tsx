import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CrosshairIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { useVotes } from '@/features/community/useVotes'
import { TabBar } from '@/components/ui/tab-bar'
import { FeedToolbar } from '@/features/community/FeedToolbar'
import { FeedEmpty, FeedError, FeedList, FeedSkeleton, NearbyPrompt, QaComingSoon } from '@/features/community/FeedList'
import {
  EMPTY_TEXT,
  FEED_TABS,
  buildFeed,
  categoryCounts,
  isMine,
  readCategory,
  readTab,
  rejectedCount,
  type CategoryFilter,
  type FeedTab,
} from '@/features/community/feedModel'
import { useIncidentReports, useOfficialUpdates, useReportMedia, type MediaState } from '@/features/community/useCommunityFeed'
import { LocationStatusNote } from '@/features/map/LocationNote'
import { useGeolocation } from '@/features/map/useGeolocation'
import { useMapRegions } from '@/features/map/useMapData'
import { useAuthStore } from '@/store/auth'

const PAGE_SIZE = 12

interface ViewState {
  tab: FeedTab
  category: CategoryFilter
  q: string
}

const readView = (params: URLSearchParams): ViewState => ({ tab: readTab(params.get('tab')), category: readCategory(params.get('category')), q: params.get('q') ?? '' })

/** Only what differs from the defaults, so an untouched feed is a clean `/app/community`. */
const toParams = ({ tab, category, q }: ViewState) => {
  const params = new URLSearchParams()
  if (tab !== 'latest') params.set('tab', tab)
  if (category !== 'all') params.set('category', category)
  if (q.trim()) params.set('q', q.trim())
  return params
}

const PENDING_MEDIA: MediaState = { status: 'pending' }

/**
 * /app/community — the Community Feed. Every citizen report nationwide (`GET /incident-reports?bbox=` over the whole world: reports carry no
 * region, and the route has no unscoped mode or paging) with the official updates for the citizen's home region (or only the platform-wide
 * ones, without a home region) mixed into **Latest**; **Verified** is the confirmed reports; **Nearby** sorts by distance once the viewer asks;
 * **Q&A** is the design's "Coming soon". Rejected reports are never shown (decided 2026-09-26), only counted.
 *
 * Voting: the viewer's own votes come from `GET /incident-reports/my-votes` (added on request, 2026-09-26); until they have loaded — or if
 * they can't be — the cards show plain totals, so nothing is pressed blind. Not here yet, on purpose: **Report Incident** (its drawer is a
 * later screen) and the **card links** (Incident Detail is the next screen). Owns the view (mirrored to the URL from state), the page size
 * and the viewer's position.
 */
export function CommunityPage() {
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ViewState>(() => readView(params))
  const [shown, setShown] = useState(PAGE_SIZE)
  const myId = useAuthStore((s) => s.user?.id ?? null)

  useEffect(() => {
    const next = toParams(view)
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [view, params, setParams])

  const reports = useIncidentReports()
  const regions = useMapRegions()
  const updates = useOfficialUpdates({ home: regions.home, roots: regions.roots, settled: regions.settled })
  const location = useGeolocation()
  const votes = useVotes()

  const allReports = useMemo(() => reports.data ?? [], [reports.data])
  const feed = useMemo(
    () => buildFeed({ reports: allReports, updates: updates.updates, tab: view.tab, category: view.category, query: view.q, position: location.position }),
    [allReports, updates.updates, view, location.position],
  )
  const counts = useMemo(() => categoryCounts(allReports, view.tab, view.q, location.position), [allReports, view.tab, view.q, location.position])
  const page = useMemo(() => feed.slice(0, shown), [feed, shown])
  const shownReportIds = useMemo(() => page.flatMap((item) => (item.kind === 'report' ? [item.report.id] : [])), [page])
  const media = useReportMedia(shownReportIds)
  const hidden = rejectedCount(allReports)
  const now = new Date()

  const change = (patch: Partial<ViewState>) => {
    setView((previous) => ({ ...previous, ...patch }))
    setShown(PAGE_SIZE)
  }
  const filtered = view.category !== 'all' || view.q.trim() !== ''
  const homeName = regions.home?.name ?? null
  const waitingForUpdates = view.tab === 'latest' && view.category === 'all' && updates.isPending
  // The updates are asked for by region, so a failed region list means none can be shown — said the same way as a failed request.
  const updatesError = regions.error ?? updates.errorText

  const body = () => {
    if (view.tab === 'qa') return <QaComingSoon />
    if (view.tab === 'nearby' && !location.position) return <NearbyPrompt status={location.status} onLocate={location.locate} />
    if (reports.isPending || waitingForUpdates) return <FeedSkeleton />
    if (reports.isError) return <FeedError message={reports.errorText ?? ''} onRetry={() => void reports.refetch()} />
    if (feed.length === 0) {
      return filtered ? <FeedEmpty message="No reports match your search and filters." onClear={() => change({ category: 'all', q: '' })} /> : <FeedEmpty message={EMPTY_TEXT[view.tab]} />
    }
    return (
      <FeedList
        items={page}
        total={feed.length}
        isMine={(accountId) => isMine({ reporter_account_id: accountId }, myId)}
        mediaOf={(id) => media[id] ?? PENDING_MEDIA}
        homeName={homeName}
        now={now}
        onShowMore={() => setShown((count) => count + PAGE_SIZE)}
        voteOf={(id) => (votes.mine ? (votes.mine[id] ?? null) : undefined)}
        onVote={votes.mine ? votes.press : undefined}
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-h1 font-bold text-ink-900">Community</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">What people are reporting on the ground, and official updates from responders.</p>
      </div>

      <TabBar tabs={FEED_TABS} active={view.tab} onChange={(tab) => change({ tab })} label="Community feed" idPrefix="community-tab" panelId="community-panel" />

      <div role="tabpanel" id="community-panel" aria-labelledby={`community-tab-${view.tab}`} tabIndex={-1} className="flex flex-col gap-4">
        {view.tab !== 'qa' && (
          <>
            {/* Nearby's counts depend on where the viewer is, so the search and chips wait for a position rather than reading "All 0". */}
            {(view.tab !== 'nearby' || location.position) && <FeedToolbar query={view.q} onQueryChange={(q) => change({ q })} category={view.category} counts={counts} onCategoryChange={(category) => change({ category })} />}

            {view.tab === 'nearby' && location.position && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex items-center gap-1.5 font-body text-body-sm text-ink-500">
                  <CrosshairIcon size={14} aria-hidden="true" />
                  Nearest to you first
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={location.locate} isLoading={location.status === 'locating'}>
                  Update my location
                </Button>
              </div>
            )}
            {view.tab === 'nearby' && location.position && <LocationStatusNote status={location.status} className="rounded-md border px-3.5 py-3 font-body text-body-sm text-ink-900" />}

            {view.tab === 'latest' && regions.settled && !regions.home && !regions.error && (
              <p className="font-body text-body-sm text-ink-500">
                Official updates shown here are the ones for everyone.{' '}
                <Link to="/app/profile/edit" className="font-semibold text-primary-700 hover:underline">
                  Set your home region
                </Link>{' '}
                to see the updates for your area too.
              </p>
            )}
            {view.tab === 'latest' && view.category === 'all' && updatesError && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-caution bg-status-caution-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
                <span className="min-w-0 flex-1">Couldn't load official updates: {updatesError}</span>
                <Button type="button" variant="secondary" size="sm" onClick={regions.error ? regions.retry : updates.refetch}>
                  Try again
                </Button>
              </div>
            )}
          </>
        )}

        {view.tab !== 'qa' && votes.error && (
          <Notice tone="caution" onDismiss={votes.dismissError}>
            {votes.error}
          </Notice>
        )}
        {view.tab !== 'qa' && votes.loadError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-caution bg-status-caution-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
            <span className="min-w-0 flex-1">Couldn't load your votes, so voting is off for now: {votes.loadError}</span>
            <Button type="button" variant="secondary" size="sm" onClick={votes.retry}>
              Try again
            </Button>
          </div>
        )}

        {body()}

        {view.tab !== 'qa' && !reports.isPending && !reports.isError && hidden > 0 && (
          <p className="font-body text-body-sm text-ink-500">
            {hidden === 1 ? '1 report was' : `${hidden} reports were`} rejected by moderators and {hidden === 1 ? "isn't" : "aren't"} shown.
          </p>
        )}
      </div>
    </div>
  )
}

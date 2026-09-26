import { useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { incidentMediaQueryKey, type IncidentReport } from '@/api/community'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { CATEGORY_LABEL, isMine, reportLatLng, reportTimeline } from '@/features/community/feedModel'
import { backToFeed } from '@/features/community/incidentLinks'
import { BackToFeed, IncidentDetailState } from '@/features/community/IncidentDetailState'
import { IncidentLocationCard } from '@/features/community/IncidentLocationCard'
import { IncidentLocationMap } from '@/features/community/IncidentLocationMap'
import { IncidentMediaGallery } from '@/features/community/IncidentMediaGallery'
import { IncidentSummaryCard } from '@/features/community/IncidentSummaryCard'
import { IncidentTimeline } from '@/features/community/IncidentTimeline'
import { useIncidentReports, useReportMedia } from '@/features/community/useCommunityFeed'
import { useVotes } from '@/features/community/useVotes'
import { distanceMeters } from '@/features/map/mapGeo'
import { useGeolocation } from '@/features/map/useGeolocation'
import { useAuthStore } from '@/store/auth'

/**
 * /app/community/:incidentId — one report. **There is no `GET /incident-reports/{id}`**, so the page finds the report in the same nationwide
 * list the feed reads (one cache entry: opened from the feed it asks for nothing new; a direct link asks for the list once). An id that isn't
 * in it is "not found" — so is a malformed one — and a **rejected** report says so instead of showing its content (the feed hides them;
 * decided 2026-09-26). Votes come from the feed's own hook (`my-votes`), so a vote here shows there too.
 *
 * Not built, because nothing backs them: the design's **Message** button (no messaging backend yet — Phase 7), **View on Map** (the map
 * has no incident markers until this phase's last step), a title, severity, comment count and the reporter's name or credibility.
 */
export function IncidentDetailPage() {
  const { incidentId = '' } = useParams()
  const backTo = backToFeed(useLocation().state)
  const reports = useIncidentReports()

  if (reports.isPending) return <IncidentDetailState kind="loading" backTo={backTo} />
  if (reports.isError) return <IncidentDetailState kind="error" backTo={backTo} message={reports.errorText ?? ''} onRetry={() => void reports.refetch()} />
  const report = reports.data.find((item) => item.id === incidentId)
  if (!report) return <IncidentDetailState kind="not-found" backTo={backTo} />
  if (report.status === 'rejected') return <IncidentDetailState kind="rejected" backTo={backTo} />
  return <IncidentDetail report={report} backTo={backTo} />
}

function IncidentDetail({ report, backTo }: { report: IncidentReport; backTo: string }) {
  const queryClient = useQueryClient()
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const votes = useVotes()
  const ids = useMemo(() => [report.id], [report.id])
  const media = useReportMedia(ids)[report.id] ?? { status: 'pending' as const }
  const location = useGeolocation()
  const position = reportLatLng(report)
  const steps = useMemo(() => reportTimeline(report), [report])
  const now = new Date()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <BackToFeed to={backTo} />
      {votes.error && (
        <Notice tone="caution" onDismiss={votes.dismissError}>
          {votes.error}
        </Notice>
      )}
      {votes.loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-caution bg-status-caution-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
          <span className="min-w-0 flex-1">Couldn't load your votes, so voting is off for now: {votes.loadError}</span>
          <Button type="button" variant="secondary" size="sm" onClick={votes.retry}>
            Try again
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <IncidentSummaryCard
            report={report}
            mine={isMine(report, myId)}
            now={now}
            vote={votes.mine ? (votes.mine[report.id] ?? null) : undefined}
            onVote={votes.mine ? (pressed) => votes.press(report, pressed) : undefined}
          />
          <IncidentMediaGallery state={media} onRetry={() => void queryClient.refetchQueries({ queryKey: incidentMediaQueryKey(report.id) })} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <IncidentLocationCard
            position={position}
            map={position && <IncidentLocationMap position={position} label={`Map of where this ${CATEGORY_LABEL[report.category].toLowerCase()} report was made`} />}
            distance={location.position && position ? distanceMeters(location.position, position) : null}
            locationStatus={location.status}
            onLocate={location.locate}
          />
          <IncidentTimeline steps={steps} />
        </div>
      </div>
    </div>
  )
}

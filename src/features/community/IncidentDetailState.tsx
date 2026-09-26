import { Link } from 'react-router-dom'
import { ArrowLeftIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

export type IncidentDetailStateKind = 'loading' | 'not-found' | 'rejected' | 'error'

const TEXT = {
  'not-found': { title: 'Report not found', body: 'It may have been removed, or the link is wrong.' },
  rejected: { title: 'This report was rejected', body: 'Moderators judged it false or a duplicate, so it isn’t shown.' },
} as const

/** Back to the feed — to the view it was opened from, when there was one. */
export function BackToFeed({ to }: { to: string }) {
  return (
    <Link to={to} className="flex items-center gap-1.5 self-start font-body text-body-sm font-semibold text-primary-700 hover:underline">
      <ArrowLeftIcon size={14} weight="bold" aria-hidden="true" />
      Back to community
    </Link>
  )
}

/** What stands in for a report's page: a skeleton while the reports load, "not found", "rejected", or a failure with the server's words and a retry. */
export function IncidentDetailState({ kind, backTo, message, onRetry }: { kind: IncidentDetailStateKind; backTo: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <BackToFeed to={backTo} />
      {kind === 'loading' ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the report">
          <div className="h-56 animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />
          <div className="h-40 animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />
        </div>
      ) : kind === 'error' ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-critical bg-status-critical-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
          <span className="min-w-0 flex-1">Couldn't load this report: {message}</span>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-surface-border p-10 text-center">
          <WarningCircleIcon size={32} className="text-ink-500" aria-hidden="true" />
          <h1 className="font-heading text-h2 font-bold text-ink-900">{TEXT[kind].title}</h1>
          <p className="font-body text-body-md text-ink-500">{TEXT[kind].body}</p>
        </div>
      )}
    </div>
  )
}

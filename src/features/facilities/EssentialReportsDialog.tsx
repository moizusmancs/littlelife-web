import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { EssentialLocation, EssentialReportEntry } from '@/api/facilities'
import { ESSENTIAL_TYPE_LABEL } from './facilityModel'

export interface EssentialReportsDialogProps {
  /** The place whose log is shown; `null` closes the dialog. */
  target: EssentialLocation | null
  isPending: boolean
  error: string | null
  entries: EssentialReportEntry[] | undefined
  onRetry: () => void
  onClose: () => void
}

/**
 * A place's **status-report log**, newest first — what citizens have said about whether it is open. The newest is what everyone sees; the log is the only place an admin can read the rest
 * (the reporter is never returned, so it says who *isn't* shown). There is no limit on how often an account may report, so the copy says the newest wins rather than implying a vote.
 * Purely presentational.
 */
export function EssentialReportsDialog({ target, isPending, error, entries, onRetry, onClose }: EssentialReportsDialogProps) {
  const sorted = entries ? [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at)) : []
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {target && (
          <>
            <DialogTitle>Status reports</DialogTitle>
            <DialogDescription>
              {target.name} · {ESSENTIAL_TYPE_LABEL[target.type]}. The newest report is what citizens see. Reports don't say who made them, and any signed-in account can report as often as it likes.
            </DialogDescription>

            <div className="mt-4">
              {isPending ? (
                <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading reports">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-sm bg-surface-sunken" aria-hidden="true" />
                  ))}
                </div>
              ) : error ? (
                <div>
                  <div role="alert" className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900">
                    {error}
                  </div>
                  <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
                    Try again
                  </Button>
                </div>
              ) : sorted.length === 0 ? (
                <p className="rounded-sm border border-dashed border-surface-border px-4 py-6 text-center font-body text-body-md text-ink-500">No one has reported on this place yet, so it shows as "Status unknown".</p>
              ) : (
                <>
                  <p className="mb-2 font-body text-body-sm text-ink-500">{sorted.length === 1 ? '1 report' : `${sorted.length} reports`}</p>
                  <ol className="flex flex-col divide-y divide-surface-border rounded-sm border border-surface-border">
                    {sorted.map((entry, index) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <span className="flex items-center gap-2">
                          <Badge tone={entry.status === 'open' ? 'safe' : 'critical'}>{entry.status === 'open' ? 'Open' : 'Closed'}</Badge>
                          {index === 0 && <span className="font-body text-body-sm text-ink-500">shown now</span>}
                        </span>
                        <span className="text-end font-body text-body-sm text-ink-500">
                          {formatDistanceToNowStrict(parseISO(entry.created_at), { addSuffix: true })}
                          <span className="block text-[11px] text-ink-300">{format(parseISO(entry.created_at), 'd MMM yyyy, HH:mm')}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

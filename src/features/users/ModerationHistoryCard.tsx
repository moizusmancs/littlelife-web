import { format, parseISO } from 'date-fns'
import { PlusIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ModerationAction, ModerationActionType } from '@/api/trust'

const TYPE: Record<ModerationActionType, { label: string; tone: 'caution' | 'critical' | 'safe' }> = {
  warn: { label: 'Warn', tone: 'caution' },
  suspend: { label: 'Suspend', tone: 'critical' },
  block: { label: 'Block', tone: 'critical' },
  unblock: { label: 'Unblock', tone: 'safe' },
}

export interface ModerationHistoryCardProps {
  actions: ModerationAction[] | undefined
  isLoading: boolean
  error: string | null
  onRetry: () => void
  /** Turns the recording admin's account id into something readable (their email, "You", …). */
  performerLabel: (accountId: string) => string
  /** Opens the log dialog. Omitted for the caller's own account, which can't be moderated. */
  onLog?: () => void
}

/**
 * The account's moderation log, newest first, from `GET /admin/accounts/{id}/moderation-actions`
 * (append-only: no edit, no delete). Each entry is the type, the reason, who recorded it and when.
 * Entries are what admins *decided*, which is separate from what the account's status currently is.
 */
export function ModerationHistoryCard({
  actions,
  isLoading,
  error,
  onRetry,
  performerLabel,
  onLog,
}: ModerationHistoryCardProps) {
  return (
    <section className="rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm" aria-labelledby="moderation-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="moderation-heading" className="font-heading text-h3 font-bold text-ink-900">
          Moderation history
        </h2>
        {onLog && (
          <Button type="button" size="sm" onClick={onLog}>
            <PlusIcon size={14} weight="bold" aria-hidden="true" />
            Log moderation action
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true" aria-label="Loading moderation history">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-sm bg-surface-sunken" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-3">
          <p role="alert" className="font-body text-body-sm text-status-critical">
            {error}
          </p>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : !actions || actions.length === 0 ? (
        <p className="mt-3 font-body text-body-md text-ink-500">No moderation actions have been recorded for this account.</p>
      ) : (
        <ol className="mt-3 divide-y divide-surface-border">
          {actions.map((action) => (
            <li key={action.id} className="py-3.5 first:pt-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge tone={TYPE[action.action_type].tone}>{TYPE[action.action_type].label}</Badge>
                <span className="font-body text-body-sm text-ink-500">
                  {performerLabel(action.performed_by)} · {format(parseISO(action.created_at), 'd MMM yyyy, HH:mm')}
                </span>
              </div>
              <p className="mt-1.5 font-body text-body-md whitespace-pre-wrap text-ink-900 [overflow-wrap:anywhere]">
                {action.reason}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

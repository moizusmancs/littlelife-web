import { format, formatDistanceStrict, parseISO } from 'date-fns'
import { MegaphoneIcon } from '@phosphor-icons/react'
import type { CommunityUpdate } from '@/api/community'
import { updateAudience } from './feedModel'

export interface OfficialUpdateCardProps {
  update: CommunityUpdate
  /** The home region's name — the only region the feed asks about — for "For Sukkur City"; `null` without one. */
  homeName: string | null
  now: Date
}

/**
 * An official update posted by an administrator or an NGO — the design's "Official Update" card: a 4px trust-teal left edge and no votes.
 * The post carries only its author's account id, so it says "Official update", not who. Purely presentational.
 */
export function OfficialUpdateCard({ update, homeName, now }: OfficialUpdateCardProps) {
  const created = parseISO(update.created_at)
  const headingId = `update-${update.id}-title`

  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-2 rounded-md border border-s-4 border-surface-border border-s-status-trust bg-surface-raised p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-body-sm text-ink-500">
        <span className="flex size-7 flex-none items-center justify-center rounded-full bg-status-trust-tint text-status-trust" aria-hidden="true">
          <MegaphoneIcon size={14} weight="bold" />
        </span>
        {/* One run of text, so on a narrow card it wraps like a sentence rather than stranding a "·" at a line's end or start. */}
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="font-semibold text-status-trust">Official update</span>
          <span aria-hidden="true"> · </span>
          <span>For {updateAudience(update, homeName)}</span>
          <span aria-hidden="true"> · </span>
          <time dateTime={update.created_at} title={format(created, 'd MMMM yyyy, HH:mm')} className="whitespace-nowrap">
            {formatDistanceStrict(created, now, { addSuffix: true })}
          </time>
        </span>
      </div>
      <h3 id={headingId} className={update.title ? 'font-body text-body-lg font-semibold text-ink-900 [overflow-wrap:anywhere]' : 'sr-only'}>
        {update.title ?? 'Official update'}
      </h3>
      <p className="font-body text-body-md whitespace-pre-line text-ink-700 [overflow-wrap:anywhere]">{update.content}</p>
    </article>
  )
}

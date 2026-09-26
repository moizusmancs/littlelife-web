import { ArrowFatDownIcon, ArrowFatUpIcon } from '@phosphor-icons/react'
import type { VoteType } from '@/api/community'
import { cn } from '@/lib/utils'
import { votesLabel } from './feedModel'

export interface VoteButtonsProps {
  up: number
  down: number
  /** The viewer's vote (`null` = none); `undefined` while unknown, when only the totals are shown. */
  vote: VoteType | null | undefined
  onVote?: (pressed: VoteType) => void
  /** `lg` is Incident Detail's large pair; `md` the feed card's. */
  size?: 'md' | 'lg'
}

const SIZES = {
  md: { button: 'h-8 gap-1.5 px-3 text-body-sm', icon: 15 },
  lg: { button: 'h-11 gap-2 px-5 text-body-md', icon: 20 },
} as const

/**
 * The totals, and — once the viewer's own vote is known — a pair of toggle buttons (`aria-pressed`) for it, named "Upvote" and "Downvote" inside
 * a group named by the totals ("4 upvotes, 1 downvote"). A press is the caller's; what it means (cast, switch, take back) is decided above. Until
 * the vote is known the totals are plain text, so nothing can be pressed blind. Pressed is a filled arrow and a border, not colour alone.
 */
export function VoteButtons({ up, down, vote, onVote, size = 'md' }: VoteButtonsProps) {
  const label = votesLabel(up, down)
  const { button, icon } = SIZES[size]
  if (vote === undefined || !onVote) {
    return (
      <span className={cn('flex items-center gap-3', size === 'lg' && 'text-body-md')} role="img" aria-label={label}>
        <span className="flex items-center gap-1" aria-hidden="true">
          <ArrowFatUpIcon size={icon} />
          {up}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          <ArrowFatDownIcon size={icon} />
          {down}
        </span>
      </span>
    )
  }
  const style = (pressed: boolean) =>
    cn(
      'relative z-10 flex items-center rounded-full border font-body font-semibold transition-colors',
      button,
      pressed ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-border bg-surface-raised text-ink-700 hover:bg-surface-sunken',
    )
  return (
    <span role="group" aria-label={label} className="flex items-center gap-2">
      <button type="button" aria-pressed={vote === 'upvote'} aria-label="Upvote" onClick={() => onVote('upvote')} className={style(vote === 'upvote')}>
        <ArrowFatUpIcon size={icon} weight={vote === 'upvote' ? 'fill' : 'regular'} aria-hidden="true" />
        <span aria-hidden="true">{up}</span>
      </button>
      <button type="button" aria-pressed={vote === 'downvote'} aria-label="Downvote" onClick={() => onVote('downvote')} className={style(vote === 'downvote')}>
        <ArrowFatDownIcon size={icon} weight={vote === 'downvote' ? 'fill' : 'regular'} aria-hidden="true" />
        <span aria-hidden="true">{down}</span>
      </button>
    </span>
  )
}

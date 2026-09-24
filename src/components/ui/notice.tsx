import { XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const TONES = {
  success: 'border-status-safe bg-status-safe-tint',
  caution: 'border-status-caution bg-status-caution-tint',
} as const

export interface NoticeProps {
  tone?: keyof typeof TONES
  children: React.ReactNode
  /** When given, a dismiss button is shown. Omit for a notice that reflects standing state. */
  onDismiss?: () => void
}

/** A page-level status banner (`role="status"`) for the outcome of something the user just did. */
export function Notice({ tone = 'success', children, onDismiss }: NoticeProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-sm border px-3.5 py-2.5 font-body text-body-sm text-ink-900',
        TONES[tone],
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex size-5 flex-none items-center justify-center rounded-full text-ink-500 hover:bg-surface-sunken"
          aria-label="Dismiss"
        >
          <XIcon size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

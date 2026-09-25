import { Notice } from '@/components/ui/notice'

export interface ActionBannerProps {
  /** What the last action did, as a dismissible confirmation. */
  notice: string | null
  onDismissNotice: () => void
  /** The server's own message for the last action that failed. */
  error: string | null
}

/** The outcome of the last accept / decline / remove / invite, drawn under a Safety Groups header. Purely presentational. */
export function ActionBanner({ notice, onDismissNotice, error }: ActionBannerProps) {
  if (!notice && !error) return null
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="rounded-sm border border-status-critical bg-status-critical-tint px-3.5 py-2.5 font-body text-body-sm text-ink-900"
        >
          {error}
        </div>
      )}
      {notice && <Notice onDismiss={onDismissNotice}>{notice}</Notice>}
    </div>
  )
}

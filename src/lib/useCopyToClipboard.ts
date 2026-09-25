import { useCallback, useEffect, useRef, useState } from 'react'

export type CopyStatus = 'idle' | 'copied' | 'failed'

/**
 * Copies text with the async Clipboard API and reports the outcome for a couple of seconds
 * (`copied`, or `failed` when the browser refuses — an insecure origin, or permission denied), then
 * goes back to `idle`. The caller keeps the text selectable, so a `failed` copy is never a dead end.
 */
export function useCopyToClipboard(resetAfterMs = 2000) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string) => {
      let next: CopyStatus = 'copied'
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        next = 'failed'
      }
      setStatus(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setStatus('idle'), resetAfterMs)
    },
    [resetAfterMs],
  )

  return { status, copy }
}

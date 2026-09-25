import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/lib/useCopyToClipboard'

export interface CopyButtonProps {
  text: string
  /** What is being copied, for the accessible name — "Copy Member ID". */
  label: string
}

/** A small secondary button that copies `text`, with the result announced politely ("Copied" / "Couldn't copy — select it instead"). */
export function CopyButton({ text, label }: CopyButtonProps) {
  const { status, copy } = useCopyToClipboard()

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => void copy(text)} aria-label={`Copy ${label}`}>
        {status === 'copied' ? <CheckIcon size={16} weight="bold" aria-hidden="true" /> : <CopyIcon size={16} aria-hidden="true" />}
        {status === 'copied' ? 'Copied' : 'Copy'}
      </Button>
      <span className="sr-only" role="status">
        {status === 'copied' ? `${label} copied` : status === 'failed' ? `Couldn't copy the ${label} — select it and copy it yourself` : ''}
      </span>
      {status === 'failed' && (
        <span aria-hidden="true" className="font-body text-body-sm text-status-critical">
          Couldn't copy — select it instead
        </span>
      )}
    </>
  )
}

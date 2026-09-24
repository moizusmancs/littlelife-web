import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean
}

/** Multi-line counterpart of `Input`: the same box, border, focus and error treatment. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError = false, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full resize-y rounded-sm border bg-surface-sunken px-3 py-2.5 font-body text-body-lg text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
        hasError ? 'border-2 border-status-critical focus:border-status-critical' : 'border-surface-border',
        className,
      )}
      aria-invalid={hasError || undefined}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

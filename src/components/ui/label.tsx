import * as React from 'react'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('mb-1.5 block font-body text-label font-semibold text-ink-700', className)}
      {...props}
    />
  ),
)
Label.displayName = 'Label'

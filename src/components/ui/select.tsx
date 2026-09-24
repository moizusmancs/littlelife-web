import * as React from 'react'
import { CaretDownIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** The toolbar/pagination height; the default matches `Input` for use inside forms. */
  compact?: boolean
  hasError?: boolean
}

/** A native `<select>` (so mobile gets the OS picker) styled like `Input`, with a chevron. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, compact = false, hasError = false, children, ...props }, ref) => (
    <div className="relative flex items-center">
      <select
        ref={ref}
        className={cn(
          'w-full appearance-none rounded-sm border bg-surface-sunken font-body text-ink-900 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'h-9 ps-3 pe-8 text-body-sm' : 'h-12 ps-3 pe-10 text-body-lg',
          hasError ? 'border-2 border-status-critical' : 'border-surface-border',
          className,
        )}
        aria-invalid={hasError || undefined}
        {...props}
      >
        {children}
      </select>
      <CaretDownIcon
        size={compact ? 12 : 14}
        className={cn('pointer-events-none absolute text-ink-500', compact ? 'right-3' : 'right-3.5')}
        aria-hidden="true"
      />
    </div>
  ),
)
Select.displayName = 'Select'

import * as React from 'react'
import { CheckIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * A real native `<input type="checkbox">` (so react-hook-form's `register()`, keyboard
 * interaction, and screen readers all work as normal) with the box itself visually replaced
 * by sibling elements driven by `group-has-checked:` — matches the mockup's 18×18
 * rounded-square checkbox (Batch 3 Citizen §3a) without giving up native checkbox semantics.
 *
 * Uses `group-has-*` rather than `peer-*`: the checkmark icon is nested a level inside the
 * visual box span, not a direct sibling of the input, and `peer-*`'s `~` combinator only
 * reaches direct siblings — `has-checked` on the outer `group` correctly reaches descendants
 * at any depth instead.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <span className="group relative inline-flex size-4.5 flex-none">
      <input ref={ref} type="checkbox" className="absolute inset-0 size-full cursor-pointer opacity-0" {...props} />
      <span
        className={cn(
          'pointer-events-none flex size-full items-center justify-center rounded-[4px] border border-surface-border bg-surface-raised group-has-checked:border-primary-500 group-has-checked:bg-primary-500 group-has-focus-visible:outline-2 group-has-focus-visible:outline-offset-2 group-has-focus-visible:outline-primary-500',
          className,
        )}
      >
        <CheckIcon weight="bold" size={11} className="text-white opacity-0 group-has-checked:opacity-100" />
      </span>
    </span>
  ),
)
Checkbox.displayName = 'Checkbox'

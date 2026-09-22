import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Renders the 2px critical border + lets the field pair with a helper error message
   *  (mobile_plan §2.2) — the message itself is rendered by the caller, not this component. */
  hasError?: boolean
  /** Leading icon, e.g. an envelope/lock glyph (matches the real Login mockup, Batch 1 §1a). */
  leadingIcon?: React.ReactNode
  /** Trailing slot for an inline action, e.g. the password show/hide toggle. */
  trailingSlot?: React.ReactNode
}

/**
 * The `<input>` itself carries the border/background/focus styling and spans the whole
 * visible box — the icon/trailing slot are absolutely positioned *over* it (against this same
 * relative wrapper), not laid out as flex siblings before/after it. This isn't just a styling
 * preference: Safari's native autofill panel draws its own highlight anchored to the real
 * `<input>` element's own bounding box. With icon-as-flex-sibling, that box was narrower than
 * the visible field (the icon took up its own space to the left), so Safari's autofill
 * highlight nested visibly inside the field's border — a second box, not an ordinary styling
 * bug. Making the input's own box equal the full visible field means any browser-native chrome
 * that anchors to the input (autofill, native validation bubbles) lines up with it exactly.
 *
 * No focus/error padding compensation is needed for the border-width change (1px -> 2px):
 * the input uses the default border-box sizing, so a wider border shrinks the content box by
 * an imperceptible 1px rather than shifting the field's outer edges — and the icon is
 * positioned against the wrapper, not the input's padding box, so it never moves regardless.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError = false, leadingIcon, trailingSlot, ...props }, ref) => (
    <div className="relative flex h-12 items-center">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3 flex text-ink-500">{leadingIcon}</span>
      )}
      <input
        ref={ref}
        className={cn(
          'h-full w-full rounded-sm border bg-surface-sunken font-body text-body-lg text-ink-900 placeholder:text-ink-500 focus:border-2 focus:border-primary-500 focus:bg-surface-raised focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          leadingIcon ? 'ps-10' : 'ps-3',
          trailingSlot ? 'pe-10' : 'pe-3',
          hasError ? 'border-2 border-status-critical focus:border-status-critical' : 'border-surface-border',
          className,
        )}
        aria-invalid={hasError || undefined}
        {...props}
      />
      {trailingSlot && <span className="absolute right-3 flex">{trailingSlot}</span>}
    </div>
  ),
)
Input.displayName = 'Input'

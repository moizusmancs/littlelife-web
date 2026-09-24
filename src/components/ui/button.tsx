import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { type VariantProps } from 'class-variance-authority'
import { buttonVariants } from './button-variants'
import { cn } from '@/lib/utils'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Swaps the label for a spinner at the same size — no layout shift (mobile_plan §2.1). */
  isLoading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {/* Accessible name must survive the loading state — a spinner-only button announces
            nothing to a screen reader, which the design system's own a11y baseline forbids
            (mobile_plan §1.8). Visually hidden, not removed, while loading. `contents` when
            NOT loading so this wrapper doesn't introduce a box that breaks the outer flex
            button's own `gap`/`items-center` layout for multi-child content (icon + label +
            badge, e.g. the Google button). */}
        <span className={isLoading ? 'sr-only' : 'contents'}>{children}</span>
      </Comp>
    )
  },
)
Button.displayName = 'Button'

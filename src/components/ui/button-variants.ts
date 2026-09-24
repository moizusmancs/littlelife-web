import { cva } from 'class-variance-authority'

/**
 * Button variants per mobile_plan §2.1 (reused as-is for web, WEB_DESIGN_PLAN.md §1). Note the
 * two deliberate departures from "primary = pink" that are load-bearing, not bugs:
 * - `dangerOutline` is ink-900 text on a critical-colored border (mobile_plan §1.2.4) — generic
 *   destructive actions ("Deactivate Account") never get a solid critical fill.
 * - `criticalSolid`/`safeSolid` (solid critical/safe fill) are reserved for real emergency
 *   actions ("I Need Help" / "I'm Safe") — never reused for a delete-confirmation button.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border-[1.5px] border-transparent font-body text-label font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:pointer-events-none disabled:border-transparent disabled:bg-ink-300 disabled:text-surface-raised',
  {
    variants: {
      variant: {
        primary: 'bg-primary-500 text-white hover:bg-primary-400 active:bg-primary-600',
        secondary: 'border-primary-500 bg-surface-raised text-primary-700 hover:bg-primary-50',
        ghost: 'text-primary-700 hover:bg-primary-50',
        dangerOutline:
          'border-status-critical bg-surface-raised text-ink-900 hover:bg-status-critical-tint',
        criticalSolid: 'bg-status-critical text-white hover:brightness-110',
        safeSolid: 'bg-status-safe text-white hover:brightness-110',
      },
      size: {
        lg: 'h-13 px-6 text-body-lg',
        md: 'h-11 px-5',
        sm: 'h-9 px-4 text-body-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

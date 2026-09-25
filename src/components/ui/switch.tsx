import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

/**
 * An on/off switch (Radix Switch: `role="switch"`, `aria-checked`, Space to toggle, real `<button>`). Name it with
 * `aria-labelledby` / `aria-label` or a `<label htmlFor>` — the track alone says nothing. On is brand pink; the thumb
 * slides, and the track keeps a visible border so its state doesn't rest on colour alone.
 */
export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex h-7 w-12 flex-none cursor-pointer items-center rounded-full border-2 border-transparent bg-ink-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-primary-500',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5.5 translate-x-0 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  ),
)
Switch.displayName = 'Switch'

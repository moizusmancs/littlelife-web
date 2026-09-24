import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * Generic modal primitive — shadcn's pattern, not its generated code (same approach as every
 * other component here, see FRONTEND_IMPLEMENTATION_PLAN.md's Progress log). First real
 * consumer is Account Settings' Deactivate/Delete confirm dialogs (WEB_DESIGN_PLAN.md §6.2), but
 * built generically since "opens confirm dialog" / "opens password-confirmation dialog" recurs
 * across nearly every later NGO/Admin screen's own button spec.
 */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/50" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-110 -translate-x-1/2 -translate-y-1/2 rounded-md border border-surface-border bg-surface-raised p-6 shadow-lg focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-surface-sunken"
          aria-label="Close"
        >
          <XIcon size={18} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('pe-8 font-heading text-h3 font-bold text-ink-900', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('mt-1.5 font-body text-body-md text-ink-500', className)}
      {...props}
    />
  )
}

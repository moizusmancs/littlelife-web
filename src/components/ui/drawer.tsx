import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { ReturnFocusRoot } from '@/lib/returnFocus'
import { useReturnFocus } from '@/lib/useReturnFocus'

/**
 * A modal side sheet — the same Radix dialog as `Dialog` (focus trap, Escape, scroll lock,
 * labelled by its title), but pinned to the right edge and full height instead of centred, for
 * forms too long or too structured for a small confirm box. Full width on a phone. Compose it as
 * `DrawerContent > DrawerHeader + (DrawerBody + DrawerFooter inside a <form>)`.
 */
export const Drawer = ReturnFocusRoot
export const DrawerTrigger = DialogPrimitive.Trigger
export const DrawerClose = DialogPrimitive.Close

export function DrawerContent({ className, children, onCloseAutoFocus, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  const returnFocus = useReturnFocus(onCloseAutoFocus)
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-900/50" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface-raised shadow-lg focus:outline-none sm:max-w-lg sm:border-l sm:border-surface-border',
          className,
        )}
        {...props}
        onCloseAutoFocus={returnFocus}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute top-3.5 right-4 flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-surface-sunken"
          aria-label="Close"
        >
          <XIcon size={18} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-none border-b border-surface-border py-4 ps-5 pe-14', className)} {...props} />
}

/** The scrolling middle; the header and footer stay put. */
export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)} {...props} />
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-none justify-end gap-3 border-t border-surface-border px-5 py-3', className)} {...props} />
}

export function DrawerTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('font-heading text-h3 font-bold text-ink-900', className)} {...props} />
}

export function DrawerDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('mt-1 font-body text-body-sm text-ink-500', className)} {...props} />
}

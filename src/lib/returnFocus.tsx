import { useState, type ComponentProps } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'

import { OpenerContext } from './openerContext'

/**
 * A Radix dialog root that remembers what had focus **at the moment `open` turned true**, so the content can give focus back to it when it closes.
 * Radix returns focus to a dialog's own `Trigger` — but the dialogs here are opened from page state (a row's "Resolve" button sets a target, a page's
 * "Register" button sets a flag), so there is no `Trigger`, Radix has nothing to return to, and a keyboard user lands back at the top of the page.
 * It has to be noticed while rendering — not in `onOpenAutoFocus`, which runs after a field with `autoFocus` inside the dialog has already taken focus —
 * and it is only done for a controlled dialog (`open` given); one with a `Trigger` is left to Radix.
 */
export function ReturnFocusRoot({ open, children, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== undefined && open !== wasOpen) {
    // Adjusting state while rendering (React's own pattern for state that follows a prop): this runs before the commit that mounts the content and its autofocused field.
    setWasOpen(open)
    // Only on the way in: on the way out the opener must stay, because Radix asks for it *after* the content has gone.
    if (open) {
      const focused = document.activeElement
      setOpener(focused instanceof HTMLElement && focused !== document.body ? focused : null)
    }
  }
  return (
    <DialogPrimitive.Root open={open} {...props}>
      <OpenerContext.Provider value={opener}>{children}</OpenerContext.Provider>
    </DialogPrimitive.Root>
  )
}

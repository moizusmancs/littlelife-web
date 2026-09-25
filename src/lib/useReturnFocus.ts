import { useContext } from 'react'
import { OpenerContext } from './openerContext'

/**
 * The `onCloseAutoFocus` for `Dialog.Content`: back to the element that opened the dialog (see `ReturnFocusRoot`) — unless it has gone (a row that was resolved
 * away) or the caller chose otherwise (`preventDefault` in their own handler).
 */
export function useReturnFocus(onCloseAutoFocus?: (event: Event) => void) {
  const opener = useContext(OpenerContext)
  return (event: Event) => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented || !opener?.isConnected) return
    event.preventDefault() // Radix would otherwise try (and, with no Trigger, fail) to focus its own trigger
    opener.focus()
  }
}

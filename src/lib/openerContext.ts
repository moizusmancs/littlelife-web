import { createContext } from 'react'

/** What had focus when a controlled dialog opened — provided by `ReturnFocusRoot`, read by `useReturnFocus`. */
export const OpenerContext = createContext<HTMLElement | null>(null)

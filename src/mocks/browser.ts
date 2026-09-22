import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** Started conditionally from main.tsx behind VITE_ENABLE_MOCKS — only intercepts the
 *  not-yet-built domains (see handlers/index.ts); everything else passes through untouched to
 *  the real backend. */
export const worker = setupWorker(...handlers)

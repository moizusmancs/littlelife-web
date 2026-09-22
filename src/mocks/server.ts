import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** Used by Vitest (src/test/setup.ts) for deterministic component tests against the
 *  not-yet-built domains, without hitting a real network. */
export const server = setupServer(...handlers)

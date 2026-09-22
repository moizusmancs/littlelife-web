import type { HttpHandler } from 'msw'

/**
 * Alerting — backend Phase 10, not built (FRONTEND_IMPLEMENTATION_PLAN.md §1).
 * Target contract to mock against: WEB_DESIGN_PLAN.md §6.2 (Alert Takeover), §6.3/§6.4
 * (Alerts & Broadcasts). Filled in during Phase 7 — swap to real handlers once the backend
 * ships this domain, tracked in FRONTEND_IMPLEMENTATION_PLAN.md §1.
 */
export const alertingHandlers: HttpHandler[] = []

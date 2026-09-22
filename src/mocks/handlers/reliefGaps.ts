import type { HttpHandler } from 'msw'

/**
 * Field observations & community feedback (M16 FE-10/11) — confirmed NO route exists in
 * api/09-relief-operations.md despite both tables existing in the Phase 9 migration
 * (FRONTEND_IMPLEMENTATION_PLAN.md §1, Phase 6). Target contract: WEB_DESIGN_PLAN.md §6.3
 * Field Observations / Feedback. Filled in during Phase 7.
 */
export const reliefGapsHandlers: HttpHandler[] = []

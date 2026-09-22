import type { HttpHandler } from 'msw'

/**
 * Communication (chatbot, messages, calls) — backend Phase 12, not built
 * (FRONTEND_IMPLEMENTATION_PLAN.md §1). Target contract: WEB_DESIGN_PLAN.md §6.2 AI Chatbot /
 * Message Thread. Filled in during Phase 7. Voice/group calling itself is scoped down to a UI
 * stub only per Phase 7's build steps — no signaling to mock.
 */
export const communicationHandlers: HttpHandler[] = []

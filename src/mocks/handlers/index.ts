import { alertingHandlers } from './alerting'
import { navigationHandlers } from './navigation'
import { communicationHandlers } from './communication'
import { taskAssignmentsHandlers } from './taskAssignments'
import { escalationsHandlers } from './escalations'
import { reportingHandlers } from './reporting'
import { reliefGapsHandlers } from './reliefGaps'

/** Combined MSW handlers for every not-yet-built backend domain (Phase 7). Built-domain
 *  screens (Phases 1–6) talk to the real Go backend and never appear here. */
export const handlers = [
  ...alertingHandlers,
  ...navigationHandlers,
  ...communicationHandlers,
  ...taskAssignmentsHandlers,
  ...escalationsHandlers,
  ...reportingHandlers,
  ...reliefGapsHandlers,
]

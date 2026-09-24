import { z } from 'zod'

/** The reason a status change is saved under in the moderation log — the backend rejects a blank one
 *  (`400 "reason is required"`), so it's required here too, trimmed so "   " fails the same as "". */
export const statusReasonSchema = z.object({
  reason: z.string().trim().min(1, 'Enter a reason'),
})

export type StatusReasonFormValues = z.infer<typeof statusReasonSchema>

/** POST /admin/accounts/{id}/moderation-actions — one of the four types plus a non-blank reason. */
export const moderationActionSchema = z.object({
  actionType: z.enum(['warn', 'suspend', 'block', 'unblock']),
  reason: z.string().trim().min(1, 'Enter a reason'),
})

export type ModerationActionFormValues = z.infer<typeof moderationActionSchema>

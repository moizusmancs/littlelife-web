import { z } from 'zod'
import { MEMBER_ID_PATTERN } from './connections'

/** How the person being invited is named: by the email they signed up with (the default), or by their account id (their "Member ID"). */
export type InviteMethod = 'email' | 'id'

/**
 * POST /safety-connections — the recipient (an email or an account id, exactly one) and one of the two
 * connection types. Only what can be judged without looking anyone up is checked here; whether the
 * account exists and is an active citizen, and whether you're already connected, is the server's call.
 */
export const inviteMemberSchema = z
  .object({
    method: z.enum(['email', 'id']),
    recipient: z.string().trim(),
    connectionType: z.enum(['family', 'safety_group']),
  })
  .superRefine(({ method, recipient }, ctx) => {
    if (method === 'email') {
      if (!recipient) ctx.addIssue({ code: 'custom', path: ['recipient'], message: 'Enter their email address' })
      else if (!z.string().email().safeParse(recipient).success) {
        ctx.addIssue({ code: 'custom', path: ['recipient'], message: 'Enter a valid email address' })
      }
    } else if (!recipient) {
      ctx.addIssue({ code: 'custom', path: ['recipient'], message: 'Enter their Member ID' })
    } else if (!MEMBER_ID_PATTERN.test(recipient)) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipient'],
        message: "That doesn't look like a Member ID — it's a long code made of letters, numbers and dashes",
      })
    }
  })

export type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>

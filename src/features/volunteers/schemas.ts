import { z } from 'zod'

/** POST /ngo/volunteers/invitations (api/00-identity.md) — `{email}` only; the server binds it as a
 *  required email. Whether that email belongs to an eligible citizen is only knowable server-side. */
export const inviteVolunteerSchema = z.object({
  email: z.string().trim().min(1, 'Enter their email address').email('Enter a valid email address'),
})

export type InviteVolunteerFormValues = z.infer<typeof inviteVolunteerSchema>

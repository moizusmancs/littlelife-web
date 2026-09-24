import { z } from 'zod'

/** PATCH /profile (api/05-profiling.md) — `name` cannot be set back to blank/whitespace-only,
 *  so this trims before validating (submitting "  " should fail the same as submitting ""). */
export const editProfileSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name'),
})

export type EditProfileFormValues = z.infer<typeof editProfileSchema>

/** POST /auth/me/delete (api/00-identity.md) — `current_password` is the only field this route
 *  accepts, re-entered as a stolen-access-token guard against an irreversible action. No
 *  min-length rule here (unlike register/reset) — this checks an *existing* password against
 *  whatever the backend already has on file, not a new one being set. */
export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
})

export type DeleteAccountFormValues = z.infer<typeof deleteAccountSchema>

/** POST /ngos/register (api/00-identity.md) — `name` required, trimmed non-blank;
 *  `contact_email`/`contact_phone` are both optional, and `contact_email` is only validated as
 *  an email shape when non-empty (the backend's own rule: "if provided (non-empty after
 *  trimming), must be a valid email shape"). `contact_phone` has no format rule at all
 *  server-side — free text, so no client-side pattern is invented here either. */
export const registerNgoSchema = z.object({
  name: z.string().trim().min(1, 'NGO name is required'),
  contactEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  contactPhone: z.string(),
})

export type RegisterNgoFormValues = z.infer<typeof registerNgoSchema>

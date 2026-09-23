import { z } from 'zod'

/** PATCH /profile (api/05-profiling.md) — `name` cannot be set back to blank/whitespace-only,
 *  so this trims before validating (submitting "  " should fail the same as submitting ""). */
export const editProfileSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name'),
})

export type EditProfileFormValues = z.infer<typeof editProfileSchema>

import { z } from 'zod'

/** PATCH /auth/password (api/00-identity.md) — `current_password` is required (re-proved even
 *  though the caller holds a valid token); `new_password` needs 8+ characters, the backend's only
 *  rule. `confirmPassword` is a client-only safety check, never sent — same pattern as Register
 *  and Reset Password. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

import { z } from 'zod'

/** POST /auth/login (api/00-identity.md) — password has no min-length rule at login (that
 *  only applies at register/change/reset time, per the doc), it's just "present". */
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

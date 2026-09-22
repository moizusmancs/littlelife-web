import { z } from 'zod'

/** POST /auth/login (api/00-identity.md) — password has no min-length rule at login (that
 *  only applies at register/change/reset time, per the doc), it's just "present". */
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

/**
 * POST /auth/register (api/00-identity.md) sends exactly `{email, password}` — no other field
 * exists on the backend. `confirmPassword` and `agreedToTerms` are client-side-only checks
 * (never transmitted): matching-password safety and a legal gate, per the product decision to
 * build only what the register API actually accepts (see RegisterPage's own comment).
 * `password` min length is 8 to mirror the backend's own real rule exactly — a shorter value
 * should never even reach the network.
 */
export const registerSchema = z
  .object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    agreedToTerms: z.boolean().refine((val) => val === true, {
      message: 'You must agree to the Terms and Privacy Policy to continue',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>

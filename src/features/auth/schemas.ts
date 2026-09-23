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

/** POST /auth/password/forgot (api/00-identity.md) — `{email}` only. */
export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

/**
 * POST /auth/password/reset (api/00-identity.md) sends `{email, token, new_password}` — all
 * three are real user-entered fields here, not URL-only params. Confirmed empirically against
 * the real backend: unlike verify-email's 6-digit OTP (which the binder rejects at the wrong
 * length before it ever reaches business logic), `token` has NO length constraint at all — a
 * 1-char, 6-char, and 40-char fake all reach the identical "invalid or expired code" check.
 * That, plus there being no real mailer in dev (the token is only server-logged, same as the
 * OTP — api/00-identity.md's own "best-effort mailer" note), means this can't be a
 * click-a-link-only flow: there's nothing to click. The user reads the code from their email
 * (or, in dev, a server log) and types it in alongside their email, same shape as OTP
 * verification. `confirmPassword` is a client-only safety check, same pattern as Register.
 */
export const resetPasswordSchema = z
  .object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    token: z.string().min(1, 'Enter the reset code from your email'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

import { apiClient } from '@/api/client'
import type { Role } from '@/store/auth'

/**
 * Identity — auth, NGO lifecycle, admin account management.
 * Backend doc: supporting-material/api/00-identity.md (built).
 * Built incrementally, screen by screen, per FRONTEND_IMPLEMENTATION_PLAN.md Phase 1 —
 * only `login` exists so far; more are added as each screen is built.
 */

export interface LoginResponse {
  id: string
  email: string
  role: Role
  status: string
  access_token: string
}

export interface MeResponse {
  id: string
  email: string
  role: Role
  status: string
  email_verified: boolean
}

/**
 * POST /auth/login — the one login endpoint for every role (api/00-identity.md). Errors are
 * left to the caller: 401 "invalid email or password" (also covers "no such account", by
 * design — timing-safe against email enumeration) and 403 "account is not active" (suspended,
 * no self-service recovery) are the two documented failure shapes worth handling distinctly.
 *
 * Deliberately does NOT return `email_verified` — that field isn't in this response at all
 * (api/00-identity.md's documented shape is `{id,email,role,status,access_token}` only). Call
 * `getMe` right after a successful login if the caller needs that flag, don't assume a value.
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', { email, password })
  return res.data
}

/** GET /auth/me — always read fresh from the database, never trust a decoded JWT for this. */
export async function getMe(accessToken: string): Promise<MeResponse> {
  const res = await apiClient.get<MeResponse>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return res.data
}

/**
 * POST /auth/logout — idempotent, always 200 while the access token is still valid (even if
 * the refresh token/cookie is already gone). Always call this before clearing local auth
 * state, per the doc's own guidance, rather than only clearing client-side on a hunch the
 * token might be stale.
 */
export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}

export interface RegisterResponse {
  id: string
  email: string
  status: string
  access_token: string
  refresh_token: string
}

/**
 * POST /auth/register — the request body is deliberately exactly `{email, password}`. The
 * backend has no field for name, phone, or a language preference at all; those are captured
 * later, post-verification, via profile PATCH routes during the mandatory onboarding flow —
 * see RegisterPage's own comment for why this screen doesn't collect them.
 *
 * `password` needs 8+ characters, no other complexity rule. Always creates `role: "user"`
 * (self-signup can never produce any other role) and `status: "pending_verification"`.
 *
 * Real asymmetry to know about: unlike login/refresh, this route does NOT apply the web/mobile
 * cookie split — it always returns `refresh_token` as a plain body field and never sets a
 * cookie, even for a web client. RegisterPage does not rely on this response's tokens for the
 * ongoing session; it immediately calls `login` with the same credentials afterward to
 * establish a real cookie-backed session the normal way (the doc's own recommended fix for
 * this asymmetry).
 */
export async function register(email: string, password: string): Promise<RegisterResponse> {
  const res = await apiClient.post<RegisterResponse>('/auth/register', { email, password })
  return res.data
}

export interface VerifyEmailResponse {
  status: string
  access_token: string
}

/**
 * POST /auth/verify-email — `code` must be exactly 6 characters or the request never reaches
 * the "invalid or expired" branch at all, it's a plain 400 bind failure instead (the caller
 * should never be able to submit a wrong-length code through the UI in the first place, since
 * the OTP input itself only accepts 6 digits).
 *
 * The response's `access_token` is a FRESH token reflecting `email_verified: true` — the doc's
 * explicit instruction is to immediately replace the stored token with this one, discarding
 * the one issued at registration/login (which still claims unverified until it naturally
 * expires or is refreshed). The caller is responsible for that swap; this function just
 * returns what the backend sent.
 */
export async function verifyEmail(email: string, code: string): Promise<VerifyEmailResponse> {
  const res = await apiClient.post<VerifyEmailResponse>('/auth/verify-email', { email, code })
  return res.data
}

/**
 * POST /auth/resend-verification — best-effort; a 200 here does not guarantee an email
 * actually arrived (send failures are only logged server-side). NOT enumeration-safe (404 for
 * an unknown email, 409 if already verified) — a real concern for an anonymous "resend" button,
 * but not in this app's actual usage: verify-email is only ever reachable already
 * authenticated as the exact account being verified (RequireUnverifiedSession), so the email
 * is never actually unknown to the caller.
 */
export async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/resend-verification', { email })
  return res.data
}

/**
 * POST /auth/password/forgot — **always returns 200 with the same message, whether or not the
 * email is registered** (deliberately enumeration-safe, unlike resend-verification). The caller
 * must never branch UI on this response or build an "email not found" error state — there is
 * exactly one outcome to show, regardless of what happened server-side.
 */
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/password/forgot', { email })
  return res.data
}

/**
 * POST /auth/password/reset — needs `email` alongside the `token` because the reset-token store
 * is keyed by account ID, resolved from the email first. Unlike `forgotPassword`, this route is
 * NOT enumeration-safe (a real 404 for an unknown email) — the backend's own deliberate choice,
 * not something to paper over here. Returns no tokens on success; there is no session to carry
 * forward, the caller should route to `/login` afterward.
 */
export async function resetPassword(email: string, token: string, newPassword: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/password/reset', {
    email,
    token,
    new_password: newPassword,
  })
  return res.data
}

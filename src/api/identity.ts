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

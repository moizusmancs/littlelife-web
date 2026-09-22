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

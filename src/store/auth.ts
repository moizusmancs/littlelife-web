import { create } from 'zustand'

/** Matches the Go backend's `account_role` enum exactly (api/00-identity.md). */
export type Role = 'user' | 'ngo_admin' | 'ngo_volunteer' | 'admin' | 'super_admin'

export interface AuthUser {
  id: string
  email: string
  role: Role
  emailVerified: boolean
}

interface AuthState {
  /** In-memory only — never persisted to localStorage/sessionStorage (XSS surface). A page
   *  refresh re-derives this via POST /auth/refresh, which rides the httpOnly cookie. */
  accessToken: string | null
  user: AuthUser | null
  /** True until the initial /auth/refresh-on-load attempt resolves, so route guards don't
   *  redirect to /login during the brief window before we know if a session cookie exists. */
  isBootstrapping: boolean
  setAuth: (accessToken: string, user: AuthUser) => void
  clearAuth: () => void
  setBootstrapped: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isBootstrapping: true,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  clearAuth: () => set({ accessToken: null, user: null }),
  setBootstrapped: () => set({ isBootstrapping: false }),
}))

/** Login always resolves to exactly one landing route per role — no in-app role switcher
 *  (WEB_DESIGN_PLAN.md §0). */
export function roleLandingRoute(role: Role): string {
  switch (role) {
    case 'user':
      return '/app/home'
    case 'ngo_admin':
    case 'ngo_volunteer':
      return '/ngo/dashboard'
    case 'admin':
    case 'super_admin':
      return '/admin/dashboard'
  }
}

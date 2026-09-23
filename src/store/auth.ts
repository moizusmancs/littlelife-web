import { create } from 'zustand'

/** Matches the Go backend's `account_role` enum exactly (api/00-identity.md). */
export type Role = 'user' | 'ngo_admin' | 'ngo_volunteer' | 'admin' | 'super_admin'

export interface AuthUser {
  id: string
  email: string
  role: Role
  emailVerified: boolean
  /** Derived from Profiling's `GET /profile`.name !== "" (api/05-profiling.md — a freshly
   *  registered account's name starts as an empty string, the documented "not yet set" state).
   *  Only the boolean lives here, not the name itself — the auth store holds what route guards
   *  need to gate on, not a general profile-data cache; the onboarding/profile-edit screens
   *  fetch the real name independently. */
  profileComplete: boolean
}

interface AuthState {
  /** In-memory only — never persisted to localStorage/sessionStorage (XSS surface). A page
   *  refresh re-derives this via POST /auth/refresh, which rides the httpOnly cookie. */
  accessToken: string | null
  user: AuthUser | null
  /** True until the initial /auth/refresh-on-load attempt resolves, so route guards don't
   *  redirect to /login during the brief window before we know if a session cookie exists. */
  isBootstrapping: boolean
  /** One-shot info banner text for the *next* /login render. Deliberately store state, not a
   *  `navigate(..., {state})` payload: a route that clears auth and navigates away from a
   *  guarded `/app/*` screen (Account Settings' deactivate/delete) races `RequireRole`'s own
   *  effect, which reacts to the same state change and fires its own *stateless*
   *  `<Navigate to="/login">` — whichever redirect's history entry wins, router `state` attached
   *  to the other one is simply gone. A store field can't be lost that way; it's still there no
   *  matter how many redirects happen in between. Not cleared by `clearAuth()` — it needs to
   *  survive exactly that call.
   *
   *  Read it with a plain (pure) `useState(() => get().pendingMessage)` lazy initializer and
   *  clear it separately from a `useEffect` — NOT a single combined "consume" action called
   *  from the initializer. StrictMode double-invokes lazy initializers in dev specifically to
   *  catch side effects; a combined read+clear fails exactly that check — the first, thrown-away
   *  invocation clears it before the second (kept) one ever runs, so the message never actually
   *  makes it to screen in dev. `useEffect`'s double-fire is safe here since `clearPendingMessage`
   *  is idempotent. */
  pendingMessage: string | null
  setAuth: (accessToken: string, user: AuthUser) => void
  clearAuth: () => void
  setBootstrapped: () => void
  /** Called once onboarding's name step succeeds — flips the gate without needing a full
   *  re-fetch of everything setAuth normally requires. */
  markProfileComplete: () => void
  setPendingMessage: (message: string) => void
  clearPendingMessage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isBootstrapping: true,
  pendingMessage: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  clearAuth: () => set({ accessToken: null, user: null }),
  setBootstrapped: () => set({ isBootstrapping: false }),
  markProfileComplete: () =>
    set((state) => (state.user ? { user: { ...state.user, profileComplete: true } } : state)),
  setPendingMessage: (message) => set({ pendingMessage: message }),
  clearPendingMessage: () => set({ pendingMessage: null }),
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

/**
 * Where to send an authenticated user next, given the mandatory onboarding chain
 * (verify email -> complete profile -> the app) — the single source of truth every
 * auth-flow page (Login/Register/VerifyEmail/Onboarding) navigates through, and what
 * RequireRole itself gates on. Keeping this in one place means the "next step" logic can
 * never drift between a page's own post-success navigation and what the guard enforces.
 */
export function nextAuthRoute(user: Pick<AuthUser, 'role' | 'emailVerified' | 'profileComplete'>): string {
  if (!user.emailVerified) return '/verify-email'
  if (!user.profileComplete) return '/app/onboarding/profile'
  return roleLandingRoute(user.role)
}

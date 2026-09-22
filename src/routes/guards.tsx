import { Navigate, Outlet } from 'react-router-dom'
import { nextAuthRoute, roleLandingRoute, useAuthStore, type Role } from '@/store/auth'

function BootstrappingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base">
      <div className="size-8 animate-spin rounded-full border-2 border-surface-border border-t-primary-500" />
    </div>
  )
}

/**
 * Gates a route group to a set of roles. Unauthenticated -> /login. Authenticated but wrong
 * role -> that account's own landing route (there is no in-app role switcher —
 * WEB_DESIGN_PLAN.md §0 — so "wrong role" always means "belongs somewhere else", not "needs
 * an upgrade prompt"). Authenticated, right role, but mid-onboarding (unverified, or verified
 * but profile-incomplete) -> back into the onboarding chain (`nextAuthRoute`): it's mandatory,
 * so a citizen can't navigate straight past it into the app.
 *
 * NGO/Admin accounts are never created by self-registration (NGO approval and admin creation
 * both *promote* an existing account rather than minting a new one), so in practice they're
 * already fully onboarded by the time they hold one of those roles — this check exists for
 * citizens, but applies uniformly rather than special-casing role.
 */
export function RequireRole({ allowed }: { allowed: Role[] }) {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (!accessToken || !user) return <Navigate to="/login" replace />
  if (!allowed.includes(user.role)) return <Navigate to={roleLandingRoute(user.role)} replace />
  if (!user.emailVerified || !user.profileComplete) return <Navigate to={nextAuthRoute(user)} replace />

  return <Outlet />
}

/** For /login, /register, /forgot-password, /reset-password — an already-authenticated
 *  visitor is sent to wherever they actually belong next (mid-onboarding, or their landing
 *  route) instead of seeing the auth form again. NOT used for /verify-email or
 *  /app/onboarding/profile — those two have the inverse logic, they *require* being
 *  authenticated in a specific in-between state; see the guards below. */
export function RedirectIfAuthenticated() {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (accessToken && user) return <Navigate to={nextAuthRoute(user)} replace />

  return <Outlet />
}

/**
 * Gates /verify-email specifically — this is the one pre-app screen that genuinely needs to be
 * *authenticated* to show (registration logs the account in immediately, per
 * api/00-identity.md), while every other public auth screen needs the opposite. Three cases:
 * - Not authenticated at all -> nothing to verify, send to /register.
 * - Authenticated but already past this step (verified, whether or not onboarding is fully
 *   done) -> nothing to do here, send wherever `nextAuthRoute` says is next.
 * - Authenticated and unverified -> this is the mandatory next step; render it.
 */
export function RequireUnverifiedSession() {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (!accessToken || !user) return <Navigate to="/register" replace />
  if (user.emailVerified) return <Navigate to={nextAuthRoute(user)} replace />

  return <Outlet />
}

/**
 * Gates /app/onboarding/profile — the second and final mandatory onboarding step. Mirrors
 * RequireUnverifiedSession's shape one step later in the chain:
 * - Not authenticated -> /login (there's nothing mid-registration to resume without a session).
 * - Authenticated but not yet email-verified -> back to /verify-email, step one isn't done yet.
 * - Authenticated, verified, profile already complete -> nothing to do here, role landing route.
 * - Authenticated, verified, profile incomplete -> this is the mandatory step; render it.
 */
export function RequireIncompleteProfile() {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (!accessToken || !user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />
  if (user.profileComplete) return <Navigate to={roleLandingRoute(user.role)} replace />

  return <Outlet />
}

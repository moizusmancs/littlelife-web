import { Navigate, Outlet } from 'react-router-dom'
import { roleLandingRoute, useAuthStore, type Role } from '@/store/auth'

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
 * an upgrade prompt"). Authenticated, right role, but not yet email-verified -> /verify-email:
 * onboarding is mandatory and this is step one of it, so a freshly-registered citizen can't
 * navigate straight past it into the app.
 *
 * NGO/Admin accounts are never created by self-registration (NGO approval and admin creation
 * both *promote* an existing account rather than minting a new one), so in practice they're
 * already verified by the time they hold one of those roles — this check is here for
 * citizens, but applies uniformly rather than special-casing role.
 */
export function RequireRole({ allowed }: { allowed: Role[] }) {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (!accessToken || !user) return <Navigate to="/login" replace />
  if (!allowed.includes(user.role)) return <Navigate to={roleLandingRoute(user.role)} replace />
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />

  return <Outlet />
}

/** For /login, /register, /forgot-password, /reset-password — an already-authenticated
 *  visitor is sent straight to their landing route instead of seeing the auth form again.
 *  NOT used for /verify-email — see RequireUnverifiedSession below, that screen's gating logic
 *  is the inverse (it *requires* being authenticated). */
export function RedirectIfAuthenticated() {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (accessToken && user) return <Navigate to={roleLandingRoute(user.role)} replace />

  return <Outlet />
}

/**
 * Gates /verify-email specifically — this is the one auth screen that genuinely needs to be
 * *authenticated* to show (registration logs the account in immediately, per
 * api/00-identity.md), while every other public auth screen needs the opposite. Three cases:
 * - Not authenticated at all -> nothing to verify, send to /register.
 * - Authenticated and already verified -> nothing to do here, send to the role landing route.
 * - Authenticated and unverified -> this is the mandatory next step; render it.
 */
export function RequireUnverifiedSession() {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (!accessToken || !user) return <Navigate to="/register" replace />
  if (user.emailVerified) return <Navigate to={roleLandingRoute(user.role)} replace />

  return <Outlet />
}

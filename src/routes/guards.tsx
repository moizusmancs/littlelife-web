import { Navigate, Outlet } from 'react-router-dom'
import { roleLandingRoute, useAuthStore, type Role } from '@/store/auth'

function BootstrappingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base">
      <div className="size-8 animate-spin rounded-full border-2 border-surface-border border-t-primary-500" />
    </div>
  )
}

/** Gates a route group to a set of roles. Unauthenticated -> /login. Authenticated but wrong
 *  role -> that account's own landing route (there is no in-app role switcher —
 *  WEB_DESIGN_PLAN.md §0 — so "wrong role" always means "belongs somewhere else", not "needs
 *  an upgrade prompt"). */
export function RequireRole({ allowed }: { allowed: Role[] }) {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (!accessToken || !user) return <Navigate to="/login" replace />
  if (!allowed.includes(user.role)) return <Navigate to={roleLandingRoute(user.role)} replace />

  return <Outlet />
}

/** For /login, /register, etc — an already-authenticated visitor is sent straight to their
 *  landing route instead of seeing the auth form again. */
export function RedirectIfAuthenticated() {
  const { user, accessToken, isBootstrapping } = useAuthStore()

  if (isBootstrapping) return <BootstrappingScreen />
  if (accessToken && user) return <Navigate to={roleLandingRoute(user.role)} replace />

  return <Outlet />
}

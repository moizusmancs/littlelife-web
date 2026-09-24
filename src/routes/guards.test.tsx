import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/store/auth'
import { RequireRole, RedirectIfAuthenticated, RequireUnverifiedSession, RequireIncompleteProfile } from './guards'

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<div>login screen</div>} />
          <Route path="/register" element={<div>register screen</div>} />
        </Route>
        <Route element={<RequireUnverifiedSession />}>
          <Route path="/verify-email" element={<div>verify email screen</div>} />
        </Route>
        <Route element={<RequireIncompleteProfile />}>
          <Route path="/app/onboarding/profile" element={<div>onboarding profile screen</div>} />
        </Route>
        <Route element={<RequireRole allowed={['user']} />}>
          <Route path="/app/home" element={<div>citizen home</div>} />
        </Route>
        <Route element={<RequireRole allowed={['ngo_admin', 'ngo_volunteer']} />}>
          <Route path="/ngo/dashboard" element={<div>ngo dashboard</div>} />
          {/* Mirrors router.tsx: an ngo_admin-only screen nested inside the wider NGO group. */}
          <Route element={<RequireRole allowed={['ngo_admin']} />}>
            <Route path="/ngo/settings/organization" element={<div>organization settings</div>} />
          </Route>
        </Route>
        <Route element={<RequireRole allowed={['admin', 'super_admin']} />}>
          <Route path="/admin/dashboard" element={<div>admin dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

/** Every helper below defaults to a FULLY onboarded account (verified + profile complete) so
 *  role-isolation tests aren't accidentally exercising the onboarding gates too — the
 *  onboarding-specific tests further down override these explicitly. */
function setAuthedUser(overrides: Partial<Parameters<ReturnType<typeof useAuthStore.getState>['setAuth']>[1]> = {}) {
  useAuthStore.getState().setAuth('token', {
    id: '1',
    email: 'citizen@example.com',
    role: 'user',
    emailVerified: true,
    profileComplete: true,
    ...overrides,
  })
}

describe('route guards — role isolation', () => {
  beforeEach(() => {
    useAuthStore.setState({ isBootstrapping: false })
  })

  afterEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('sends an unauthenticated visitor to /login instead of any role-gated screen', () => {
    renderAt('/admin/dashboard')
    expect(screen.getByText('login screen')).toBeInTheDocument()
  })

  it('does NOT let a citizen (role "user") reach the admin dashboard', () => {
    setAuthedUser()

    renderAt('/admin/dashboard')

    expect(screen.queryByText('admin dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('citizen home')).toBeInTheDocument()
  })

  it('does NOT let a citizen reach the NGO dashboard either', () => {
    setAuthedUser()

    renderAt('/ngo/dashboard')

    expect(screen.queryByText('ngo dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('citizen home')).toBeInTheDocument()
  })

  it('does NOT let an NGO volunteer reach the admin dashboard', () => {
    setAuthedUser({ id: '2', email: 'volunteer@example.com', role: 'ngo_volunteer' })

    renderAt('/admin/dashboard')

    expect(screen.queryByText('admin dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('ngo dashboard')).toBeInTheDocument()
  })

  it('lets an NGO admin reach ngo_admin-only Organization Settings', () => {
    setAuthedUser({ id: '4', email: 'ngoadmin@example.com', role: 'ngo_admin' })

    renderAt('/ngo/settings/organization')

    expect(screen.getByText('organization settings')).toBeInTheDocument()
  })

  it('does NOT let an NGO volunteer reach Organization Settings — bounced to their own landing route', () => {
    setAuthedUser({ id: '2', email: 'volunteer@example.com', role: 'ngo_volunteer' })

    renderAt('/ngo/settings/organization')

    expect(screen.queryByText('organization settings')).not.toBeInTheDocument()
    expect(screen.getByText('ngo dashboard')).toBeInTheDocument()
  })

  it('does NOT let a citizen or a platform admin reach Organization Settings', () => {
    setAuthedUser()
    const { unmount } = renderAt('/ngo/settings/organization')
    expect(screen.queryByText('organization settings')).not.toBeInTheDocument()
    expect(screen.getByText('citizen home')).toBeInTheDocument()
    unmount()

    useAuthStore.getState().clearAuth()
    setAuthedUser({ id: '3', email: 'admin@example.com', role: 'admin' })
    renderAt('/ngo/settings/organization')
    expect(screen.queryByText('organization settings')).not.toBeInTheDocument()
    expect(screen.getByText('admin dashboard')).toBeInTheDocument()
  })

  it('lets an admin reach the admin dashboard', () => {
    setAuthedUser({ id: '3', email: 'admin@example.com', role: 'admin' })

    renderAt('/admin/dashboard')

    expect(screen.getByText('admin dashboard')).toBeInTheDocument()
  })

  it('sends an already-authenticated, fully-onboarded visitor away from /login to their own landing route', () => {
    setAuthedUser({ id: '3', email: 'admin@example.com', role: 'admin' })

    renderAt('/login')

    expect(screen.getByText('admin dashboard')).toBeInTheDocument()
  })
})

describe('route guards — onboarding chain (verify email -> complete profile -> app)', () => {
  beforeEach(() => {
    useAuthStore.setState({ isBootstrapping: false })
  })

  afterEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('does NOT let an unverified citizen skip straight into the app', () => {
    setAuthedUser({ emailVerified: false, profileComplete: false })

    renderAt('/app/home')

    expect(screen.queryByText('citizen home')).not.toBeInTheDocument()
    expect(screen.getByText('verify email screen')).toBeInTheDocument()
  })

  it('renders /verify-email for an authenticated, unverified account', () => {
    setAuthedUser({ emailVerified: false, profileComplete: false })

    renderAt('/verify-email')

    expect(screen.getByText('verify email screen')).toBeInTheDocument()
  })

  it('sends an already-verified, profile-complete account away from /verify-email', () => {
    setAuthedUser()

    renderAt('/verify-email')

    expect(screen.getByText('citizen home')).toBeInTheDocument()
  })

  it('sends a verified-but-profile-incomplete account from /verify-email onward to onboarding, not the app', () => {
    setAuthedUser({ profileComplete: false })

    renderAt('/verify-email')

    expect(screen.getByText('onboarding profile screen')).toBeInTheDocument()
  })

  it('sends an unauthenticated visitor at /verify-email to /register, not the OTP screen', () => {
    renderAt('/verify-email')

    expect(screen.getByText('register screen')).toBeInTheDocument()
  })

  it('does NOT let a verified-but-profile-incomplete citizen skip onboarding into the app', () => {
    setAuthedUser({ profileComplete: false })

    renderAt('/app/home')

    expect(screen.queryByText('citizen home')).not.toBeInTheDocument()
    expect(screen.getByText('onboarding profile screen')).toBeInTheDocument()
  })

  it('renders /app/onboarding/profile for a verified, profile-incomplete account', () => {
    setAuthedUser({ profileComplete: false })

    renderAt('/app/onboarding/profile')

    expect(screen.getByText('onboarding profile screen')).toBeInTheDocument()
  })

  it('sends an unverified account at /app/onboarding/profile back to /verify-email — step one first', () => {
    setAuthedUser({ emailVerified: false, profileComplete: false })

    renderAt('/app/onboarding/profile')

    expect(screen.getByText('verify email screen')).toBeInTheDocument()
  })

  it('sends an already-fully-onboarded account away from /app/onboarding/profile', () => {
    setAuthedUser()

    renderAt('/app/onboarding/profile')

    expect(screen.getByText('citizen home')).toBeInTheDocument()
  })

  it('sends an unauthenticated visitor at /app/onboarding/profile to /login', () => {
    renderAt('/app/onboarding/profile')

    expect(screen.getByText('login screen')).toBeInTheDocument()
  })
})

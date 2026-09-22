import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/store/auth'
import { RequireRole, RedirectIfAuthenticated } from './guards'

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<div>login screen</div>} />
        </Route>
        <Route element={<RequireRole allowed={['user']} />}>
          <Route path="/app/home" element={<div>citizen home</div>} />
        </Route>
        <Route element={<RequireRole allowed={['ngo_admin', 'ngo_volunteer']} />}>
          <Route path="/ngo/dashboard" element={<div>ngo dashboard</div>} />
        </Route>
        <Route element={<RequireRole allowed={['admin', 'super_admin']} />}>
          <Route path="/admin/dashboard" element={<div>admin dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
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
    useAuthStore.getState().setAuth('token', {
      id: '1',
      email: 'citizen@example.com',
      role: 'user',
      emailVerified: true,
    })

    renderAt('/admin/dashboard')

    expect(screen.queryByText('admin dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('citizen home')).toBeInTheDocument()
  })

  it('does NOT let a citizen reach the NGO dashboard either', () => {
    useAuthStore.getState().setAuth('token', {
      id: '1',
      email: 'citizen@example.com',
      role: 'user',
      emailVerified: true,
    })

    renderAt('/ngo/dashboard')

    expect(screen.queryByText('ngo dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('citizen home')).toBeInTheDocument()
  })

  it('does NOT let an NGO volunteer reach the admin dashboard', () => {
    useAuthStore.getState().setAuth('token', {
      id: '2',
      email: 'volunteer@example.com',
      role: 'ngo_volunteer',
      emailVerified: true,
    })

    renderAt('/admin/dashboard')

    expect(screen.queryByText('admin dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('ngo dashboard')).toBeInTheDocument()
  })

  it('lets an admin reach the admin dashboard', () => {
    useAuthStore.getState().setAuth('token', {
      id: '3',
      email: 'admin@example.com',
      role: 'admin',
      emailVerified: true,
    })

    renderAt('/admin/dashboard')

    expect(screen.getByText('admin dashboard')).toBeInTheDocument()
  })

  it('sends an already-authenticated visitor away from /login to their own landing route', () => {
    useAuthStore.getState().setAuth('token', {
      id: '3',
      email: 'admin@example.com',
      role: 'admin',
      emailVerified: true,
    })

    renderAt('/login')

    expect(screen.getByText('admin dashboard')).toBeInTheDocument()
  })
})

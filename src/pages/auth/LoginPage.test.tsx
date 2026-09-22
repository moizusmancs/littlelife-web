import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import { LoginPage } from './LoginPage'

function renderLoginPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app/home" element={<div>citizen home</div>} />
          <Route path="/admin/dashboard" element={<div>admin dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Log In' }))
}

describe('LoginPage', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('shows the backend error message on invalid credentials and does not authenticate', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json({ error: 'invalid email or password' }, { status: 401 }),
      ),
    )
    renderLoginPage()

    await fillAndSubmit('citizen@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid email or password')
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('authenticates and redirects to the account role landing route on success', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json({
          id: 'acct-1',
          email: 'citizen@example.com',
          role: 'user',
          status: 'active',
          access_token: 'fake-access-token',
        }),
      ),
      http.get('*/auth/me', () =>
        HttpResponse.json({
          id: 'acct-1',
          email: 'citizen@example.com',
          role: 'user',
          status: 'active',
          email_verified: true,
        }),
      ),
    )
    renderLoginPage()

    await fillAndSubmit('citizen@example.com', 'correct-password')

    expect(await screen.findByText('citizen home')).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBe('fake-access-token')
    expect(useAuthStore.getState().user?.emailVerified).toBe(true)
  })

  it('redirects NGO/Admin roles to their own landing route, not the citizen one', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json({
          id: 'acct-2',
          email: 'admin@example.com',
          role: 'admin',
          status: 'active',
          access_token: 'fake-admin-token',
        }),
      ),
      http.get('*/auth/me', () =>
        HttpResponse.json({
          id: 'acct-2',
          email: 'admin@example.com',
          role: 'admin',
          status: 'active',
          email_verified: true,
        }),
      ),
    )
    renderLoginPage()

    await fillAndSubmit('admin@example.com', 'correct-password')

    expect(await screen.findByText('admin dashboard')).toBeInTheDocument()
  })
})

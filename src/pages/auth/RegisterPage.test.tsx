import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import { RegisterPage } from './RegisterPage'

function renderRegisterPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<div>verify email screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password', { exact: true }), password)
  await userEvent.type(screen.getByLabelText('Confirm password'), password)
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('RegisterPage', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('registers, chains a real login for a cookie-backed session, and lands on email verification', async () => {
    let registerCalled = false
    let loginCalled = false
    server.use(
      http.post('*/auth/register', () => {
        registerCalled = true
        return HttpResponse.json(
          {
            id: 'acct-1',
            email: 'citizen@example.com',
            status: 'pending_verification',
            access_token: 'register-token-should-not-be-used',
            refresh_token: 'register-refresh-should-not-be-used',
          },
          { status: 201 },
        )
      }),
      http.post('*/auth/login', () => {
        loginCalled = true
        return HttpResponse.json({
          id: 'acct-1',
          email: 'citizen@example.com',
          role: 'user',
          status: 'pending_verification',
          access_token: 'real-cookie-backed-token',
        })
      }),
      http.get('*/auth/me', () =>
        HttpResponse.json({
          id: 'acct-1',
          email: 'citizen@example.com',
          role: 'user',
          status: 'pending_verification',
          email_verified: false,
        }),
      ),
    )
    renderRegisterPage()

    await fillAndSubmit('citizen@example.com', 'correct-password')

    expect(await screen.findByText('verify email screen')).toBeInTheDocument()
    expect(registerCalled).toBe(true)
    expect(loginCalled).toBe(true)
    expect(useAuthStore.getState().accessToken).toBe('real-cookie-backed-token')
    expect(useAuthStore.getState().user?.emailVerified).toBe(false)
  })

  it('shows the real conflict error for an already-registered email and does not authenticate', async () => {
    server.use(
      http.post('*/auth/register', () =>
        HttpResponse.json({ error: 'email already registered' }, { status: 409 }),
      ),
    )
    renderRegisterPage()

    await fillAndSubmit('citizen@example.com', 'correct-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('email already registered')
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})

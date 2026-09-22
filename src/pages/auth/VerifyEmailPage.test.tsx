import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import { VerifyEmailPage } from './VerifyEmailPage'

function renderVerifyEmailPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/verify-email']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/app/home" element={<div>citizen home</div>} />
          <Route path="/app/onboarding/profile" element={<div>onboarding profile screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function typeCode(digits: string) {
  const box1 = screen.getByLabelText('Digit 1 of 6')
  box1.focus()
  await userEvent.keyboard(digits)
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('pre-verify-token', {
      id: 'acct-1',
      email: 'citizen@example.com',
      role: 'user',
      emailVerified: false,
      profileComplete: false,
    })
  })

  afterEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('shows the authenticated account email, not a placeholder', () => {
    renderVerifyEmailPage()
    expect(screen.getByText('citizen@example.com')).toBeInTheDocument()
  })

  it('auto-submits on the 6th digit, replaces the token, and routes to onboarding when the profile is incomplete', async () => {
    server.use(
      http.post('*/auth/verify-email', () =>
        HttpResponse.json({ status: 'active', access_token: 'fresh-verified-token' }),
      ),
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: '', created_at: '', updated_at: '' }),
      ),
    )
    renderVerifyEmailPage()

    await typeCode('123456')

    expect(await screen.findByText('onboarding profile screen')).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBe('fresh-verified-token')
    expect(useAuthStore.getState().user?.emailVerified).toBe(true)
    expect(useAuthStore.getState().user?.profileComplete).toBe(false)
  })

  it('routes straight to the role landing route when the profile is already complete', async () => {
    server.use(
      http.post('*/auth/verify-email', () =>
        HttpResponse.json({ status: 'active', access_token: 'fresh-verified-token' }),
      ),
      http.get('*/profile', () =>
        HttpResponse.json({ id: 'profile-1', name: 'Aisha Khan', created_at: '', updated_at: '' }),
      ),
    )
    renderVerifyEmailPage()

    await typeCode('123456')

    expect(await screen.findByText('citizen home')).toBeInTheDocument()
  })

  it('shows the real error for an invalid code and does not authenticate', async () => {
    server.use(
      http.post('*/auth/verify-email', () =>
        HttpResponse.json({ error: 'invalid or expired code' }, { status: 400 }),
      ),
    )
    renderVerifyEmailPage()

    await typeCode('000000')

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired code')
    expect(useAuthStore.getState().user?.emailVerified).toBe(false)
  })

  it('reveals the Resend code button once the cooldown elapses, calls the real endpoint, and restarts it', async () => {
    let resendCalls = 0
    server.use(
      http.post('*/auth/resend-verification', () => {
        resendCalls += 1
        return HttpResponse.json({ message: 'verification code sent' })
      }),
    )
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })
    renderVerifyEmailPage()

    expect(screen.getByText(/Resend code in/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resend code' })).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(60_000)

    const resendButton = screen.getByRole('button', { name: 'Resend code' })
    await user.click(resendButton)

    expect(resendCalls).toBe(1)
    // The cooldown reset (not left at 0) — exact seconds aren't asserted since a real interval
    // tick can land between the click and this check; what matters is it's counting down again,
    // proven by the button disappearing once more.
    expect(await screen.findByText(/Resend code in/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resend code' })).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

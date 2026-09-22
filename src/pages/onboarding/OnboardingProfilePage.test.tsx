import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import { OnboardingProfilePage } from './OnboardingProfilePage'

function renderOnboardingPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/onboarding/profile']}>
        <Routes>
          <Route path="/app/onboarding/profile" element={<OnboardingProfilePage />} />
          <Route path="/app/home" element={<div>citizen home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OnboardingProfilePage', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', {
      id: 'acct-1',
      email: 'citizen@example.com',
      role: 'user',
      emailVerified: true,
      profileComplete: false,
    })
  })

  afterEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('rejects an empty submission without calling the network', async () => {
    let patchCalled = false
    server.use(http.patch('*/profile', () => ((patchCalled = true), HttpResponse.json({}))))
    renderOnboardingPage()

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Please enter your name')).toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  it('submits the real PATCH /profile call, marks the store complete, and lands on the role landing route', async () => {
    let sentBody: unknown
    server.use(
      http.patch('*/profile', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ id: 'profile-1', name: 'Aisha Khan', created_at: '', updated_at: '' })
      }),
    )
    renderOnboardingPage()

    await userEvent.type(screen.getByLabelText('Your name'), 'Aisha Khan')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('citizen home')).toBeInTheDocument()
    expect(sentBody).toEqual({ name: 'Aisha Khan' })
    expect(useAuthStore.getState().user?.profileComplete).toBe(true)
  })

  it('shows the real backend error and does not mark the profile complete on failure', async () => {
    server.use(
      http.patch('*/profile', () => HttpResponse.json({ error: 'name is required' }, { status: 400 })),
    )
    renderOnboardingPage()

    await userEvent.type(screen.getByLabelText('Your name'), 'x')
    await userEvent.clear(screen.getByLabelText('Your name'))
    await userEvent.type(screen.getByLabelText('Your name'), '  ')
    // Client-side validation (trim + min(1)) already blocks pure-whitespace before any network
    // call — confirm that, then a real non-whitespace submission that the *server* rejects.
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Please enter your name')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Your name'), 'Name')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('name is required')
    expect(useAuthStore.getState().user?.profileComplete).toBe(false)
  })
})

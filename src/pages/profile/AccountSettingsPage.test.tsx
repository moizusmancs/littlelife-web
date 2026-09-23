import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import { AccountSettingsPage } from './AccountSettingsPage'

function LoginStub() {
  const pendingMessage = useAuthStore((s) => s.pendingMessage)
  return <div>login screen{pendingMessage ? ` — ${pendingMessage}` : ''}</div>
}

function renderAccountSettingsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/profile/account-settings']}>
        <Routes>
          <Route path="/app/profile/account-settings" element={<AccountSettingsPage />} />
          <Route path="/login" element={<LoginStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AccountSettingsPage', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().clearPendingMessage()
  })

  it('deactivates for real, clears local auth state, and redirects to /login with a message', async () => {
    useAuthStore.getState().setAuth('fake-token', {
      id: 'acct-1',
      email: 'citizen@example.com',
      role: 'user',
      emailVerified: true,
      profileComplete: true,
    })
    let deactivateCalled = false
    server.use(
      http.post('*/auth/me/deactivate', () => {
        deactivateCalled = true
        return HttpResponse.json({ message: 'account deactivated' })
      }),
    )
    renderAccountSettingsPage()

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate account' }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(screen.getByText(/deactivated/)).toBeInTheDocument()
    expect(deactivateCalled).toBe(true)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('shows the real backend error and keeps the dialog open when deactivate fails', async () => {
    server.use(
      http.post('*/auth/me/deactivate', () =>
        HttpResponse.json({ error: 'account is not active' }, { status: 403 }),
      ),
    )
    renderAccountSettingsPage()

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('account is not active')
    expect(screen.getByRole('heading', { name: 'Deactivate your account?' })).toBeInTheDocument()
  })

  it('rejects an empty delete password without calling the network', async () => {
    let deleteCalled = false
    server.use(
      http.post('*/auth/me/delete', () => {
        deleteCalled = true
        return HttpResponse.json({ message: 'account deleted' })
      }),
    )
    renderAccountSettingsPage()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText('Enter your current password')).toBeInTheDocument()
    expect(deleteCalled).toBe(false)
  })

  it('deletes for real with the entered password, clears local auth state, and redirects to /login', async () => {
    let sentBody: unknown
    server.use(
      http.post('*/auth/me/delete', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ message: 'account deleted' })
      }),
    )
    renderAccountSettingsPage()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.type(screen.getByLabelText('Current password'), 'my-real-password')
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(screen.getByText(/deleted/)).toBeInTheDocument()
    expect(sentBody).toEqual({ current_password: 'my-real-password' })
  })

  it('shows the real backend error for a wrong password and stays on the screen', async () => {
    server.use(
      http.post('*/auth/me/delete', () =>
        HttpResponse.json({ error: 'invalid email or password' }, { status: 401 }),
      ),
      // A wrong-password 401 isn't an expired-token 401, but the client interceptor can't tell
      // those apart — it retries every non-login/refresh 401 once via a real /auth/refresh call
      // first (api/client.ts). This mirrors that real round trip (succeeds, retries, still 401,
      // _retried is now set, throws with the original body intact) instead of leaving it
      // unhandled, which would surface a generic network error and mask the real one.
      http.post('*/auth/refresh', () => HttpResponse.json({ access_token: 'refreshed-token' })),
    )
    renderAccountSettingsPage()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.type(screen.getByLabelText('Current password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid email or password')
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
  })

  it('resets the delete form between opens so a previous error/password never lingers', async () => {
    server.use(
      http.post('*/auth/me/delete', () =>
        HttpResponse.json({ error: 'invalid email or password' }, { status: 401 }),
      ),
      http.post('*/auth/refresh', () => HttpResponse.json({ access_token: 'refreshed-token' })),
    )
    renderAccountSettingsPage()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.type(screen.getByLabelText('Current password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveValue('')
  })
})

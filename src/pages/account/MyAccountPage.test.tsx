import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore, type Role } from '@/store/auth'
import { MyAccountPage } from './MyAccountPage'

function LoginStub() {
  const pendingMessage = useAuthStore((s) => s.pendingMessage)
  return <div>login screen{pendingMessage ? ` — ${pendingMessage}` : ''}</div>
}

function signIn(role: Role = 'ngo_admin') {
  useAuthStore.getState().setAuth('fake-token', {
    id: 'acct-1',
    email: 'ayesha@alkhidmat.org',
    role,
    emailVerified: true,
    profileComplete: true,
  })
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/ngo/settings/account']}>
        <Routes>
          <Route path="/ngo/settings/account" element={<MyAccountPage />} />
          <Route path="/login" element={<LoginStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const profile = (name = 'Ayesha Siddiqui') =>
  HttpResponse.json({ id: 'p-1', name, created_at: '', updated_at: '' })

const ngo = () =>
  HttpResponse.json({
    id: 'ngo-1',
    name: 'Al-Khidmat Foundation',
    status: 'active',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-20T10:00:00Z',
  })

describe('MyAccountPage', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().clearPendingMessage()
  })

  it('shows an NGO admin their own name, email, role and organisation', async () => {
    signIn('ngo_admin')
    server.use(http.get('*/profile', () => profile()), http.get('*/ngo/me', () => ngo()))
    renderPage()

    expect(await screen.findByLabelText('Full name')).toHaveValue('Ayesha Siddiqui')
    expect(screen.getByLabelText('Email')).toHaveValue('ayesha@alkhidmat.org')
    expect(screen.getByText('NGO admin')).toBeInTheDocument()
    expect(await screen.findByText('Al-Khidmat Foundation')).toBeInTheDocument()
  })

  it('never asks for an organisation for a platform admin — it would just 403', async () => {
    signIn('admin')
    let ngoCalled = false
    server.use(
      http.get('*/profile', () => profile()),
      http.get('*/ngo/me', () => {
        ngoCalled = true
        return ngo()
      }),
    )
    renderPage()

    expect(await screen.findByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(ngoCalled).toBe(false)
  })

  it('still renders, just without the organisation chip, when GET /ngo/me fails', async () => {
    signIn('ngo_volunteer')
    server.use(
      http.get('*/profile', () => profile()),
      http.get('*/ngo/me', () => HttpResponse.json({ error: 'account is not affiliated with an ngo' }, { status: 403 })),
    )
    renderPage()

    expect(await screen.findByLabelText('Full name')).toHaveValue('Ayesha Siddiqui')
    expect(screen.getByText('NGO volunteer')).toBeInTheDocument()
    expect(screen.queryByText('Al-Khidmat Foundation')).not.toBeInTheDocument()
  })

  it('saves a changed name through the real PATCH /profile and shows Saved', async () => {
    signIn()
    let sentBody: unknown
    server.use(
      http.get('*/profile', () => profile()),
      http.get('*/ngo/me', () => ngo()),
      http.patch('*/profile', async ({ request }) => {
        sentBody = await request.json()
        return profile('Ayesha S. Khan')
      }),
    )
    renderPage()

    const name = await screen.findByLabelText('Full name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Ayesha S. Khan')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(sentBody).toEqual({ name: 'Ayesha S. Khan' })
    expect(screen.getByText('Ayesha S. Khan', { selector: 'p' })).toBeInTheDocument()
  })

  it('a profile load failure only takes down the name field — password and account sections still work', async () => {
    signIn()
    server.use(
      http.get('*/profile', () => HttpResponse.json({ error: 'profile not found' }, { status: 404 })),
      http.get('*/ngo/me', () => ngo()),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('profile not found')
    expect(screen.getByLabelText('Email')).toHaveValue('ayesha@alkhidmat.org')
    expect(screen.getByLabelText('Current password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  it('changes the password for real, then ends the session: auth cleared, /login with a message', async () => {
    signIn()
    let sentBody: unknown
    server.use(
      http.get('*/profile', () => profile()),
      http.get('*/ngo/me', () => ngo()),
      http.patch('*/auth/password', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ message: 'password changed' })
      }),
    )
    renderPage()

    await userEvent.type(await screen.findByLabelText('Current password'), 'old-password')
    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-pass')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'brand-new-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(screen.getByText(/Log in with your new password/)).toBeInTheDocument()
    expect(sentBody).toEqual({ current_password: 'old-password', new_password: 'brand-new-pass' })
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('shows the real error for a wrong current password and keeps the user signed in', async () => {
    signIn()
    server.use(
      http.get('*/profile', () => profile()),
      http.get('*/ngo/me', () => ngo()),
      http.patch('*/auth/password', () => HttpResponse.json({ error: 'invalid email or password' }, { status: 401 })),
      // The client interceptor retries any non-login 401 once via a real refresh first (api/client.ts).
      http.post('*/auth/refresh', () => HttpResponse.json({ access_token: 'refreshed-token' })),
    )
    renderPage()

    await userEvent.type(await screen.findByLabelText('Current password'), 'wrong-password')
    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-pass')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'brand-new-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('invalid email or password')).toBeInTheDocument()
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).not.toBeNull()
  })

  it('offers deactivate and delete with staff-appropriate wording, and deleting ends the session', async () => {
    signIn()
    let sentBody: unknown
    server.use(
      http.get('*/profile', () => profile()),
      http.get('*/ngo/me', () => ngo()),
      http.post('*/auth/me/delete', async ({ request }) => {
        sentBody = await request.json()
        return HttpResponse.json({ message: 'account deleted' })
      }),
    )
    renderPage()

    expect(await screen.findByText(/You lose your staff access/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/your staff access are gone for good/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Current password', { selector: '#currentPassword' }), 'my-real-password')
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(screen.getByText(/deleted/)).toBeInTheDocument()
    expect(sentBody).toEqual({ current_password: 'my-real-password' })
  })

  it('deactivating ends the session with the reactivate-by-logging-in message', async () => {
    signIn()
    server.use(
      http.get('*/profile', () => profile()),
      http.get('*/ngo/me', () => ngo()),
      http.post('*/auth/me/deactivate', () => HttpResponse.json({ message: 'account deactivated' })),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate account' }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(screen.getByText(/reactivate it/)).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})

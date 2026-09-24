import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import type { VolunteerInvitation } from '@/api/identity'
import { InvitationsPage } from './InvitationsPage'

function LoginStub() {
  const pendingMessage = useAuthStore((s) => s.pendingMessage)
  return <div>login screen{pendingMessage ? ` — ${pendingMessage}` : ''}</div>
}

function renderInvitationsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/profile/invitations']}>
        <Routes>
          <Route path="/app/profile/invitations" element={<InvitationsPage />} />
          <Route path="/login" element={<LoginStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function inv(id: string, ngo_name: string): VolunteerInvitation {
  return { id, ngo_id: `ngo-${id}`, ngo_name, status: 'pending', created_at: '2026-09-20T10:00:00Z' }
}

const signIn = () =>
  useAuthStore.getState().setAuth('fake-token', {
    id: 'acct-1',
    email: 'citizen@example.com',
    role: 'user',
    emailVerified: true,
    profileComplete: true,
  })

describe('InvitationsPage', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().clearPendingMessage()
  })

  it('lists the real pending invitations', async () => {
    server.use(
      http.get('*/volunteer-invitations', () =>
        HttpResponse.json([inv('a', 'Sindh Relief Collective'), inv('b', 'Al-Khidmat Foundation')]),
      ),
    )
    renderInvitationsPage()

    expect(await screen.findByText('Sindh Relief Collective')).toBeInTheDocument()
    expect(screen.getByText('Al-Khidmat Foundation')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Pending · 2' })).toBeInTheDocument()
  })

  it('shows the empty state for an empty list — an empty list is not an error', async () => {
    server.use(http.get('*/volunteer-invitations', () => HttpResponse.json([])))
    renderInvitationsPage()

    expect(await screen.findByText('No pending invitations')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('declines for real, refetches so the card disappears, and does NOT sign the user out', async () => {
    signIn()
    let declined = false
    let declinedId = ''
    server.use(
      http.get('*/volunteer-invitations', () =>
        HttpResponse.json(declined ? [] : [inv('a', 'Sindh Relief Collective')]),
      ),
      http.patch('*/volunteer-invitations/:id/decline', ({ params }) => {
        declined = true
        declinedId = String(params.id)
        return HttpResponse.json({ message: 'invitation declined' })
      }),
    )
    renderInvitationsPage()

    await userEvent.click(await screen.findByRole('button', { name: /Decline invitation from Sindh/ }))

    expect(await screen.findByText('No pending invitations')).toBeInTheDocument()
    expect(declinedId).toBe('a')
    expect(useAuthStore.getState().accessToken).toBe('fake-token')
  })

  it('accepts for real, then signs out (real logout, auth cleared) and lands on /login with a message naming the NGO', async () => {
    signIn()
    let acceptedId = ''
    let logoutCalled = false
    server.use(
      http.get('*/volunteer-invitations', () => HttpResponse.json([inv('a', 'Sindh Relief Collective')])),
      http.patch('*/volunteer-invitations/:id/accept', ({ params }) => {
        acceptedId = String(params.id)
        return HttpResponse.json({ message: 'invitation accepted' })
      }),
      http.post('*/auth/logout', () => {
        logoutCalled = true
        return HttpResponse.json({ message: 'logged out' })
      }),
    )
    renderInvitationsPage()

    await userEvent.click(await screen.findByRole('button', { name: /Accept invitation from Sindh/ }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(screen.getByText(/now a volunteer with Sindh Relief Collective/)).toBeInTheDocument()
    expect(acceptedId).toBe('a')
    expect(logoutCalled).toBe(true)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('shows the real server error when accept fails, stays signed in, and refetches the list', async () => {
    signIn()
    let listCalls = 0
    server.use(
      http.get('*/volunteer-invitations', () => {
        listCalls += 1
        return HttpResponse.json(listCalls === 1 ? [inv('a', 'Sindh Relief Collective')] : [])
      }),
      http.patch('*/volunteer-invitations/:id/accept', () =>
        HttpResponse.json({ error: 'invitation is not pending' }, { status: 409 }),
      ),
    )
    renderInvitationsPage()

    await userEvent.click(await screen.findByRole('button', { name: /Accept invitation from Sindh/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('invitation is not pending')
    expect(await screen.findByText('No pending invitations')).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBe('fake-token')
  })

  it('shows the real "ngo is not active" error and keeps the invitation', async () => {
    server.use(
      http.get('*/volunteer-invitations', () => HttpResponse.json([inv('a', 'Sindh Relief Collective')])),
      http.patch('*/volunteer-invitations/:id/accept', () =>
        HttpResponse.json({ error: 'ngo is not active' }, { status: 409 }),
      ),
    )
    renderInvitationsPage()

    await userEvent.click(await screen.findByRole('button', { name: /Accept invitation from Sindh/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ngo is not active')
    expect(screen.getByText('Sindh Relief Collective')).toBeInTheDocument()
  })

  it('shows a load failure with a retry that recovers', async () => {
    let calls = 0
    server.use(
      http.get('*/volunteer-invitations', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ error: 'internal error' }, { status: 500 })
          : HttpResponse.json([inv('a', 'Sindh Relief Collective')])
      }),
    )
    renderInvitationsPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('internal error')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Sindh Relief Collective')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import type { NgoRegistration } from '@/api/identity'
import { MyNgoPage } from './MyNgoPage'

function LoginStub() {
  const pendingMessage = useAuthStore((s) => s.pendingMessage)
  return <div>login screen{pendingMessage ? ` — ${pendingMessage}` : ''}</div>
}

function renderMyNgoPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/profile/ngo']}>
        <Routes>
          <Route path="/app/profile/ngo" element={<MyNgoPage />} />
          <Route path="/login" element={<LoginStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function ngo(overrides: Partial<NgoRegistration> = {}): NgoRegistration {
  return {
    id: 'ngo-1',
    name: 'Flood Relief Karachi',
    status: 'pending_approval',
    created_at: '2026-09-24T10:00:00Z',
    updated_at: '2026-09-24T10:00:00Z',
    ...overrides,
  }
}

describe('MyNgoPage', () => {
  afterEach(() => {
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().clearPendingMessage()
  })

  it('treats a 404 from GET /ngos/mine as "never submitted" and shows the register form', async () => {
    server.use(http.get('*/ngos/mine', () => HttpResponse.json({ error: 'ngo not found' }, { status: 404 })))
    renderMyNgoPage()

    expect(await screen.findByLabelText('Organisation name')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'My NGO' })).toBeInTheDocument()
    expect(screen.queryByText('Pending approval')).not.toBeInTheDocument()
  })

  it('shows an existing pending submission on a fresh mount — no form, since a second submit would 409', async () => {
    server.use(http.get('*/ngos/mine', () => HttpResponse.json(ngo())))
    renderMyNgoPage()

    expect(await screen.findByText('Flood Relief Karachi')).toBeInTheDocument()
    expect(screen.getByText('Pending approval')).toBeInTheDocument()
    expect(screen.queryByLabelText('Organisation name')).not.toBeInTheDocument()
  })

  it('shows a rejected submission together with the form, so the citizen can resubmit', async () => {
    server.use(http.get('*/ngos/mine', () => HttpResponse.json(ngo({ status: 'rejected' }))))
    renderMyNgoPage()

    expect(await screen.findByText('Not approved')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Submit a new registration' })).toBeInTheDocument()
    expect(screen.getByLabelText('Organisation name')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('on approval, prompts a fresh login: logs out for real, clears auth, and lands on /login with a message', async () => {
    useAuthStore.getState().setAuth('fake-token', {
      id: 'acct-1',
      email: 'citizen@example.com',
      role: 'user',
      emailVerified: true,
      profileComplete: true,
    })
    let logoutCalled = false
    server.use(
      http.get('*/ngos/mine', () => HttpResponse.json(ngo({ status: 'active' }))),
      http.post('*/auth/logout', () => {
        logoutCalled = true
        return HttpResponse.json({ message: 'logged out' })
      }),
    )
    renderMyNgoPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Log in again' }))

    expect(await screen.findByText(/login screen —/)).toBeInTheDocument()
    expect(screen.getByText(/NGO was approved/)).toBeInTheDocument()
    expect(logoutCalled).toBe(true)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('shows the real error for a genuine failure and recovers on retry', async () => {
    let calls = 0
    server.use(
      http.get('*/ngos/mine', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ error: 'email verification required' }, { status: 403 })
          : HttpResponse.json({ error: 'ngo not found' }, { status: 404 })
      }),
    )
    renderMyNgoPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('email verification required')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByLabelText('Organisation name')).toBeInTheDocument()
  })

  it('submits the real POST, then shows the server\'s real pending row once the refetch lands', async () => {
    let submitted = false
    let sentBody: unknown
    server.use(
      http.get('*/ngos/mine', () =>
        submitted
          ? HttpResponse.json(ngo({ contact_email: 'contact@floodrelief.example' }))
          : HttpResponse.json({ error: 'ngo not found' }, { status: 404 }),
      ),
      http.post('*/ngos/register', async ({ request }) => {
        sentBody = await request.json()
        submitted = true
        return HttpResponse.json(
          { id: 'ngo-1', name: 'Flood Relief Karachi', status: 'pending_approval' },
          { status: 201 },
        )
      }),
    )
    renderMyNgoPage()

    await userEvent.type(await screen.findByLabelText('Organisation name'), 'Flood Relief Karachi')
    await userEvent.type(screen.getByLabelText('Contact email (optional)'), 'contact@floodrelief.example')
    await userEvent.click(screen.getByRole('button', { name: 'Register NGO' }))

    expect(await screen.findByText('Pending approval')).toBeInTheDocument()
    expect(screen.queryByLabelText('Organisation name')).not.toBeInTheDocument()
    expect(sentBody).toEqual({
      name: 'Flood Relief Karachi',
      contact_email: 'contact@floodrelief.example',
      contact_phone: undefined,
    })
  })

  it('resubmitting after a rejection swaps the card to the new pending row', async () => {
    let resubmitted = false
    server.use(
      http.get('*/ngos/mine', () =>
        HttpResponse.json(
          resubmitted ? ngo({ id: 'ngo-2', name: 'Second Try' }) : ngo({ status: 'rejected' }),
        ),
      ),
      http.post('*/ngos/register', () => {
        resubmitted = true
        return HttpResponse.json({ id: 'ngo-2', name: 'Second Try', status: 'pending_approval' }, { status: 201 })
      }),
    )
    renderMyNgoPage()

    await userEvent.type(await screen.findByLabelText('Organisation name'), 'Second Try')
    await userEvent.click(screen.getByRole('button', { name: 'Register NGO' }))

    expect(await screen.findByText('Pending approval')).toBeInTheDocument()
    expect(screen.getByText('Second Try')).toBeInTheDocument()
    expect(screen.queryByText('Not approved')).not.toBeInTheDocument()
  })

  it('shows the real conflict error if a submission already exists (e.g. made from another tab)', async () => {
    server.use(
      http.get('*/ngos/mine', () => HttpResponse.json({ error: 'ngo not found' }, { status: 404 })),
      http.post('*/ngos/register', () =>
        HttpResponse.json({ error: 'you already have a pending or active ngo registration' }, { status: 409 }),
      ),
    )
    renderMyNgoPage()

    await userEvent.type(await screen.findByLabelText('Organisation name'), 'Flood Relief Karachi')
    await userEvent.click(screen.getByRole('button', { name: 'Register NGO' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'you already have a pending or active ngo registration',
    )
    expect(screen.getByLabelText('Organisation name')).toBeInTheDocument()
  })
})

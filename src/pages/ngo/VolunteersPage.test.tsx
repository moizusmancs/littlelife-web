import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import type { NgoRegistration, Volunteer } from '@/api/identity'
import { VolunteersPage } from './VolunteersPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <VolunteersPage />
    </QueryClientProvider>,
  )
}

function ngo(overrides: Partial<NgoRegistration> = {}): NgoRegistration {
  return {
    id: 'ngo-1',
    name: 'Flood Relief Karachi',
    status: 'active',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-20T10:00:00Z',
    ...overrides,
  }
}

const aisha: Volunteer = { id: 'v-1', email: 'aisha@example.com', status: 'active', created_at: '2026-09-20T06:44:36Z' }
const bilal: Volunteer = { id: 'v-2', email: 'bilal@example.com', status: 'suspended', created_at: '2026-08-02T10:00:00Z' }

function serve(roster: Volunteer[] | (() => Volunteer[]), org: NgoRegistration | 'fail' = ngo()) {
  server.use(
    http.get('*/ngo/volunteers', () => HttpResponse.json(typeof roster === 'function' ? roster() : roster)),
    http.get('*/ngo/me', () =>
      org === 'fail' ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(org),
    ),
  )
}

describe('VolunteersPage', () => {
  afterEach(() => useAuthStore.getState().clearAuth())

  it("lists the organisation's volunteers with a count that separates out inactive accounts", async () => {
    serve([aisha, bilal])
    renderPage()

    expect(await screen.findByText('aisha@example.com')).toBeInTheDocument()
    expect(screen.getByText('bilal@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Everyone volunteering with Flood Relief Karachi\./)).toBeInTheDocument()
    expect(screen.getByText(/2 volunteers · 1 not active/)).toBeInTheDocument()
    expect(screen.getByText('Suspended')).toBeInTheDocument()
  })

  it('shows an empty state — not an error — for an organisation with no volunteers', async () => {
    serve([])
    renderPage()

    expect(await screen.findByRole('heading', { name: 'No volunteers yet' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invite a volunteer' })).toBeInTheDocument()
  })

  it('shows the failure with a retry, and recovers when the retry succeeds', async () => {
    let failing = true
    server.use(
      http.get('*/ngo/volunteers', () =>
        failing ? HttpResponse.json({ error: 'account is not affiliated with an ngo' }, { status: 403 }) : HttpResponse.json([aisha]),
      ),
      http.get('*/ngo/me', () => HttpResponse.json(ngo())),
      http.post('*/auth/refresh', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
    // The header is still there, so inviting isn't held hostage by a failed roster load.
    expect(screen.getByRole('button', { name: /Invite volunteer/ })).toBeInTheDocument()

    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('aisha@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('inviting', () => {
    it('sends the trimmed email, closes the dialog, and acknowledges it with a notice', async () => {
      let sentBody: unknown
      serve([aisha])
      server.use(
        http.post('*/ngo/volunteers/invitations', async ({ request }) => {
          sentBody = await request.json()
          return HttpResponse.json(
            { id: 'inv-1', ngo_id: 'ngo-1', invited_account_id: 'acct-9', status: 'pending', created_at: '2026-09-24T10:00:00Z' },
            { status: 201 },
          )
        }),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Invite volunteer/ }))
      await userEvent.type(screen.getByLabelText("Volunteer's email"), '  newcomer@example.com ')
      await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

      expect(await screen.findByText(/Invitation sent to newcomer@example\.com/)).toBeInTheDocument()
      expect(sentBody).toEqual({ email: 'newcomer@example.com' })
      expect(screen.queryByRole('heading', { name: 'Invite a volunteer' })).not.toBeInTheDocument()
    })

    it("keeps the dialog open with the server's own message when the invite is refused", async () => {
      serve([aisha])
      server.use(
        http.post('*/ngo/volunteers/invitations', () =>
          HttpResponse.json({ error: 'account not found' }, { status: 404 }),
        ),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Invite volunteer/ }))
      await userEvent.type(screen.getByLabelText("Volunteer's email"), 'ghost@example.com')
      await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('account not found')
      expect(screen.queryByText(/Invitation sent/)).not.toBeInTheDocument()
    })

    it('never calls the network for a malformed email', async () => {
      let posted = false
      serve([aisha])
      server.use(
        http.post('*/ngo/volunteers/invitations', () => {
          posted = true
          return HttpResponse.json({}, { status: 201 })
        }),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Invite volunteer/ }))
      await userEvent.type(screen.getByLabelText("Volunteer's email"), 'nope')
      await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

      expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
      expect(posted).toBe(false)
    })

    it('reopens with an empty field and no stale error', async () => {
      serve([aisha])
      server.use(
        http.post('*/ngo/volunteers/invitations', () =>
          HttpResponse.json({ error: 'account not found' }, { status: 404 }),
        ),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Invite volunteer/ }))
      await userEvent.type(screen.getByLabelText("Volunteer's email"), 'ghost@example.com')
      await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('account not found')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await userEvent.click(screen.getByRole('button', { name: /Invite volunteer/ }))

      expect(screen.getByLabelText("Volunteer's email")).toHaveValue('')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it("catches the admin's own email before the network — the backend's answer to that is a confusing 409", async () => {
      let posted = false
      useAuthStore.getState().setAuth('token', {
        id: 'me',
        email: 'Admin@Example.com',
        role: 'ngo_admin',
        emailVerified: true,
        profileComplete: true,
      })
      serve([aisha])
      server.use(
        http.post('*/ngo/volunteers/invitations', () => {
          posted = true
          return HttpResponse.json({}, { status: 201 })
        }),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Invite volunteer/ }))
      await userEvent.type(screen.getByLabelText("Volunteer's email"), 'admin@example.com')
      await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

      expect(await screen.findByRole('alert')).toHaveTextContent("That's your own email address")
      expect(posted).toBe(false)
    })

    it("replaces the invite button with an explanation when the organisation isn't active, while removal still works", async () => {
      serve([aisha], ngo({ status: 'deactivated' }))
      renderPage()

      expect(await screen.findByText('aisha@example.com')).toBeInTheDocument()
      expect(await screen.findByRole('status')).toHaveTextContent("isn't active")
      expect(screen.queryByRole('button', { name: /Invite volunteer/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Remove aisha@example.com/ })).toBeEnabled()
    })

    it("still offers to invite when the organisation lookup fails — the server has the final say", async () => {
      serve([aisha], 'fail')
      renderPage()

      expect(await screen.findByText('aisha@example.com')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Invite volunteer/ })).toBeInTheDocument()
      expect(screen.getByText(/^Everyone volunteering with your organisation\./)).toBeInTheDocument()
    })
  })

  describe('removing', () => {
    it('confirms first, then removes the right account and refetches the roster', async () => {
      let roster = [aisha, bilal]
      let patched: string | undefined
      serve(() => roster)
      server.use(
        http.patch('*/ngo/volunteers/:id/deactivate', ({ params }) => {
          patched = params.id as string
          roster = roster.filter((v) => v.id !== params.id)
          return HttpResponse.json({ message: 'volunteer removed from ngo' })
        }),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Remove bilal@example.com/ }))
      expect(patched).toBeUndefined()
      await userEvent.click(screen.getByRole('button', { name: 'Remove volunteer' }))

      expect(await screen.findByText('bilal@example.com was removed from your organisation.')).toBeInTheDocument()
      expect(patched).toBe('v-2')
      await waitFor(() => expect(screen.queryByRole('button', { name: /Remove bilal@example.com/ })).not.toBeInTheDocument())
      expect(screen.getByText('aisha@example.com')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does nothing when the confirmation is cancelled', async () => {
      let patchCalled = false
      serve([aisha])
      server.use(
        http.patch('*/ngo/volunteers/:id/deactivate', () => {
          patchCalled = true
          return HttpResponse.json({ message: 'ok' })
        }),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Remove aisha@example.com/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('aisha@example.com')).toBeInTheDocument()
      expect(patchCalled).toBe(false)
    })

    it("shows the server's message and refetches when the roster had changed underneath the page", async () => {
      let roster = [aisha]
      serve(() => roster)
      server.use(
        http.patch('*/ngo/volunteers/:id/deactivate', () => {
          roster = []
          return HttpResponse.json({ error: 'this account is not a volunteer under your ngo' }, { status: 403 })
        }),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: /Remove aisha@example.com/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Remove volunteer' }))

      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('this account is not a volunteer under your ngo')
      // The open dialog marks the page behind it aria-hidden, hence `hidden: true`.
      expect(await screen.findByRole('heading', { name: 'No volunteers yet', hidden: true })).toBeInTheDocument()
    })
  })
})

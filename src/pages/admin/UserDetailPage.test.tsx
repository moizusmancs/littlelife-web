import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { AccountStatus, AccountSummary } from '@/api/identity'
import type { ModerationAction } from '@/api/trust'
import { useAuthStore } from '@/store/auth'
import { UserDetailPage } from './UserDetailPage'

const TARGET_ID = '4ac58f97-1234-4abc-9def-0123456789ab'

function renderPage(id = TARGET_ID, state: unknown = { listSearch: '?role=user&page=3' }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/admin/users/${id}`, state }]}>
        <Routes>
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const target: AccountSummary = {
  id: TARGET_ID,
  email: 'aisha@example.com',
  role: 'user',
  status: 'active',
  email_verified: true,
  created_at: '2026-09-20T06:44:36Z',
  updated_at: '2026-09-21T10:00:00Z',
}
const otherAdmin: AccountSummary = { ...target, id: 'admin-2', email: 'other.admin@platform.example', role: 'admin' }

const entry = (id: string, type: ModerationAction['action_type'], reason: string, by: string, at: string): ModerationAction => ({
  id,
  target_account_id: TARGET_ID,
  action_type: type,
  reason,
  performed_by: by,
  created_at: at,
})

interface Options {
  account?: AccountSummary
  score?: { account_id: string; score: number; updated_at?: string }
  history?: ModerationAction[]
}

function serve({ account = target, score = { account_id: TARGET_ID, score: 0 }, history = [] }: Options = {}) {
  let current = account
  let log = history
  const calls = { patch: [] as unknown[], post: [] as unknown[] }
  server.use(
    http.get('*/admin/accounts/:id', ({ params }) => {
      if (params.id === current.id) return HttpResponse.json(current)
      if (params.id === otherAdmin.id) return HttpResponse.json(otherAdmin)
      return HttpResponse.json({ error: 'account not found' }, { status: 404 })
    }),
    http.get('*/accounts/:id/trust-score', () => HttpResponse.json(score)),
    http.get('*/admin/accounts/:id/moderation-actions', () => HttpResponse.json(log)),
    http.patch('*/admin/accounts/:id/status', async ({ request }) => {
      const body = (await request.json()) as { action: string }
      calls.patch.push(body)
      current = { ...current, status: (body.action === 'suspend' ? 'suspended' : 'active') as AccountStatus }
      return HttpResponse.json(current)
    }),
    http.post('*/admin/accounts/:id/moderation-actions', async ({ request }) => {
      const body = (await request.json()) as { action_type: ModerationAction['action_type']; reason: string }
      calls.post.push(body)
      log = [entry(`new-${log.length}`, body.action_type, body.reason, 'me', '2026-09-24T10:00:00Z'), ...log]
      return HttpResponse.json(log[0], { status: 201 })
    }),
  )
  return calls
}

afterEach(() => useAuthStore.getState().clearAuth())
const signInAs = (id: string) =>
  useAuthStore.getState().setAuth('token', { id, email: 'me@platform.example', role: 'super_admin', emailVerified: true, profileComplete: true })

describe('UserDetailPage', () => {
  it('shows the account, its score, and its moderation history with the recording admins named', async () => {
    signInAs('me')
    serve({
      score: { account_id: TARGET_ID, score: 42, updated_at: '2026-09-18T00:10:05Z' },
      history: [
        entry('m-2', 'suspend', 'Repeated false reports', 'me', '2026-09-22T10:00:00Z'),
        entry('m-1', 'warn', 'First warning', otherAdmin.id, '2026-09-20T10:00:00Z'),
      ],
    })
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'aisha@example.com' })).toBeInTheDocument()
    expect(screen.getByText(TARGET_ID)).toBeInTheDocument()
    expect(await screen.findByText('42')).toBeInTheDocument()
    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]).getByText(/You · 22 Sep 2026/)).toBeInTheDocument()
    expect(await within(items[1]).findByText(/other\.admin@platform\.example/)).toBeInTheDocument()
  })

  it('links the breadcrumb back to the list exactly as it was left', async () => {
    serve()
    renderPage()

    expect(await screen.findByRole('link', { name: /Users & Accounts/ })).toHaveAttribute('href', '/admin/users?role=user&page=3')
  })

  it('shows "Not scored yet" and an empty history for an account with neither', async () => {
    serve()
    renderPage()

    expect(await screen.findByText('Not scored yet')).toBeInTheDocument()
    expect(await screen.findByText(/No moderation actions have been recorded/)).toBeInTheDocument()
  })

  it('falls back to a short id for a recording admin that cannot be looked up', async () => {
    serve({ history: [entry('m-1', 'warn', 'Old', 'deadbeef-0000-4000-8000-000000000000', '2026-09-20T10:00:00Z')] })
    renderPage()

    expect(await screen.findByText(/Admin deadbeef/)).toBeInTheDocument()
  })

  describe('when the account cannot be shown', () => {
    it('says it was not found for an unknown id (404)', async () => {
      serve()
      renderPage('00000000-0000-0000-0000-000000000001')

      expect(await screen.findByRole('heading', { name: 'Account not found' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Back to Users/ })).toHaveAttribute('href', '/admin/users?role=user&page=3')
    })

    it('says it was not found for a malformed id in the URL (400), instead of a scary error', async () => {
      serve()
      server.use(http.get('*/admin/accounts/:id', () => HttpResponse.json({ error: 'invalid account id' }, { status: 400 })))
      renderPage('nope')

      expect(await screen.findByRole('heading', { name: 'Account not found' })).toBeInTheDocument()
    })

    it('shows a real load error with a retry that recovers', async () => {
      let failing = true
      serve()
      server.use(
        http.get('*/admin/accounts/:id', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(target))),
      )
      renderPage()

      expect(await screen.findByRole('alert')).toHaveTextContent('boom')
      failing = false
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByRole('heading', { level: 1, name: 'aisha@example.com' })).toBeInTheDocument()
    })
  })

  describe('when one of the other reads fails', () => {
    it("only that card shows the error — the account and the rest of the page are fine", async () => {
      serve()
      server.use(http.get('*/accounts/:id/trust-score', () => HttpResponse.json({ error: 'trust is down' }, { status: 500 })))
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: 'aisha@example.com' })).toBeInTheDocument()
      expect(await screen.findByText('trust is down')).toBeInTheDocument()
      expect(await screen.findByText(/No moderation actions have been recorded/)).toBeInTheDocument()
    })

    it('a failed history shows an error in its card with a retry that recovers', async () => {
      let failing = true
      serve()
      server.use(
        http.get('*/admin/accounts/:id/moderation-actions', () =>
          failing ? HttpResponse.json({ error: 'log is down' }, { status: 500 }) : HttpResponse.json([]),
        ),
      )
      renderPage()

      expect(await screen.findByText('log is down')).toBeInTheDocument()
      failing = false
      const card = screen.getByRole('region', { name: 'Moderation history' })
      await userEvent.click(within(card).getByRole('button', { name: 'Try again' }))

      expect(await screen.findByText(/No moderation actions have been recorded/)).toBeInTheDocument()
    })
  })

  describe('suspending and reactivating', () => {
    it('suspends with a reason: the header flips, the reason lands in the history, and a notice says so', async () => {
      signInAs('me')
      const calls = serve()
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Suspend account' }))
      await userEvent.type(screen.getByLabelText('Reason'), 'Repeated false reports')
      await userEvent.click(screen.getByRole('button', { name: 'Suspend account', hidden: false }))

      expect(await screen.findByText('aisha@example.com was suspended.')).toBeInTheDocument()
      expect(calls.patch).toEqual([{ action: 'suspend' }])
      expect(calls.post).toEqual([{ action_type: 'suspend', reason: 'Repeated false reports' }])
      const header = screen.getByRole('heading', { level: 1 }).closest('div')?.parentElement as HTMLElement
      expect(await within(header).findByText('Suspended')).toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Reactivate account' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Suspend account' })).not.toBeInTheDocument()
      const history = await screen.findAllByRole('listitem')
      expect(within(history[0]).getByText('Suspend')).toBeInTheDocument()
      expect(within(history[0]).getByText(/Repeated false reports/)).toBeInTheDocument()
    })

    it('offers Reactivate (not Suspend) for a suspended account', async () => {
      serve({ account: { ...target, status: 'suspended' } })
      renderPage()

      expect(await screen.findByRole('button', { name: 'Reactivate account' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Suspend account' })).not.toBeInTheDocument()
    })
  })

  describe("the caller's own account", () => {
    it('has no status buttons and no log button, and says why', async () => {
      signInAs(TARGET_ID)
      serve()
      renderPage()

      expect(await screen.findByText('You')).toBeInTheDocument()
      expect(screen.getByText(/your own account/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Suspend|Reactivate/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Log moderation action' })).not.toBeInTheDocument()
    })
  })

  describe('logging a moderation action', () => {
    it('records the type and reason, refreshes the history, and does NOT change the status', async () => {
      signInAs('me')
      const calls = serve()
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Log moderation action' }))
      await userEvent.selectOptions(screen.getByLabelText('Action'), 'Block')
      await userEvent.type(screen.getByLabelText('Reason'), 'Scam reports')
      await userEvent.click(screen.getByRole('button', { name: 'Log action' }))

      expect(await screen.findByText("Recorded a block in this account's history.")).toBeInTheDocument()
      expect(calls.post).toEqual([{ action_type: 'block', reason: 'Scam reports' }])
      expect(calls.patch).toEqual([])
      const items = await screen.findAllByRole('listitem')
      expect(within(items[0]).getByText('Block')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Suspend account' })).toBeInTheDocument()
    })

    it("keeps the dialog open with the server's message when it is refused", async () => {
      signInAs('me')
      serve()
      server.use(
        http.post('*/admin/accounts/:id/moderation-actions', () =>
          HttpResponse.json({ error: 'target account not found' }, { status: 404 }),
        ),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Log moderation action' }))
      await userEvent.type(screen.getByLabelText('Reason'), 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Log action' }))

      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('target account not found')
    })

    it('reopens with the defaults, not the last entry', async () => {
      signInAs('me')
      serve()
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Log moderation action' }))
      await userEvent.selectOptions(screen.getByLabelText('Action'), 'Unblock')
      await userEvent.type(screen.getByLabelText('Reason'), 'leftover')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await userEvent.click(screen.getByRole('button', { name: 'Log moderation action' }))

      expect(screen.getByLabelText('Action')).toHaveDisplayValue('Warn')
      expect(screen.getByLabelText('Reason')).toHaveValue('')
    })
  })
})

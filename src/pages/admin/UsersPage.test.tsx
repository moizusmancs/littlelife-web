import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { AccountStatus, AccountSummary } from '@/api/identity'
import type { Role } from '@/store/auth'
import { useAuthStore } from '@/store/auth'
import { UsersPage } from './UsersPage'

function LocationProbe() {
  return <div data-testid="search">{useLocation().search}</div>
}

function renderPage(initial = '/admin/users') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/admin/users" element={<><UsersPage /><LocationProbe /></>} />
          <Route path="/admin/users/:id" element={<div>detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function account(id: string, email: string, role: Role = 'user', status: AccountStatus = 'active'): AccountSummary {
  return { id, email, role, status, email_verified: true, created_at: '2026-09-20T06:44:36Z', updated_at: '2026-09-20T06:44:36Z' }
}

/** 250 generated citizens plus a few known accounts at the top (the API is newest first). */
const known = [
  account('me', 'me@platform.example', 'super_admin'),
  account('vol-1', 'vera@ngo.example.org', 'ngo_volunteer'),
  account('sus-1', 'sam@example.com', 'user', 'suspended'),
  account('pend-1', 'pat@example.com', 'user', 'pending_verification'),
]
const generated = Array.from({ length: 246 }, (_, i) => account(`gen-${i}`, `citizen${i}@example.com`))

function serve(initial: AccountSummary[] = [...known, ...generated]) {
  let all = initial
  const calls = { list: 0, patch: [] as Array<{ id: string; body: unknown }>, moderation: [] as Array<{ id: string; body: unknown }> }
  server.use(
    http.get('*/admin/accounts', ({ request }) => {
      calls.list += 1
      const url = new URL(request.url)
      const limit = Number(url.searchParams.get('limit'))
      const offset = Number(url.searchParams.get('offset'))
      return HttpResponse.json({ accounts: all.slice(offset, offset + limit), total: all.length, limit, offset })
    }),
    http.patch('*/admin/accounts/:id/status', async ({ params, request }) => {
      const body = (await request.json()) as { action: string }
      calls.patch.push({ id: params.id as string, body })
      const target = all.find((a) => a.id === params.id)
      if (!target) return HttpResponse.json({ error: 'account not found' }, { status: 404 })
      const next = body.action === 'suspend' ? 'suspended' : 'active'
      if (target.status === next) {
        return HttpResponse.json({ error: next === 'suspended' ? 'account already suspended' : 'account already active' }, { status: 409 })
      }
      const updated = { ...target, status: next as AccountStatus }
      all = all.map((a) => (a.id === updated.id ? updated : a))
      return HttpResponse.json(updated)
    }),
    http.post('*/admin/accounts/:id/moderation-actions', async ({ params, request }) => {
      calls.moderation.push({ id: params.id as string, body: await request.json() })
      return HttpResponse.json({ id: 'm-1' }, { status: 201 })
    }),
  )
  return { calls, setAll: (next: AccountSummary[]) => (all = next) }
}

afterEach(() => useAuthStore.getState().clearAuth())

const signInAs = (id: string) =>
  useAuthStore.getState().setAuth('token', { id, email: 'me@platform.example', role: 'super_admin', emailVerified: true, profileComplete: true })

describe('UsersPage', () => {
  it('loads every account across pages, shows the first page and a role breakdown', async () => {
    const { calls } = serve()
    renderPage()

    expect(await screen.findByText('me@platform.example')).toBeInTheDocument()
    expect(screen.getByText(/250 accounts · 248 citizens · 1 NGO staff · 1 admins/)).toBeInTheDocument()
    expect(screen.getByText('1–20 of 250')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    expect(calls.list).toBe(3)
  })

  it('shows a load failure with a retry that recovers', async () => {
    let failing = true
    server.use(
      http.get('*/admin/accounts', () =>
        failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json({ accounts: [known[0]], total: 1, limit: 100, offset: 0 }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('me@platform.example')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('search and filters', () => {
    it('searches every account, not just the visible page, and updates the total', async () => {
      serve()
      renderPage()
      await screen.findByText('me@platform.example')

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'citizen245')

      expect(await screen.findByText('citizen245@example.com')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByText('1–1 of 1')).toBeInTheDocument()
    })

    it('filters by role, and by status, and they combine with search', async () => {
      serve()
      renderPage()
      await screen.findByText('me@platform.example')

      await userEvent.click(screen.getByRole('button', { name: 'NGO volunteer' }))
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByText('vera@ngo.example.org')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'All' }))
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'Suspended')
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByText('sam@example.com')).toBeInTheDocument()

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'nobody')
      expect(await screen.findByRole('heading', { name: 'No accounts match' })).toBeInTheDocument()
    })

    it('applies two changes made in the same tick — neither undoes the other (React Router updaters see the last render)', async () => {
      serve()
      renderPage()
      await screen.findByText('me@platform.example')

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Citizen' }))
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search accounts' }), { target: { value: 'citizen1' } })
      })

      expect(screen.getByRole('button', { name: 'Citizen' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('searchbox', { name: 'Search accounts' })).toHaveValue('citizen1')
      await waitFor(() => {
        const search = screen.getByTestId('search').textContent ?? ''
        expect(search).toContain('role=user')
        expect(search).toContain('q=citizen1')
      })
    })

    it('"Clear search and filters" brings the list back', async () => {
      serve()
      renderPage()
      await screen.findByText('me@platform.example')
      await userEvent.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'zzzz')

      await userEvent.click(await screen.findByRole('button', { name: 'Clear search and filters' }))

      expect(await screen.findByText('me@platform.example')).toBeInTheDocument()
      expect(screen.getByRole('searchbox', { name: 'Search accounts' })).toHaveValue('')
      expect(screen.getByTestId('search')).toHaveTextContent('')
    })

    it('reads role, status, page and size from the URL, so a reload or a Back lands on the same view', async () => {
      serve()
      renderPage('/admin/users?role=user&status=active&page=2&size=50')

      expect(await screen.findByText('51–100 of 246')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Citizen' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('combobox', { name: 'Filter by status' })).toHaveDisplayValue('Active')
      expect(screen.getAllByRole('listitem')).toHaveLength(50)
    })

    it('ignores nonsense in the URL and clamps a page past the end', async () => {
      serve()
      renderPage('/admin/users?role=wizard&status=nope&page=999&size=7')

      expect(await screen.findByText('241–250 of 250')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('paging', () => {
    it('steps through pages and mirrors the page in the URL; a filter change returns to page 1', async () => {
      serve()
      renderPage()
      await screen.findByText('me@platform.example')

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      expect(await screen.findByText('21–40 of 250')).toBeInTheDocument()
      expect(screen.getByTestId('search')).toHaveTextContent('page=2')
      expect(screen.queryByText('me@platform.example')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Citizen' }))
      expect(await screen.findByText('1–20 of 248')).toBeInTheDocument()
      expect(screen.getByTestId('search')).not.toHaveTextContent('page=')
    })
  })

  describe('suspending and reactivating', () => {
    it("marks the caller's own row and gives it no status button", async () => {
      signInAs('me')
      serve()
      renderPage()

      const row = (await screen.findByText('me@platform.example')).closest('li') as HTMLElement
      expect(within(row).getByText('You')).toBeInTheDocument()
      expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    })

    it('suspends after a reason: changes the status, then saves the reason to the moderation log, without refetching the list', async () => {
      const { calls } = serve()
      renderPage('/admin/users?role=user')
      await screen.findByText('citizen0@example.com')
      const listCallsBefore = calls.list

      await userEvent.click(screen.getByRole('button', { name: 'Suspend citizen0@example.com' }))
      await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))
      expect(await screen.findByText('Enter a reason')).toBeInTheDocument()
      expect(calls.patch).toHaveLength(0)

      await userEvent.type(screen.getByLabelText('Reason'), 'Repeated false reports')
      await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))

      expect(await screen.findByText('citizen0@example.com was suspended.')).toBeInTheDocument()
      expect(calls.patch).toEqual([{ id: 'gen-0', body: { action: 'suspend' } }])
      expect(calls.moderation).toEqual([{ id: 'gen-0', body: { action_type: 'suspend', reason: 'Repeated false reports' } }])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const row = screen.getByText('citizen0@example.com', { selector: 'span' }).closest('li') as HTMLElement
      expect(within(row).getByText('Suspended')).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Reactivate citizen0@example.com' })).toBeInTheDocument()
      expect(calls.list).toBe(listCallsBefore)
    })

    it('reactivates a suspended account, logging an unblock', async () => {
      const { calls } = serve()
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Reactivate sam@example.com' }))
      await userEvent.type(screen.getByLabelText('Reason'), 'Reviewed and cleared')
      await userEvent.click(screen.getByRole('button', { name: 'Reactivate account' }))

      expect(await screen.findByText('sam@example.com was reactivated.')).toBeInTheDocument()
      expect(calls.patch).toEqual([{ id: 'sus-1', body: { action: 'reactivate' } }])
      expect(calls.moderation).toEqual([{ id: 'sus-1', body: { action_type: 'unblock', reason: 'Reviewed and cleared' } }])
    })

    it('reports a failed log entry honestly: the account WAS changed, and the notice says how to record it', async () => {
      serve()
      server.use(
        http.post('*/admin/accounts/:id/moderation-actions', () => HttpResponse.json({ error: 'reason is required' }, { status: 400 })),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Suspend vera@ngo.example.org' }))
      await userEvent.type(screen.getByLabelText('Reason'), 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))

      const notice = await screen.findByText(/vera@ngo\.example\.org was suspended, but the moderation log entry couldn't be saved \(reason is required\)/)
      expect(notice).toBeInTheDocument()
      const row = screen.getByText('vera@ngo.example.org', { selector: 'span' }).closest('li') as HTMLElement
      expect(within(row).getByText('Suspended')).toBeInTheDocument()
    })

    it('treats a 409 as "already in that state", not a failure: says so, logs nothing, and refreshes', async () => {
      const { calls, setAll } = serve()
      renderPage()
      await screen.findByRole('button', { name: 'Suspend pat@example.com' })

      // pat shows as pending verification, but was suspended on the server behind the page's back.
      setAll(known.map((a) => (a.id === 'pend-1' ? { ...a, status: 'suspended' as const } : a)).concat(generated))
      const listCallsBefore = calls.list
      await userEvent.click(screen.getByRole('button', { name: 'Suspend pat@example.com' }))
      await userEvent.type(screen.getByLabelText('Reason'), 'Scam')
      await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))

      expect(await screen.findByText(/pat@example\.com was already suspended, so nothing changed/)).toBeInTheDocument()
      expect(calls.moderation).toHaveLength(0)
      await waitFor(() => expect(calls.list).toBeGreaterThan(listCallsBefore))
      const row = await screen.findByText('pat@example.com', { selector: 'span' })
      expect(within(row.closest('li') as HTMLElement).getByText('Suspended')).toBeInTheDocument()
    })

    it("keeps the dialog open with the server's message when the change is refused, and changes nothing", async () => {
      serve()
      server.use(http.patch('*/admin/accounts/:id/status', () => HttpResponse.json({ error: 'account not found' }, { status: 404 })))
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Suspend vera@ngo.example.org' }))
      await userEvent.type(screen.getByLabelText('Reason'), 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))

      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('account not found')
    })

    it('reopens clean: no leftover reason or error from the last time', async () => {
      serve()
      server.use(http.patch('*/admin/accounts/:id/status', () => HttpResponse.json({ error: 'account not found' }, { status: 404 })))
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Suspend vera@ngo.example.org' }))
      await userEvent.type(screen.getByLabelText('Reason'), 'leftover')
      await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))
      await screen.findByRole('alert')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await userEvent.click(screen.getByRole('button', { name: 'Suspend vera@ngo.example.org' }))

      expect(screen.getByLabelText('Reason')).toHaveValue('')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('links View to the detail page', async () => {
    serve()
    renderPage()

    await userEvent.click(await screen.findByRole('link', { name: 'View vera@ngo.example.org' }))

    expect(await screen.findByText('detail page')).toBeInTheDocument()
  })
})

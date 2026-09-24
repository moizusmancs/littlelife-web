import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { AdminNgo } from '@/api/identity'
import { makeNgo } from '@/features/ngoDirectory/testNgo'
import { NgosPage } from './NgosPage'

function LocationProbe() {
  return <div data-testid="search">{useLocation().search}</div>
}

function renderPage(initial = '/admin/ngos') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/admin/ngos" element={<><NgosPage /><LocationProbe /></>} />
          <Route path="/admin/ngos/:id" element={<div>detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Two pending applications, a few decided ones, and 120 more active ones so it takes 2 pages to load. */
const known = [
  makeNgo('pend-1', 'Flood Relief Karachi', 'pending_approval', { created_by_email: 'founder1@example.com' }),
  makeNgo('pend-2', 'Sindh Response Network', 'pending_approval', { created_by_email: 'founder2@example.com' }),
  makeNgo('act-1', 'Indus Relief Foundation', 'active', { volunteer_count: 3, contact_email: 'contact@indus.example' }),
  makeNgo('rej-1', 'Rejected Rescue', 'rejected'),
  makeNgo('dea-1', 'Retired Aid', 'deactivated'),
]
const filler = Array.from({ length: 120 }, (_, i) => makeNgo(`fill-${i}`, `Filler Organisation ${i}`, 'active'))

function serve(initial: AdminNgo[] = [...known, ...filler]) {
  let all = initial
  const calls = { list: 0, decisions: [] as Array<{ id: string; decision: string }> }
  server.use(
    http.get('*/admin/ngos', ({ request }) => {
      calls.list += 1
      const url = new URL(request.url)
      const limit = Number(url.searchParams.get('limit'))
      const offset = Number(url.searchParams.get('offset'))
      return HttpResponse.json({ ngos: all.slice(offset, offset + limit), total: all.length, limit, offset })
    }),
    http.post('*/admin/ngos/:id/:decision', ({ params }) => {
      const id = params.id as string
      const decision = params.decision as string
      calls.decisions.push({ id, decision })
      const target = all.find((n) => n.id === id)
      if (!target) return HttpResponse.json({ error: 'ngo not found' }, { status: 404 })
      if (target.status !== 'pending_approval') {
        return HttpResponse.json({ error: 'ngo is not pending approval' }, { status: 409 })
      }
      all = all.map((n) => (n.id === id ? { ...n, status: decision === 'approve' ? 'active' : 'rejected' } : n))
      return HttpResponse.json({ message: decision === 'approve' ? 'ngo approved' : 'ngo rejected' })
    }),
  )
  return { calls, setAll: (next: AdminNgo[]) => (all = next) }
}

describe('NgosPage', () => {
  it('loads every page of organisations, opens on the pending tab, and counts what is waiting', async () => {
    const { calls } = serve()
    renderPage()

    expect(await screen.findByText('Flood Relief Karachi')).toBeInTheDocument()
    expect(screen.getByText('Sindh Response Network')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('125 organisations · 2 awaiting approval')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Pending approval/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /^Active/ })).toHaveTextContent('121')
    expect(calls.list).toBe(2)
  })

  it('shows a load failure with a retry that recovers', async () => {
    let failing = true
    server.use(
      http.get('*/admin/ngos', () =>
        failing
          ? HttpResponse.json({ error: 'boom' }, { status: 500 })
          : HttpResponse.json({ ngos: [known[0]], total: 1, limit: 100, offset: 0 }),
      ),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Flood Relief Karachi')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says nothing is waiting — not an error — when there are no pending applications', async () => {
    serve(known.filter((n) => n.status !== 'pending_approval'))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Nothing waiting for approval' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all organisations' }))
    expect(await screen.findByText('Indus Relief Foundation')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
  })

  describe('tabs and search', () => {
    it('switches tabs, and each shows only its status', async () => {
      serve()
      renderPage()
      await screen.findByText('Flood Relief Karachi')

      await userEvent.click(screen.getByRole('tab', { name: /Rejected/ }))
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByText('Rejected Rescue')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('tab', { name: /Deactivated/ }))
      expect(screen.getByText('Retired Aid')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('tab', { name: /Suspended/ }))
      expect(await screen.findByRole('heading', { name: 'No organisations here' })).toBeInTheDocument()
    })

    it('searches name, contact email and applicant email across every loaded organisation', async () => {
      serve()
      renderPage('/admin/ngos?tab=all')
      await screen.findByText('Flood Relief Karachi')
      const box = screen.getByRole('searchbox', { name: 'Search organisations' })

      await userEvent.type(box, 'indus')
      expect(await screen.findByText('Indus Relief Foundation')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(1)

      await userEvent.clear(box)
      await userEvent.type(box, 'founder2@')
      expect(await screen.findByText('Sindh Response Network')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(1)

      await userEvent.clear(box)
      await userEvent.type(box, 'contact@indus')
      expect(await screen.findByText('Indus Relief Foundation')).toBeInTheDocument()
    })

    it('says nothing matches a search, and "Clear search" restores the tab', async () => {
      serve()
      renderPage()
      await screen.findByText('Flood Relief Karachi')

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search organisations' }), 'zzzz')
      expect(await screen.findByRole('heading', { name: 'No organisations match' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))

      expect(await screen.findByText('Flood Relief Karachi')).toBeInTheDocument()
      expect(screen.getByRole('searchbox', { name: 'Search organisations' })).toHaveValue('')
    })

    it('mirrors the view in the URL, keeping the default pending tab out of it', async () => {
      serve()
      renderPage()
      await screen.findByText('Flood Relief Karachi')
      expect(screen.getByTestId('search')).toHaveTextContent('')

      await userEvent.click(screen.getByRole('tab', { name: /^Active/ }))
      await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('tab=active'))
      await userEvent.click(screen.getByRole('tab', { name: /Pending approval/ }))
      await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/))
    })

    it('reads tab, search, page and size from the URL, ignoring nonsense and clamping a page past the end', async () => {
      serve()
      renderPage('/admin/ngos?tab=active&page=2&size=50')
      expect(await screen.findByText('51–100 of 121')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(50)
    })

    it('ignores an unknown tab and clamps an out-of-range page', async () => {
      serve()
      renderPage('/admin/ngos?tab=wizard&page=999')
      expect(await screen.findByText('Flood Relief Karachi')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Pending approval/ })).toHaveAttribute('aria-selected', 'true')
    })

    it('applies two changes made in the same tick — neither undoes the other', async () => {
      serve()
      renderPage()
      await screen.findByText('Flood Relief Karachi')

      act(() => {
        fireEvent.click(screen.getByRole('tab', { name: /^Active/ }))
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search organisations' }), { target: { value: 'indus' } })
      })

      expect(screen.getByRole('tab', { name: /^Active/ })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('searchbox', { name: 'Search organisations' })).toHaveValue('indus')
      await waitFor(() => {
        const search = screen.getByTestId('search').textContent ?? ''
        expect(search).toContain('tab=active')
        expect(search).toContain('q=indus')
      })
    })

    it('pages a long tab and returns to page 1 when the tab changes', async () => {
      serve()
      renderPage('/admin/ngos?tab=active')
      await screen.findByText('1–20 of 121')

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      expect(await screen.findByText('21–40 of 121')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('tab', { name: /Rejected/ }))
      expect(await screen.findByText('1–1 of 1')).toBeInTheDocument()
    })
  })

  describe('approving and rejecting', () => {
    it('approves after confirmation: calls the API, says who was promoted, and the application leaves the pending tab', async () => {
      const { calls } = serve()
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Approve Flood Relief Karachi' }))
      expect(calls.decisions).toEqual([])
      await userEvent.click(screen.getByRole('button', { name: 'Approve organisation' }))

      expect(
        await screen.findByText(/Flood Relief Karachi was approved\. founder1@example\.com is now its NGO admin and needs to log in again/),
      ).toBeInTheDocument()
      expect(calls.decisions).toEqual([{ id: 'pend-1', decision: 'approve' }])
      await waitFor(() => expect(screen.queryByText('Flood Relief Karachi', { selector: 'p' })).not.toBeInTheDocument())
      expect(screen.getByText('125 organisations · 1 awaiting approval')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /^Active/ })).toHaveTextContent('122')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('rejects after confirmation and says the applicant can apply again', async () => {
      const { calls } = serve()
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Reject Sindh Response Network' }))
      await userEvent.click(screen.getByRole('button', { name: 'Reject application' }))

      expect(await screen.findByText(/Sindh Response Network was rejected\. founder2@example\.com can submit a new application/)).toBeInTheDocument()
      expect(calls.decisions).toEqual([{ id: 'pend-2', decision: 'reject' }])
      expect(screen.getByRole('tab', { name: /Rejected/ })).toHaveTextContent('2')
    })

    it('does nothing when the confirmation is cancelled', async () => {
      const { calls } = serve()
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Approve Flood Relief Karachi' }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(calls.decisions).toEqual([])
      expect(screen.getByText('Flood Relief Karachi')).toBeInTheDocument()
    })

    it("treats a 409 as \"couldn't\", quoting the server, closing the dialog and refreshing the list — not an in-dialog error", async () => {
      const { calls, setAll } = serve()
      renderPage()
      await screen.findByText('Flood Relief Karachi')
      // Someone else decided pend-1 behind the page's back.
      setAll([{ ...known[0], status: 'active' }, ...known.slice(1), ...filler])
      const listCallsBefore = calls.list

      await userEvent.click(screen.getByRole('button', { name: 'Approve Flood Relief Karachi' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve organisation' }))

      expect(
        await screen.findByText("Couldn't approve Flood Relief Karachi: ngo is not pending approval. The view has been refreshed."),
      ).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(calls.list).toBeGreaterThan(listCallsBefore))
      await waitFor(() => expect(screen.getByText('125 organisations · 1 awaiting approval')).toBeInTheDocument())
    })

    it('quotes the affiliation message too, since that is what approving an already-approved NGO really returns', async () => {
      serve()
      server.use(
        http.post('*/admin/ngos/:id/approve', () =>
          HttpResponse.json({ error: 'this account is already affiliated with an ngo' }, { status: 409 }),
        ),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Approve Flood Relief Karachi' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve organisation' }))

      expect(
        await screen.findByText("Couldn't approve Flood Relief Karachi: this account is already affiliated with an ngo. The view has been refreshed."),
      ).toBeInTheDocument()
    })

    it('keeps the dialog open with the server message for any other failure, and reopens clean', async () => {
      serve()
      server.use(http.post('*/admin/ngos/:id/approve', () => HttpResponse.json({ error: 'ngo not found' }, { status: 404 })))
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Approve Flood Relief Karachi' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve organisation' }))

      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('ngo not found')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve Flood Relief Karachi' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('links View to the detail page', async () => {
    serve()
    renderPage()

    await userEvent.click(await screen.findByRole('link', { name: 'View Flood Relief Karachi' }))

    expect(await screen.findByText('detail page')).toBeInTheDocument()
  })
})

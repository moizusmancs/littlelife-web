import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import type { AdminNgo, Volunteer } from '@/api/identity'
import { makeNgo } from '@/features/ngoDirectory/testNgo'
import { NgoDetailPage } from './NgoDetailPage'

const NGO_ID = '397674ec-1234-4abc-9def-0123456789ab'

function renderPage(id = NGO_ID, state: unknown = { listSearch: '?tab=all&page=2' }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/admin/ngos/${id}`, state }]}>
        <Routes>
          <Route path="/admin/ngos/:id" element={<NgoDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const pending = makeNgo(NGO_ID, 'Flood Relief Karachi', 'pending_approval', {
  contact_email: 'help@flood.example',
  created_by_id: 'creator-1',
  created_by_email: 'founder@example.com',
})
const roster: Volunteer[] = [
  { id: 'v-1', email: 'vera@example.com', status: 'active', created_at: '2026-09-20T06:44:36Z' },
]

function serve(ngo: AdminNgo = pending, volunteers: Volunteer[] = []) {
  let current = ngo
  const calls = { decisions: [] as string[] }
  server.use(
    http.get('*/admin/ngos/:id', ({ params }) =>
      params.id === current.id ? HttpResponse.json(current) : HttpResponse.json({ error: 'ngo not found' }, { status: 404 }),
    ),
    http.get('*/admin/ngos/:id/volunteers', () => HttpResponse.json(volunteers)),
    http.post('*/admin/ngos/:id/:decision', ({ params }) => {
      calls.decisions.push(params.decision as string)
      if (current.status !== 'pending_approval') return HttpResponse.json({ error: 'ngo is not pending approval' }, { status: 409 })
      current = {
        ...current,
        status: params.decision === 'approve' ? 'active' : 'rejected',
        approved_at: '2026-09-24T10:00:00Z',
        approved_by_email: 'admin@platform.example',
      }
      return HttpResponse.json({ message: 'ok' })
    }),
  )
  return { calls, setCurrent: (next: AdminNgo) => (current = next) }
}

describe('NgoDetailPage', () => {
  it('shows the organisation, its applicant, and its volunteer roster', async () => {
    serve({ ...pending, status: 'active', volunteer_count: 1 }, roster)
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Flood Relief Karachi' })).toBeInTheDocument()
    expect(screen.getByText(NGO_ID)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'founder@example.com' })).toHaveAttribute('href', '/admin/users/creator-1')
    expect(await screen.findByRole('link', { name: 'vera@example.com' })).toHaveAttribute('href', '/admin/users/v-1')
    expect(screen.getByRole('heading', { name: 'Volunteers · 1' })).toBeInTheDocument()
  })

  it('links the breadcrumb back to the list exactly as it was left', async () => {
    serve()
    renderPage()

    expect(await screen.findByRole('link', { name: 'NGOs' })).toHaveAttribute('href', '/admin/ngos?tab=all&page=2')
  })

  describe('when the organisation cannot be shown', () => {
    it('says not found for an unknown id (404) and for a malformed id (400)', async () => {
      serve()
      const { unmount } = renderPage('00000000-0000-0000-0000-000000000001')
      expect(await screen.findByRole('heading', { name: 'Organisation not found' })).toBeInTheDocument()
      unmount()

      server.use(http.get('*/admin/ngos/:id', () => HttpResponse.json({ error: 'invalid ngo id' }, { status: 400 })))
      renderPage('nope')
      expect(await screen.findByRole('heading', { name: 'Organisation not found' })).toBeInTheDocument()
    })

    it('shows a real load error with a retry that recovers', async () => {
      let failing = true
      serve()
      server.use(
        http.get('*/admin/ngos/:id', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(pending))),
      )
      renderPage()

      expect(await screen.findByRole('alert')).toHaveTextContent('boom')
      failing = false
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByRole('heading', { level: 1, name: 'Flood Relief Karachi' })).toBeInTheDocument()
    })
  })

  it('a failed roster shows an error in its own card and leaves the page alone, with a retry that recovers', async () => {
    let failing = true
    serve()
    server.use(
      http.get('*/admin/ngos/:id/volunteers', () =>
        failing ? HttpResponse.json({ error: 'roster down' }, { status: 500 }) : HttpResponse.json(roster),
      ),
    )
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Flood Relief Karachi' })).toBeInTheDocument()
    expect(await screen.findByText('roster down')).toBeInTheDocument()
    failing = false
    const card = screen.getByRole('region', { name: /Volunteers/ })
    await userEvent.click(within(card).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('link', { name: 'vera@example.com' })).toBeInTheDocument()
  })

  describe('deciding', () => {
    it('approves: the page refreshes to Active with the decision recorded, and the buttons go', async () => {
      const { calls } = serve()
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve organisation' }))

      expect(await screen.findByText(/Flood Relief Karachi was approved\. founder@example\.com is now its NGO admin/)).toBeInTheDocument()
      expect(calls.decisions).toEqual(['approve'])
      const card = screen.getByRole('region', { name: 'Organisation' })
      expect(await within(card).findByText('Approved', { selector: 'dt' })).toBeInTheDocument()
      expect(within(card).getByText('Approved', { selector: 'dt' }).nextSibling).toHaveTextContent('by admin@platform.example')
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument())
    })

    it('rejects: the page refreshes to Rejected and says the applicant can apply again', async () => {
      const { calls } = serve()
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
      await userEvent.click(screen.getByRole('button', { name: 'Reject application' }))

      expect(await screen.findByText(/was rejected\. founder@example\.com can submit a new application/)).toBeInTheDocument()
      expect(calls.decisions).toEqual(['reject'])
      const card = screen.getByRole('region', { name: 'Organisation' })
      expect(await within(card).findByText('Rejected', { selector: 'dt' })).toBeInTheDocument()
    })

    it('reports a 409 as "couldn\'t", quoting the server, and refreshes to what is really there', async () => {
      const { setCurrent } = serve()
      renderPage()
      await screen.findByRole('button', { name: 'Approve' })
      setCurrent({ ...pending, status: 'rejected' }) // decided elsewhere

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve organisation' }))

      expect(await screen.findByText(/Couldn't approve Flood Relief Karachi: ngo is not pending approval/)).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument())
    })
  })
})

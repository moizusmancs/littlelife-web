import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import type { SafetyConnection } from '@/api/trust'
import { LiveLocationContext } from '@/features/liveLocation/liveLocationContext'
import type { LiveLocationController } from '@/features/liveLocation/liveLocationController'
import { link, ME, PEOPLE } from '@/features/safetyGroups/fixtures'
import { SafetyGroupDetailPage } from './SafetyGroupDetailPage'
import { SafetyGroupsPage } from './SafetyGroupsPage'

/** Signs the test in as `ME` — the account every fixture connection is seen from. */
export function signInAsMe() {
  useAuthStore.getState().setAuth('token', { id: ME, email: 'me@example.com', role: 'user', emailVerified: true, profileComplete: true })
}

/**
 * A tiny in-memory stand-in for the safety-connections routes, so a page test can act (accept, remove,
 * invite) and then see the refetched list — the way the real backend behaves. `calls` records what was
 * sent, in order, for the assertions that matter ("no request was made").
 */
export function serveConnections(initial: SafetyConnection[]) {
  let rows = [...initial]
  const calls: Array<{ method: string; path: string; body?: unknown }> = []
  const answer = (id: string, update: (row: SafetyConnection) => SafetyConnection) => {
    const row = rows.find((c) => c.id === id)
    if (!row) return HttpResponse.json({ error: 'safety connection not found' }, { status: 404 })
    const next = update(row)
    rows = rows.map((c) => (c.id === id ? next : c))
    return HttpResponse.json(next)
  }

  server.use(
    http.get('*/safety-connections', () => HttpResponse.json(rows)),
    http.post('*/safety-connections', async ({ request }) => {
      const body = (await request.json()) as { recipient_email?: string; recipient_account_id?: string; connection_type: SafetyConnection['connection_type'] }
      calls.push({ method: 'POST', path: '/safety-connections', body })

      // The backend's own rules, in its own words (api/06-trust.md).
      const email = body.recipient_email?.trim().toLowerCase()
      const recipient = Object.entries(PEOPLE).find(([id, p]) => (email ? p.email === email : id === body.recipient_account_id))?.[0]
      if (!recipient) return HttpResponse.json({ error: 'recipient account not found' }, { status: 404 })
      if (recipient === ME) return HttpResponse.json({ error: 'cannot send a safety connection request to yourself' }, { status: 400 })
      const between = rows.filter((c) => [c.requester_account_id, c.recipient_account_id].includes(recipient))
      if (between.some((c) => c.status === 'accepted')) return HttpResponse.json({ error: 'you are already connected to this person' }, { status: 409 })
      const pending = between.find((c) => c.status === 'pending')
      if (pending) {
        return HttpResponse.json(
          { error: pending.requester_account_id === ME ? 'a pending connection request already exists between these two accounts' : 'this person has already sent you a request' },
          { status: 409 },
        )
      }

      // What the requester is shown of the recipient: nothing, until they accept.
      const created: SafetyConnection = { ...link(ME, recipient, 'pending', { id: `new-${rows.length}`, type: body.connection_type }), created_at: '2026-09-25T10:00:00Z' }
      rows = [created, ...rows]
      return HttpResponse.json(created, { status: 201 })
    }),
    http.patch('*/safety-connections/:id/accept', ({ params }) => {
      calls.push({ method: 'PATCH', path: `/safety-connections/${params.id}/accept` })
      return answer(String(params.id), (c) => ({ ...c, status: 'accepted', responded_at: '2026-09-25T10:05:00Z' }))
    }),
    http.patch('*/safety-connections/:id/decline', ({ params }) => {
      calls.push({ method: 'PATCH', path: `/safety-connections/${params.id}/decline` })
      return answer(String(params.id), (c) => ({ ...c, status: 'declined', responded_at: '2026-09-25T10:05:00Z' }))
    }),
    http.delete('*/safety-connections/:id', ({ params }) => {
      calls.push({ method: 'DELETE', path: `/safety-connections/${params.id}` })
      if (!rows.some((c) => c.id === params.id)) return HttpResponse.json({ error: 'safety connection not found' }, { status: 404 })
      rows = rows.filter((c) => c.id !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return { calls, setRows: (next: SafetyConnection[]) => (rows = next) }
}

/** Renders the list and detail routes together, starting at `path`, with a probe for where navigation ends up. */
export function renderSafetyGroups(path = '/app/safety-groups', state?: unknown, live?: LiveLocationController) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          {/* With a controller, it is where the real provider would be. */}
          <Route
            element={
              live ? (
                <LiveLocationContext.Provider value={live}>
                  <Outlet />
                </LiveLocationContext.Provider>
              ) : (
                <Outlet />
              )
            }
          >
            <Route path="/app/safety-groups" element={<SafetyGroupsPage />} />
            <Route path="/app/safety-groups/:id" element={<SafetyGroupDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

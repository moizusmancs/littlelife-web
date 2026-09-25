import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { ACTIVITY_TYPES, type ActivityEvent } from '@/api/profiling'
import { ActivityPage } from './ActivityPage'

function Where() {
  const location = useLocation()
  return <output data-testid="where">{location.pathname + location.search}</output>
}

function renderPage(path = '/app/profile/activity') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ActivityPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const votes = (count: number, start = 0): ActivityEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `incident_vote:${start + i}`,
    type: 'incident_vote',
    occurred_at: '2026-09-20T10:00:00Z',
    subject_id: 'r',
    detail: { vote_type: 'upvote' },
  }))

/** The real route's rules: a `type` filter applied before paging, `limit`/`offset`, newest first (the caller passes the events in order). */
function serveTimeline(all: ActivityEvent[]) {
  const requests: Array<{ type: string | null; limit: string | null; offset: string | null }> = []
  server.use(
    http.get('*/profile/activity-timeline', ({ request }) => {
      const url = new URL(request.url)
      const type = url.searchParams.get('type')
      const limit = Number(url.searchParams.get('limit') ?? 25)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      requests.push({ type, limit: url.searchParams.get('limit'), offset: url.searchParams.get('offset') })
      if (type && !(ACTIVITY_TYPES as readonly string[]).includes(type)) return HttpResponse.json({ error: 'type must be one of: …' }, { status: 400 })
      const matching = type ? all.filter((e) => e.type === type) : all
      return HttpResponse.json(matching.slice(offset, offset + limit))
    }),
  )
  return requests
}

const mixed: ActivityEvent[] = [
  { id: 'incident_report:1', type: 'incident_report', occurred_at: '2026-09-25T09:00:00Z', subject_id: 'r1', detail: { category: 'flooding', status: 'reported' } },
  { id: 'donation:2', type: 'donation', occurred_at: '2026-09-24T09:00:00Z', subject_id: 'c1', detail: { amount: 2500, status: 'collected' } },
  { id: 'status_report:3', type: 'status_report', occurred_at: '2026-09-23T09:00:00Z', subject_id: 's1', detail: { status: 'closed', place_type: 'shelter' } },
]

describe('ActivityPage', () => {
  it('shows the account’s activity as sentences, from the first page', async () => {
    const requests = serveTimeline(mixed)
    renderPage()

    expect(await screen.findByText('You reported flooding')).toBeInTheDocument()
    expect(screen.getByText('You donated 2,500')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'You reported a shelter as closed' })).toHaveAttribute('href', '/app/map/shelters/s1')
    expect(requests[0]).toEqual({ type: null, limit: '25', offset: '0' })
  })

  it('shows an empty state — not an error — for an account with no activity', async () => {
    serveTimeline([])
    renderPage()

    expect(await screen.findByText('No activity yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('skips a kind of event it does not know, leaving the rest', async () => {
    serveTimeline([{ id: 'message:9', type: 'message', occurred_at: '2026-09-25T10:00:00Z', subject_id: 'm', detail: {} }, ...mixed])
    renderPage()

    expect(await screen.findByText('You reported flooding')).toBeInTheDocument()
    expect(screen.queryByText(/message/i)).not.toBeInTheDocument()
  })

  describe('filtering', () => {
    it('asks the server for just that kind, and keeps the choice in the URL', async () => {
      const requests = serveTimeline(mixed)
      renderPage()
      await screen.findByText('You reported flooding')

      await userEvent.click(screen.getByRole('button', { name: 'Donations' }))

      expect(await screen.findByText('You donated 2,500')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByText('You reported flooding')).not.toBeInTheDocument())
      expect(requests.at(-1)).toEqual({ type: 'donation', limit: '25', offset: '0' })
      expect(screen.getByTestId('where')).toHaveTextContent('/app/profile/activity?show=donation')
      expect(screen.getByRole('button', { name: 'Donations' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('starts from the kind in the URL', async () => {
      const requests = serveTimeline(mixed)
      renderPage('/app/profile/activity?show=status_report')

      expect(await screen.findByText('You reported a shelter as closed')).toBeInTheDocument()
      expect(requests[0].type).toBe('status_report')
    })

    it('treats an unknown kind in the URL as All — and tidies the URL', async () => {
      const requests = serveTimeline(mixed)
      renderPage('/app/profile/activity?show=nonsense')

      expect(await screen.findByText('You reported flooding')).toBeInTheDocument()
      expect(requests[0].type).toBeNull()
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/profile\/activity$/))
    })

    it('says which kind is empty when a filter matches nothing', async () => {
      serveTimeline(mixed)
      renderPage()
      await screen.findByText('You reported flooding')

      await userEvent.click(screen.getByRole('button', { name: 'Sightings' }))

      expect(await screen.findByText('No sightings yet')).toBeInTheDocument()
    })
  })

  describe('load more', () => {
    it('asks for the next page by offset — the number already held — and stops at a short page', async () => {
      const requests = serveTimeline(votes(60))
      renderPage()
      await screen.findAllByText('You upvoted an incident report')
      expect(screen.getAllByText('You upvoted an incident report')).toHaveLength(25)

      await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
      await waitFor(() => expect(screen.getAllByText('You upvoted an incident report')).toHaveLength(50))
      expect(requests.at(-1)).toEqual({ type: null, limit: '25', offset: '25' })

      await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
      await waitFor(() => expect(screen.getAllByText('You upvoted an incident report')).toHaveLength(60))
      expect(requests.at(-1)).toEqual({ type: null, limit: '25', offset: '50' })
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument() // 10 < 25: the last page
    })

    it('after a full page that turns out to be the last, one more request finds nothing and the button goes', async () => {
      const requests = serveTimeline(votes(25))
      renderPage()
      await screen.findAllByText('You upvoted an incident report')

      await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

      await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument())
      expect(requests.at(-1)?.offset).toBe('25')
      expect(screen.getAllByText('You upvoted an incident report')).toHaveLength(25)
    })

    it('shows each event once even when the next page starts with one already shown (something new arrived meanwhile)', async () => {
      const first = votes(25)
      let calls = 0
      server.use(
        http.get('*/profile/activity-timeline', ({ request }) => {
          const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0)
          calls += 1
          // The second page repeats the last line of the first, as it would if a new event pushed everything down by one.
          return HttpResponse.json(offset === 0 ? first : [first[24], ...votes(3, 100)])
        }),
      )
      renderPage()
      await screen.findAllByText('You upvoted an incident report')

      await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

      await waitFor(() => expect(screen.getAllByText('You upvoted an incident report')).toHaveLength(28)) // 25 + 3, not 25 + 4
      expect(calls).toBe(2)
    })

    it("keeps the list when a later page fails, and Try again gets it", async () => {
      let failing = false
      const all = votes(30)
      server.use(
        http.get('*/profile/activity-timeline', ({ request }) => {
          const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0)
          if (offset > 0 && failing) return HttpResponse.json({ error: 'boom' }, { status: 500 })
          return HttpResponse.json(all.slice(offset, offset + 25))
        }),
      )
      renderPage()
      await screen.findAllByText('You upvoted an incident report')

      failing = true
      await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('boom')
      expect(screen.getAllByText('You upvoted an incident report')).toHaveLength(25)

      failing = false
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(screen.getAllByText('You upvoted an incident report')).toHaveLength(30))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('shows a first-page failure with a retry, and recovers when the retry succeeds', async () => {
    let failing = true
    server.use(
      http.get('*/profile/activity-timeline', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(mixed))),
      http.post('*/auth/refresh', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument()
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('You reported flooding')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Filter activity' })).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })
})

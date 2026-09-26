import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hoursAgo, serveCommunity } from '@/features/community/communityTestKit'
import { ME, makeMedia, makeReport } from '@/features/community/fixtures'
import { useAuthStore } from '@/store/auth'
import { CommunityPage } from './CommunityPage'
import { IncidentDetailPage } from './IncidentDetailPage'

// Real Leaflet isn't needed to test the page: the map is a slot, stood in by its label and position.
vi.mock('@/features/community/IncidentLocationMap', () => ({
  IncidentLocationMap: ({ position, label }: { position: [number, number]; label: string }) => <div role="group" aria-label={label} data-position={position.join(',')} />,
}))

type Entry = string | { pathname: string; state?: unknown }

function renderAt(entry: Entry) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/community" element={<CommunityPage />} />
          <Route path="/app/community/:incidentId" element={<IncidentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const stubLocation = (impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) => {
  const getCurrentPosition = vi.fn(impl)
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

beforeEach(() => useAuthStore.getState().setAuth('token', { id: ME, email: 'hina@example.com', role: 'user', emailVerified: true, profileComplete: true }))
afterEach(() => {
  useAuthStore.getState().clearAuth()
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
})

const flood = makeReport({
  id: 'flood',
  description: 'River over the embankment near the bypass.',
  location: { type: 'Point', coordinates: [68.86, 27.7] },
  status: 'verified',
  verified_at: hoursAgo(0.5),
  created_at: hoursAgo(1),
})
const road = makeReport({ id: 'road', category: 'blocked_road', created_at: hoursAgo(2), description: 'Fallen tree on Bunder Road' })
const rejected = makeReport({ id: 'rejected', status: 'rejected', description: 'Duplicate' })

describe('IncidentDetailPage — finding the report', () => {
  it('a direct link reads that one report — never the nationwide list — and shows it with its media and progress', async () => {
    const { calls } = serveCommunity({ reports: [flood, road], media: { flood: [makeMedia({ id: 'p1', incident_report_id: 'flood' })] } })
    renderAt('/app/community/flood')
    expect(screen.getByLabelText('Loading the report')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Flooding' })).toBeInTheDocument()
    expect(screen.getByText('River over the embankment near the bypass.')).toBeInTheDocument()
    expect(calls.one).toEqual(['flood'])
    expect(calls.reports).toEqual([])
    await waitFor(() => expect(screen.getByRole('img', { name: /Photo 1 from this report/ })).toBeInTheDocument())
    expect(calls.media).toEqual(['flood'])
    expect(screen.getByRole('group', { name: 'Map of where this flooding report was made' })).toHaveAttribute('data-position', '27.7,68.86')
    expect(screen.getByText('27.7000° N, 68.8600° E')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('link', { name: 'Back to community' })).toHaveAttribute('href', '/app/community')
  })

  it('an unknown id (the server’s 404) and a malformed one (its 400) are both "not found", asked once each — not retried', async () => {
    const { calls } = serveCommunity({ reports: [flood] })
    const { unmount } = renderAt('/app/community/00000000-0000-0000-0000-000000000001')
    expect(await screen.findByRole('heading', { name: 'Report not found' })).toBeInTheDocument()
    unmount()
    renderAt('/app/community/not-a-uuid')
    expect(await screen.findByRole('heading', { name: 'Report not found' })).toBeInTheDocument()
    expect(calls.one).toEqual(['00000000-0000-0000-0000-000000000001', 'not-a-uuid'])
  })

  it('a rejected report says so instead of showing its content', async () => {
    const { calls } = serveCommunity({ reports: [rejected] })
    renderAt('/app/community/rejected')
    expect(await screen.findByRole('heading', { name: 'This report was rejected' })).toBeInTheDocument()
    expect(screen.queryByText('Duplicate')).not.toBeInTheDocument()
    expect(calls.media).toEqual([])
  })

  it('a failed read shows the server’s words and recovers on retry', async () => {
    const { state } = serveCommunity({ reports: [flood], failOne: true })
    renderAt('/app/community/flood')
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this report: database unavailable")
    state.failOne = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Flooding' })).toBeInTheDocument()
  })

  it('a failed media list is contained to its card, with a retry', async () => {
    const { state } = serveCommunity({ reports: [flood], media: { flood: [makeMedia({ incident_report_id: 'flood' })] }, failMedia: true })
    renderAt('/app/community/flood')
    expect(await screen.findByText("Couldn't load this report's photos and videos.")).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Flooding' })).toBeInTheDocument()
    state.failMedia = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('img', { name: /Photo 1 from this report/ })).toBeInTheDocument()
  })
})

describe('IncidentDetailPage — from the feed and back', () => {
  it('a card opens its report from the feed’s copy — no request for the list or the report — and Back returns to the same filtered view', async () => {
    const { calls } = serveCommunity({ reports: [flood, road], homeRegionId: 'sukkur-city' })
    renderAt('/app/community?tab=verified')
    const card = await screen.findByRole('article', { name: 'Flooding reported by a community member' })
    await userEvent.click(within(card).getByRole('link', { name: 'View details' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Flooding' })).toBeInTheDocument()
    expect(calls.reports).toHaveLength(1)
    expect(calls.one).toEqual([])
    const back = screen.getByRole('link', { name: 'Back to community' })
    expect(back).toHaveAttribute('href', '/app/community?tab=verified')
    await userEvent.click(back)
    expect(await screen.findByRole('tab', { name: 'Verified' })).toHaveAttribute('aria-selected', 'true')
  })

  it('Back ignores router state that isn’t a feed address', async () => {
    serveCommunity({ reports: [flood] })
    renderAt({ pathname: '/app/community/flood', state: { from: 'https://elsewhere.example' } })
    expect(await screen.findByRole('link', { name: 'Back to community' })).toHaveAttribute('href', '/app/community')
  })
})

describe('IncidentDetailPage — voting and distance', () => {
  it('votes with the large buttons — the same votes and rules as the feed', async () => {
    const { calls, votes, state } = serveCommunity({ reports: [flood], myVotes: { flood: 'downvote' } })
    let release = () => {}
    state.gate = new Promise<void>((resolve) => (release = resolve))
    renderAt('/app/community/flood')
    const down = await screen.findByRole('button', { name: 'Downvote' })
    await waitFor(() => expect(down).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(screen.getByRole('button', { name: 'Upvote' }))
    // Shown on this page before the server has answered (the request is held).
    expect(screen.getByRole('group', { name: '4 upvotes, 0 downvotes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'true')
    release()
    await waitFor(() => expect(votes).toEqual({ flood: 'upvote' }))
    expect(calls.votes).toEqual(['POST flood upvote'])
    // Once the vote lands, this report is read again — and only this report: the nationwide list is never asked for.
    await waitFor(() => expect(calls.one).toEqual(['flood', 'flood']))
    expect(calls.reports).toEqual([])
    expect(screen.getByRole('group', { name: '4 upvotes, 0 downvotes' })).toBeInTheDocument()
  })

  it('asks for the viewer’s position only when pressed, then says how far away the report is', async () => {
    serveCommunity({ reports: [flood] })
    const getCurrentPosition = stubLocation((ok) => ok({ coords: { latitude: 27.7, longitude: 68.87 } } as GeolocationPosition))
    renderAt('/app/community/flood')
    const button = await screen.findByRole('button', { name: 'Show distance from me' })
    expect(getCurrentPosition).not.toHaveBeenCalled()
    await userEvent.click(button)
    expect(await screen.findByText(/from you$/)).toHaveTextContent('980 m from you')
  })
})

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import { ME, makeMedia, makeReport, makeUpdate } from '@/features/community/fixtures'
import { hoursAgo, serveCommunity } from '@/features/community/communityTestKit'
import { useAuthStore } from '@/store/auth'
import { CommunityPage } from './CommunityPage'

const serve = serveCommunity

let currentUrl = ''
function UrlSpy() {
  const location = useLocation()
  useEffect(() => {
    currentUrl = location.pathname + location.search
  }, [location])
  return null
}

function renderPage(path = '/app/community') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <CommunityPage />
        <UrlSpy />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const cards = () => within(screen.getByRole('list', { name: 'Reports and updates' })).getAllByRole('article').map((article) => article.getAttribute('aria-labelledby'))
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

const flood = makeReport({ id: 'flood', category: 'flooding', created_at: hoursAgo(1), description: 'River over the embankment' })
const road = makeReport({ id: 'road', category: 'blocked_road', status: 'verified', created_at: hoursAgo(3), description: 'Fallen tree on Bunder Road' })
const mine = makeReport({ id: 'mine', reporter_account_id: ME, category: 'other_hazard', created_at: hoursAgo(5), description: 'Live wire in the water' })
const rejected = makeReport({ id: 'rejected', status: 'rejected', created_at: hoursAgo(0.5), description: 'Duplicate of another report' })
const homeUpdate = makeUpdate({ id: 'home-update', region_id: 'sukkur-city', title: 'Tankers on Main Bazaar', created_at: hoursAgo(2) })
const everyone = makeUpdate({ id: 'everyone', region_id: undefined, title: 'Flood season advisory', created_at: hoursAgo(4) })
const sindhOnly = makeUpdate({ id: 'sindh-only', region_id: 'sindh', title: 'Sindh-only notice', created_at: hoursAgo(4.5) })

describe('CommunityPage — Latest', () => {
  it('asks for every report by a world bbox, mixes in the home region’s updates, newest first, and hides the rejected one', async () => {
    const { calls } = serve({ reports: [rejected, flood, road, mine], updates: { 'sukkur-city': [homeUpdate, everyone] }, homeRegionId: 'sukkur-city' })
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Community' })).toBeInTheDocument()
    await waitFor(() => expect(cards()).toEqual(['report-flood-title', 'update-home-update-title', 'report-road-title', 'update-everyone-title', 'report-mine-title']))
    expect(calls.reports).toEqual(['?bbox=-180,-90,180,90'])
    expect(calls.updates).toEqual(['sukkur-city'])
    expect(screen.queryByText('Duplicate of another report')).not.toBeInTheDocument()
    expect(screen.getByText("1 report was rejected by moderators and isn't shown.")).toBeInTheDocument()
    expect(screen.getByText('For Sukkur City')).toBeInTheDocument()
    expect(screen.getByText('For Everyone')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Other hazard reported by you' })).toBeInTheDocument()
    expect(screen.queryByText(/Set your home region/)).not.toBeInTheDocument()
  })

  it('asks for the media of the cards on screen only, and shows the photo', async () => {
    const { calls } = serve({ reports: [flood, road], media: { flood: [makeMedia({ incident_report_id: 'flood' })] }, homeRegionId: 'sukkur-city' })
    renderPage()
    await waitFor(() => expect(screen.getByRole('img', { name: 'Photo attached to this report' })).toBeInTheDocument())
    expect(calls.media.sort()).toEqual(['flood', 'road'])
    expect(calls.media).not.toContain('rejected')
  })

  it('shows twelve cards at a time, asking for the next cards’ media only when they are shown', async () => {
    const many = Array.from({ length: 15 }, (_, i) => makeReport({ id: `r${i}`, created_at: hoursAgo(i + 1) }))
    const { calls } = serve({ reports: many, homeRegionId: 'sukkur-city' })
    renderPage()
    await waitFor(() => expect(cards()).toHaveLength(12))
    await waitFor(() => expect(calls.media).toHaveLength(12))
    await userEvent.click(screen.getByRole('button', { name: 'Show more (3 more)' }))
    expect(cards()).toHaveLength(15)
    await waitFor(() => expect(calls.media).toHaveLength(15))
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })

  it('without a home region shows only the platform-wide updates, and says how to see the area’s', async () => {
    const { calls } = serve({ reports: [flood], updates: { sindh: [sindhOnly, everyone] } })
    renderPage()
    await waitFor(() => expect(cards()).toEqual(['report-flood-title', 'update-everyone-title']))
    expect(calls.updates).toEqual(['sindh'])
    expect(screen.queryByText('Sindh-only notice')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set your home region' })).toHaveAttribute('href', '/app/profile/edit')
  })

  it('with no regions at all asks for no updates and still lists the reports', async () => {
    const { calls } = serve({ reports: [flood], regions: [] })
    renderPage()
    await waitFor(() => expect(cards()).toEqual(['report-flood-title']))
    expect(calls.updates).toEqual([])
  })

  it('says so when nobody has reported anything', async () => {
    serve({ reports: [], homeRegionId: 'sukkur-city' })
    renderPage()
    expect(await screen.findByText('Nobody has reported anything yet.')).toBeInTheDocument()
    expect(screen.queryByText(/rejected by moderators/)).not.toBeInTheDocument()
  })
})

describe('CommunityPage — failures', () => {
  it('shows the server’s words when the list fails, and recovers on retry', async () => {
    const { state } = serve({ reports: [flood], failReports: true, homeRegionId: 'sukkur-city' })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load community reports: database unavailable")
    state.failReports = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cards()).toEqual(['report-flood-title']))
  })

  it('keeps the reports when the updates fail, and says so', async () => {
    serve({ reports: [flood], failUpdates: true, homeRegionId: 'sukkur-city' })
    renderPage()
    await waitFor(() => expect(cards()).toEqual(['report-flood-title']))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load official updates: region_id must be a valid uuid")
  })
})

describe('CommunityPage — tabs, filters and the URL', () => {
  it('Verified shows only confirmed reports and no updates, and lives in the URL', async () => {
    serve({ reports: [flood, road, mine], updates: { 'sukkur-city': [homeUpdate] }, homeRegionId: 'sukkur-city' })
    renderPage()
    await waitFor(() => expect(cards()).toHaveLength(4))
    await userEvent.click(screen.getByRole('tab', { name: 'Verified' }))
    expect(screen.getByRole('tab', { name: 'Verified' })).toHaveAttribute('aria-selected', 'true')
    expect(cards()).toEqual(['report-road-title'])
    await waitFor(() => expect(currentUrl).toBe('/app/community?tab=verified'))
  })

  it('reads the view from the URL, and treats unknown values as the default', async () => {
    serve({ reports: [flood, road, mine], homeRegionId: 'sukkur-city' })
    renderPage('/app/community?tab=latest&category=blocked_road&q=tree')
    await waitFor(() => expect(cards()).toEqual(['report-road-title']))
    expect(screen.getByRole('searchbox', { name: 'Search reports' })).toHaveValue('tree')
    expect(screen.getByRole('button', { name: 'Blocked road 1' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(currentUrl).toBe('/app/community?category=blocked_road&q=tree'))
  })

  it('an unknown tab or category in the URL falls back to Latest and All', async () => {
    serve({ reports: [flood], homeRegionId: 'sukkur-city' })
    renderPage('/app/community?tab=gossip&category=fire')
    await waitFor(() => expect(cards()).toEqual(['report-flood-title']))
    expect(screen.getByRole('tab', { name: 'Latest' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(currentUrl).toBe('/app/community'))
  })

  it('a category hides the updates (they have none) and counts within the search', async () => {
    serve({ reports: [flood, road, mine], updates: { 'sukkur-city': [homeUpdate] }, homeRegionId: 'sukkur-city' })
    renderPage()
    await waitFor(() => expect(cards()).toHaveLength(4))
    await userEvent.click(screen.getByRole('button', { name: 'Flooding 1' }))
    expect(cards()).toEqual(['report-flood-title'])
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search reports' }), 'tree')
    expect(screen.getByRole('button', { name: 'Blocked road 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Flooding 0' })).toBeInTheDocument()
    expect(screen.getByText('No reports match your search and filters.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(cards()).toHaveLength(4)
    await waitFor(() => expect(currentUrl).toBe('/app/community'))
  })

  it('keeps both of two changes made in the same tick', async () => {
    serve({ reports: [flood, road], homeRegionId: 'sukkur-city' })
    renderPage()
    await waitFor(() => expect(cards()).toHaveLength(2))
    act(() => {
      screen.getByRole('button', { name: 'Blocked road 1' }).click()
      screen.getByRole('tab', { name: 'Verified' }).click()
    })
    await waitFor(() => expect(currentUrl).toBe('/app/community?tab=verified&category=blocked_road'))
    expect(cards()).toEqual(['report-road-title'])
  })

  it('Q&A is "Coming soon", with no search or list', async () => {
    serve({ reports: [flood], homeRegionId: 'sukkur-city' })
    renderPage('/app/community?tab=qa')
    expect(await screen.findByRole('heading', { name: 'Questions and answers' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Reports and updates' })).not.toBeInTheDocument()
  })
})

describe('CommunityPage — Nearby', () => {
  const near = makeReport({ id: 'near', location: { type: 'Point', coordinates: [68.0, 27.0] }, created_at: hoursAgo(9) })
  const far = makeReport({ id: 'far', location: { type: 'Point', coordinates: [70.0, 27.0] }, created_at: hoursAgo(1) })

  it('asks for nothing until pressed, then lists nearest first with each distance', async () => {
    serve({ reports: [far, near], homeRegionId: 'sukkur-city' })
    const getCurrentPosition = stubLocation((ok) => ok({ coords: { latitude: 27.0, longitude: 68.01 } } as GeolocationPosition))
    renderPage('/app/community?tab=nearby')
    const button = await screen.findByRole('button', { name: 'Use my location' })
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'Reports and updates' })).not.toBeInTheDocument()
    // Counts per category mean nothing before there is a position — no "All 0".
    expect(screen.queryByRole('group', { name: 'Category' })).not.toBeInTheDocument()
    await userEvent.click(button)
    await waitFor(() => expect(cards()).toEqual(['report-near-title', 'report-far-title']))
    expect(screen.getByText('990 m away')).toBeInTheDocument()
    expect(screen.getByText('197 km away')).toBeInTheDocument()
    expect(screen.getByText('Nearest to you first')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All 2' })).toBeInTheDocument()
  })

  it('explains a blocked location and lists nothing', async () => {
    serve({ reports: [near], homeRegionId: 'sukkur-city' })
    stubLocation((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError))
    renderPage('/app/community?tab=nearby')
    await userEvent.click(await screen.findByRole('button', { name: 'Use my location' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Location is blocked for this site')
    expect(screen.queryByRole('list', { name: 'Reports and updates' })).not.toBeInTheDocument()
  })
})

describe('CommunityPage — voting', () => {
  const report = makeReport({ id: 'flood', upvote_count: 3, downvote_count: 1, created_at: hoursAgo(1) })
  const card = () => screen.getByRole('article', { name: 'Flooding reported by a community member' })
  const button = (name: 'Upvote' | 'Downvote') => within(card()).getByRole('button', { name })
  const totals = () => within(card()).getByRole('group').getAttribute('aria-label')

  it('shows the viewer’s vote from my-votes as pressed', async () => {
    const { calls } = serve({ reports: [report], homeRegionId: 'sukkur-city', myVotes: { flood: 'downvote' } })
    renderPage()
    await waitFor(() => expect(button('Downvote')).toHaveAttribute('aria-pressed', 'true'))
    expect(button('Upvote')).toHaveAttribute('aria-pressed', 'false')
    expect(calls.myVotes).toBe(1)
  })

  it('shows plain totals — nothing to press — until the votes have loaded', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    serve({ reports: [report], homeRegionId: 'sukkur-city' })
    server.use(http.get('*/incident-reports/my-votes', async () => { await held; return HttpResponse.json([]) }))
    renderPage()
    await waitFor(() => expect(within(card()).getByRole('img', { name: '3 upvotes, 1 downvote' })).toBeInTheDocument())
    expect(within(card()).queryByRole('button')).not.toBeInTheDocument()
    release()
    await waitFor(() => expect(button('Upvote')).toHaveAttribute('aria-pressed', 'false'))
  })

  it('an upvote shows at once — pressed and counted before the server answers — then stays after it does', async () => {
    const { calls, state, votes } = serve({ reports: [report], homeRegionId: 'sukkur-city' })
    let release = () => {}
    state.gate = new Promise<void>((resolve) => (release = resolve))
    renderPage()
    await waitFor(() => expect(button('Upvote')).toBeInTheDocument())
    await userEvent.click(button('Upvote'))
    expect(button('Upvote')).toHaveAttribute('aria-pressed', 'true')
    expect(totals()).toBe('4 upvotes, 1 downvote')
    expect(calls.votes).toEqual(['POST flood upvote'])
    const listReads = calls.reports.length
    release()
    await waitFor(() => expect(votes).toEqual({ flood: 'upvote' }))
    // Once the last press lands, the list and the votes are read again, and they agree with what was shown.
    await waitFor(() => expect(calls.reports.length).toBe(listReads + 1))
    expect(button('Upvote')).toHaveAttribute('aria-pressed', 'true')
    expect(totals()).toBe('4 upvotes, 1 downvote')
  })

  it('pressing the chosen side takes the vote back (DELETE); pressing the other side switches it (POST)', async () => {
    const { calls, votes } = serve({ reports: [report], homeRegionId: 'sukkur-city', myVotes: { flood: 'upvote' } })
    renderPage()
    await waitFor(() => expect(button('Upvote')).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(button('Downvote'))
    expect(totals()).toBe('2 upvotes, 2 downvotes')
    await waitFor(() => expect(votes).toEqual({ flood: 'downvote' }))
    await userEvent.click(button('Downvote'))
    expect(button('Downvote')).toHaveAttribute('aria-pressed', 'false')
    expect(totals()).toBe('2 upvotes, 1 downvote')
    await waitFor(() => expect(votes).toEqual({}))
    expect(calls.votes).toEqual(['POST flood downvote', 'DELETE flood'])
  })

  it('two quick presses are sent in order and end where the second left it', async () => {
    const { calls, state, votes, reports } = serve({ reports: [report], homeRegionId: 'sukkur-city' })
    let release = () => {}
    state.gate = new Promise<void>((resolve) => (release = resolve))
    renderPage()
    await waitFor(() => expect(button('Upvote')).toBeInTheDocument())
    await userEvent.click(button('Upvote'))
    await userEvent.click(button('Upvote'))
    // The second press is measured from the first's result: it takes the vote back.
    expect(button('Upvote')).toHaveAttribute('aria-pressed', 'false')
    expect(totals()).toBe('3 upvotes, 1 downvote')
    release()
    await waitFor(() => expect(calls.votes).toEqual(['POST flood upvote', 'DELETE flood']))
    await waitFor(() => expect(votes).toEqual({}))
    expect(reports[0].upvote_count).toBe(3)
    await waitFor(() => expect(totals()).toBe('3 upvotes, 1 downvote'))
  })

  it('a refused vote puts the truth back and says why in the server’s words', async () => {
    const { state } = serve({ reports: [report], homeRegionId: 'sukkur-city' })
    state.refuse = { status: 400, error: 'vote_type must be one of: upvote, downvote' }
    renderPage()
    await waitFor(() => expect(button('Upvote')).toBeInTheDocument())
    await userEvent.click(button('Upvote'))
    expect(await screen.findByText('Your vote wasn’t saved: vote_type must be one of: upvote, downvote')).toBeInTheDocument()
    await waitFor(() => expect(button('Upvote')).toHaveAttribute('aria-pressed', 'false'))
    expect(totals()).toBe('3 upvotes, 1 downvote')
  })

  it('a vote on a report that has gone (404) says so and refreshes the feed', async () => {
    const { calls, state } = serve({ reports: [report], homeRegionId: 'sukkur-city' })
    state.refuse = { status: 404, error: 'incident report not found' }
    renderPage()
    await waitFor(() => expect(button('Upvote')).toBeInTheDocument())
    const listReads = calls.reports.length
    await userEvent.click(button('Upvote'))
    expect(await screen.findByText(/That report is no longer available, so your vote wasn’t counted/)).toBeInTheDocument()
    await waitFor(() => expect(calls.reports.length).toBe(listReads + 1))
  })

  it('when the votes can’t be loaded, voting is off with the server’s words and a retry', async () => {
    const { state } = serve({ reports: [report], homeRegionId: 'sukkur-city', failMyVotes: true })
    renderPage()
    expect(await screen.findByText("Couldn't load your votes, so voting is off for now: database unavailable")).toBeInTheDocument()
    await waitFor(() => expect(within(card()).getByRole('img', { name: '3 upvotes, 1 downvote' })).toBeInTheDocument())
    expect(within(card()).queryByRole('button')).not.toBeInTheDocument()
    state.failMyVotes = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(button('Upvote')).toHaveAttribute('aria-pressed', 'false'))
  })
})

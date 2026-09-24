import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import type { EssentialLocation, Shelter } from '@/api/facilities'
import type { Region } from '@/api/geo'
import { makeEssential, makeShelter } from '@/features/map/testMap'
import { makeRegion } from '@/features/regions/testRegion'
import { ResourcesPage } from './ResourcesPage'

const box = (west: number, south: number, east: number, north: number) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] })
const sindh = makeRegion('sindh', 'Sindh', 'province', undefined, { boundary: box(67, 26, 70, 28) })
const sukkur = makeRegion('sukkur', 'Sukkur', 'district', 'sindh', { boundary: box(68, 27, 69, 28) })
const punjab = makeRegion('punjab', 'Punjab', 'province', undefined, { boundary: box(70, 30, 75, 34) })
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

interface Options {
  regions?: Region[]
  homeRegionId?: string
  shelters?: Record<string, Shelter[]>
  essentials?: Record<string, EssentialLocation[]>
  failEssentials?: boolean
  reportStatus?: number
}

function serve(options: Options = {}) {
  const calls = { shelters: [] as string[], essentials: [] as string[], reports: [] as Array<{ id: string; status: string }> }
  const essentials = { ...(options.essentials ?? {}) }
  server.use(
    http.get('*/regions', () => HttpResponse.json(options.regions ?? [sindh, sukkur, punjab])),
    http.get('*/profile', () => (options.homeRegionId ? HttpResponse.json({ id: 'p', name: 'A', home_region_id: options.homeRegionId, created_at: '', updated_at: '' }) : HttpResponse.json({ error: 'profile not found' }, { status: 404 }))),
    http.get('*/shelters', ({ request }) => {
      const id = new URL(request.url).searchParams.get('region_id') ?? ''
      calls.shelters.push(id)
      return HttpResponse.json(options.shelters?.[id] ?? [])
    }),
    http.get('*/essential-locations', ({ request }) => {
      const id = new URL(request.url).searchParams.get('region_id') ?? ''
      calls.essentials.push(id)
      if (options.failEssentials) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      return HttpResponse.json(essentials[id] ?? [])
    }),
    http.post('*/essential-locations/:id/status-reports', async ({ params, request }) => {
      const body = (await request.json()) as { status: 'open' | 'closed' }
      calls.reports.push({ id: String(params.id), status: body.status })
      if (options.reportStatus && options.reportStatus !== 201) return HttpResponse.json({ error: 'essential location not found' }, { status: options.reportStatus })
      // The server's list now says what was last reported.
      for (const list of Object.values(essentials)) for (const place of list) if (place.id === params.id) Object.assign(place, { current_status: body.status, status_reported_at: new Date().toISOString() })
      return HttpResponse.json({ id: 'r1', essential_location_id: params.id, status: body.status, created_at: new Date().toISOString() }, { status: 201 })
    }),
  )
  return calls
}

function renderPage(path = '/app/resources') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ResourcesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const shelters = { sindh: [makeShelter('s1', 'GBHS Johi', { location: { type: 'Point', coordinates: [68.86, 27.7] }, capacity_current: 210, capacity_total: 400 })], punjab: [makeShelter('s2', 'Lahore Hall')] }
const essentials = {
  sindh: [
    makeEssential('e1', 'Corner Pharmacy', { type: 'pharmacy', location: { type: 'Point', coordinates: [68.88, 27.72] }, current_status: 'open', status_reported_at: minutesAgo(5) }),
    makeEssential('e2', 'Sukkur Grocery', { type: 'grocery_store', location: { type: 'Point', coordinates: [68.5, 27.4] } }),
    makeEssential('e3', 'City ATM', { type: 'atm', location: { type: 'Point', coordinates: [68.95, 27.9] }, current_status: 'closed', status_reported_at: minutesAgo(90) }),
  ],
  punjab: [makeEssential('e4', 'Lahore Pharmacy', { type: 'pharmacy', location: { type: 'Point', coordinates: [73, 31] } })],
}
const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
const stubLocation = (impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) => {
  const getCurrentPosition = vi.fn(impl)
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}
afterEach(() => Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true }))

describe('ResourcesPage — the tab shell', () => {
  it('opens on Local resources, and shows the placeholder — with its tab selected — for one that isn’t built', async () => {
    serve()
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Resources' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Local resources' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Aid requests' }))
    expect(screen.getByRole('tab', { name: 'Aid requests' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Not built yet — ships in Phase 6.')).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'resources-tab-aid')
    await userEvent.click(screen.getByRole('tab', { name: 'Local resources' }))
    expect(screen.queryByText('Not built yet — ships in Phase 6.')).not.toBeInTheDocument()
  })

  it('reads the tab from the URL, in either spelling of Missing persons, and falls back to Local', () => {
    serve()
    const first = renderPage('/app/resources?tab=campaigns')
    expect(screen.getByRole('tab', { name: 'Campaigns' })).toHaveAttribute('aria-selected', 'true')
    first.unmount()
    const second = renderPage('/app/resources?tab=missing-persons')
    expect(screen.getByRole('tab', { name: 'Missing persons' })).toHaveAttribute('aria-selected', 'true')
    second.unmount()
    renderPage('/app/resources?tab=bogus')
    expect(screen.getByRole('tab', { name: 'Local resources' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Local resources — what is listed', () => {
  it('asks for nothing until the profile and regions have answered, then lists the home region’s shelters and shops only', async () => {
    const calls = serve({ shelters: { sukkur: shelters.sindh }, essentials: { sukkur: essentials.sindh }, homeRegionId: 'sukkur' })
    renderPage()
    expect(await screen.findByText('Corner Pharmacy')).toBeInTheDocument()
    expect(calls.shelters).toEqual(['sukkur'])
    expect(calls.essentials).toEqual(['sukkur'])
    expect(screen.getByRole('button', { name: 'Sukkur' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lists shelters and essential locations together by name, and never infrastructure', async () => {
    serve({ shelters: { sukkur: shelters.sindh }, essentials: { sukkur: essentials.sindh }, homeRegionId: 'sukkur' })
    renderPage()
    await screen.findByText('Corner Pharmacy')
    expect(names()).toEqual(['City ATM', 'Corner Pharmacy', 'GBHS Johi', 'Sukkur Grocery'])
  })

  it('shows Everywhere on request — every top-level region — and back to the home region again', async () => {
    const calls = serve({ shelters, essentials, homeRegionId: 'sukkur' })
    renderPage()
    await screen.findByRole('button', { name: 'Sukkur' })
    await userEvent.click(screen.getByRole('button', { name: 'Everywhere' }))
    expect(await screen.findByText('Lahore Pharmacy')).toBeInTheDocument()
    expect(screen.getByText('Lahore Hall')).toBeInTheDocument()
    expect(calls.shelters.sort()).toEqual(['punjab', 'sindh', 'sukkur'])
    await userEvent.click(screen.getByRole('button', { name: 'Sukkur' }))
    await waitFor(() => expect(screen.queryByText('Lahore Pharmacy')).not.toBeInTheDocument())
  })

  it('with no home region, lists everywhere and says how to set one', async () => {
    serve({ shelters, essentials })
    renderPage()
    expect(await screen.findByText('Lahore Pharmacy')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Everywhere' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set your home region' })).toHaveAttribute('href', '/app/profile/edit')
  })

  it('filters by kind, with the counts on the chips, and says when a kind has nothing', async () => {
    serve({ shelters: { sukkur: shelters.sindh }, essentials: { sukkur: essentials.sindh }, homeRegionId: 'sukkur' })
    renderPage()
    await screen.findByText('Corner Pharmacy')
    const chips = screen.getByRole('group', { name: 'Kind of place' })
    expect(within(chips).getByRole('button', { name: /^All/ })).toHaveTextContent('All4')
    expect(within(chips).getByRole('button', { name: /^Pharmacies/ })).toHaveTextContent('Pharmacies1')
    await userEvent.click(within(chips).getByRole('button', { name: /^Pharmacies/ }))
    expect(names()).toEqual(['Corner Pharmacy'])
    await userEvent.click(within(chips).getByRole('button', { name: /^Shelters/ }))
    expect(names()).toEqual(['GBHS Johi'])
  })

  it('says so when a region has nothing listed, and when a kind is empty', async () => {
    serve({ shelters: { sukkur: shelters.sindh }, essentials: {}, homeRegionId: 'sukkur' })
    renderPage()
    await screen.findByText('GBHS Johi')
    await userEvent.click(screen.getByRole('button', { name: /^ATMs/ }))
    expect(screen.getByText('No atms are listed here.')).toBeInTheDocument()
  })

  it('says the region has nothing when it is entirely empty', async () => {
    serve({ homeRegionId: 'sukkur' })
    renderPage()
    expect(await screen.findByText('No shelters or shops are listed in Sukkur yet.')).toBeInTheDocument()
  })

  it('says no regions exist when there are none, without asking for any place', async () => {
    const calls = serve({ regions: [] })
    renderPage()
    expect(await screen.findByText(/No regions have been set up yet/)).toBeInTheDocument()
    expect(calls.shelters).toEqual([])
  })

  it('shows 25 at a time with "Show more"', async () => {
    const many = Array.from({ length: 30 }, (_, i) => makeEssential(`m${i}`, `Shop ${String(i).padStart(2, '0')}`, { type: 'grocery_store' }))
    serve({ essentials: { sukkur: many }, homeRegionId: 'sukkur' })
    renderPage()
    await screen.findByText('Shop 00')
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
    await userEvent.click(screen.getByRole('button', { name: 'Show more (5 more)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(30)
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })

  it('shows a failed request as an alert with a retry, keeping what did load', async () => {
    const calls = serve({ shelters: { sukkur: shelters.sindh }, failEssentials: true, homeRegionId: 'sukkur' })
    renderPage()
    expect(await screen.findByText("Couldn't load some places.")).toBeInTheDocument()
    expect(screen.getByText('GBHS Johi')).toBeInTheDocument()
    const before = calls.essentials.length
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(calls.essentials.length).toBeGreaterThan(before))
  })

  it('shows failed regions with a retry that recovers', async () => {
    server.use(http.get('*/regions', () => HttpResponse.json({ error: 'boom' }, { status: 500 })), http.get('*/profile', () => HttpResponse.json({ error: 'x' }, { status: 404 })))
    renderPage()
    expect(await screen.findByText("Couldn't load the regions that places are found by.")).toBeInTheDocument()
    serve({ shelters, essentials })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('GBHS Johi')).toBeInTheDocument()
  })
})

describe('Local resources — nearest first', () => {
  it('asks for the position only when pressed, then sorts nearest first and shows each distance', async () => {
    serve({ shelters: { sukkur: shelters.sindh }, essentials: { sukkur: essentials.sindh }, homeRegionId: 'sukkur' })
    const getCurrentPosition = stubLocation((ok) => ok({ coords: { latitude: 27.9, longitude: 68.95 } } as GeolocationPosition))
    renderPage()
    await screen.findByText('Corner Pharmacy')
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(names()[0]).toBe('City ATM') // by name

    await userEvent.click(screen.getByRole('button', { name: 'Nearest first' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Nearest first' })).not.toBeInTheDocument())
    expect(screen.getByText('Nearest first')).toBeInTheDocument()
    expect(names()).toEqual(['City ATM', 'Corner Pharmacy', 'GBHS Johi', 'Sukkur Grocery'])
    expect(screen.getAllByText(/km away|m away/).length).toBe(4)
  })

  it('explains a blocked location in terms of the order, and leaves the list as it was', async () => {
    serve({ shelters: { sukkur: shelters.sindh }, essentials: { sukkur: essentials.sindh }, homeRegionId: 'sukkur' })
    stubLocation((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError))
    renderPage()
    await screen.findByText('Corner Pharmacy')
    await userEvent.click(screen.getByRole('button', { name: 'Nearest first' }))
    expect(await screen.findByText(/to put the nearest places first/)).toBeInTheDocument()
    expect(names()[0]).toBe('City ATM')
  })
})

describe('Local resources — telling everyone a place is open or closed', () => {
  it('sends the report, thanks the visitor, asks for the list again, and shows what the server now says', async () => {
    const calls = serve({ shelters: { sukkur: shelters.sindh }, essentials: { sukkur: structuredClone(essentials.sindh) }, homeRegionId: 'sukkur' })
    renderPage()
    await screen.findByText('Corner Pharmacy')
    const before = calls.essentials.length
    await userEvent.click(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' }))
    await waitFor(() => expect(calls.reports).toEqual([{ id: 'e1', status: 'closed' }]))
    expect(await screen.findByText('Thanks — Corner Pharmacy is now shown as closed.')).toBeInTheDocument()
    await waitFor(() => expect(calls.essentials.length).toBeGreaterThan(before))
    const row = screen.getByText('Corner Pharmacy').closest('li') as HTMLElement
    await waitFor(() => expect(within(row).getByText('Closed')).toBeInTheDocument())
    expect(within(row).queryByRole('button', { name: 'Mark Corner Pharmacy as closed' })).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Mark Corner Pharmacy as open' })).toBeInTheDocument()
  })

  it('for a place nobody has reported, either report can be sent', async () => {
    const calls = serve({ essentials: { sukkur: structuredClone(essentials.sindh) }, homeRegionId: 'sukkur' })
    renderPage()
    await screen.findByText('Sukkur Grocery')
    await userEvent.click(screen.getByRole('button', { name: 'Mark Sukkur Grocery as open' }))
    await waitFor(() => expect(calls.reports).toEqual([{ id: 'e2', status: 'open' }]))
  })

  it('says a place that no longer exists wasn’t reported, and refreshes the list', async () => {
    const calls = serve({ essentials: { sukkur: structuredClone(essentials.sindh) }, homeRegionId: 'sukkur', reportStatus: 404 })
    renderPage()
    await screen.findByText('Corner Pharmacy')
    const before = calls.essentials.length
    await userEvent.click(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' }))
    expect(await screen.findByText(/no longer listed, so your report wasn't sent/)).toBeInTheDocument()
    await waitFor(() => expect(calls.essentials.length).toBeGreaterThan(before))
  })

  it('shows any other refusal in the notice and keeps the buttons usable', async () => {
    serve({ essentials: { sukkur: structuredClone(essentials.sindh) }, homeRegionId: 'sukkur', reportStatus: 500 })
    renderPage()
    await screen.findByText('Corner Pharmacy')
    await userEvent.click(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' }))
    expect(await screen.findByText(/Couldn't send your report about Corner Pharmacy/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' })).toBeEnabled()
  })

  it('lets the notice be dismissed', async () => {
    serve({ essentials: { sukkur: structuredClone(essentials.sindh) }, homeRegionId: 'sukkur' })
    renderPage()
    await screen.findByText('Corner Pharmacy')
    await userEvent.click(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Thanks — /)).not.toBeInTheDocument()
  })
})

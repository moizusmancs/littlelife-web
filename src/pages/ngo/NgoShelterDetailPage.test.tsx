import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore, type Role } from '@/store/auth'
import type { Region } from '@/api/geo'
import type { Shelter } from '@/api/facilities'
import type { MapCanvasProps } from '@/features/map/MapCanvas'
import { makeShelter } from '@/features/map/testMap'
import { NgoShelterDetailPage } from './NgoShelterDetailPage'

// The real canvas needs a layout jsdom lacks (and has its own tests); the stub records what the page hands it.
vi.mock('@/features/map/MapCanvas', async () => {
  const { useEffect } = await import('react')
  return {
    MapCanvas: (props: MapCanvasProps) => {
      const { onViewportChange } = props
      useEffect(() => onViewportChange({ west: 68.7, south: 27.6, east: 69.0, north: 27.8 }), [onViewportChange])
      return (
        <div data-testid="canvas">
          <output data-testid="places">{props.places.map((p) => p.name).join('|')}</output>
        </div>
      )
    },
  }
})

const NGO = 'ngo-1'
const mine = makeShelter('s1', 'GBHS Johi', {
  location: { type: 'Point', coordinates: [68.858, 27.706] },
  capacity_total: 400,
  capacity_current: 265,
  certification_status: 'pending',
  managed_by_ngo_id: NGO,
  updated_at: new Date(Date.now() - 2 * 60_000).toISOString(),
})
const theirs: Shelter = { ...mine, id: 's9', name: 'Other Group Camp', managed_by_ngo_id: 'ngo-2' }

const square = (west: number, south: number, east: number, north: number) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] })
const sindh: Region = { id: 'r1', name: 'Sindh', level: 'province', boundary: square(66, 24, 71, 29), created_at: '', updated_at: '' }

function serve(options: { shelter?: Shelter; fail?: { status: number; body: Record<string, string> }; ngo?: 'fail' | { id: string }; occupancyError?: { status: number; error: string }; regions?: Region[] } = {}) {
  let current = options.shelter ?? mine
  const calls = { occupancy: [] as unknown[], patched: [] as unknown[], overlay: 0 }
  server.use(
    http.get('*/shelters/:id', () => (options.fail ? HttpResponse.json(options.fail.body, { status: options.fail.status }) : HttpResponse.json(current))),
    http.get('*/ngo/me', () =>
      options.ngo === 'fail'
        ? HttpResponse.json({ error: 'boom' }, { status: 500 })
        : HttpResponse.json({ id: options.ngo?.id ?? NGO, name: 'Flood Relief', status: 'active', created_at: '', updated_at: '' }),
    ),
    http.get('*/map/flood-overlay', () => ((calls.overlay += 1), HttpResponse.json([]))),
    http.get('*/regions', () => HttpResponse.json(options.regions ?? [sindh])),
    http.patch('*/shelters/:id/occupancy', async ({ request }) => {
      const body = (await request.json()) as { capacity_current: number }
      calls.occupancy.push(body)
      if (options.occupancyError) return HttpResponse.json({ error: options.occupancyError.error }, { status: options.occupancyError.status })
      current = { ...current, capacity_current: body.capacity_current }
      return HttpResponse.json(current)
    }),
    http.patch('*/shelters/:id', async ({ request }) => {
      const body = (await request.json()) as Partial<Shelter>
      calls.patched.push(body)
      current = { ...current, ...body }
      return HttpResponse.json(current)
    }),
    http.post('*/auth/refresh', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
  )
  return calls
}

function signIn(role: Role = 'ngo_admin') {
  useAuthStore.getState().setAuth('token', { id: 'a1', email: 'admin@ngo.org', role, emailVerified: true, profileComplete: true })
}

function renderPage(entry: string | { pathname: string; state: unknown } = '/ngo/shelters/s1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/ngo/shelters/:id" element={<NgoShelterDetailPage />} />
          <Route path="/ngo/shelters" element={<p>the shelters list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('NgoShelterDetailPage', () => {
  afterEach(() => useAuthStore.getState().clearAuth())

  it('reads the shelter named in the URL and shows its name, badges, occupancy and details — with who manages it', async () => {
    serve()
    signIn()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })).toBeInTheDocument()
    expect(screen.getByText('Pending certification', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Occupancy' })).toHaveTextContent('Capacity 265 / 400')
    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getByText('Managed by').nextElementSibling).toHaveTextContent('Your organisation')
    expect(screen.getByTestId('places')).toHaveTextContent('GBHS Johi')
  })

  it('goes back to the list at the view it came from', async () => {
    serve()
    signIn()
    renderPage({ pathname: '/ngo/shelters/s1', state: { listSearch: '?show=full' } })
    expect(await screen.findByRole('link', { name: 'Back to shelters' })).toHaveAttribute('href', '/ngo/shelters?show=full')
  })

  it('says whether citizens will see it: in a region, or — when outside every region — that they will not', async () => {
    serve()
    signIn()
    const { unmount } = renderPage()
    expect(await screen.findByText(/citizens looking at that region will see it/)).toHaveTextContent('In Sindh')
    unmount()

    serve({ shelter: { ...mine, location: { type: 'Point', coordinates: [72.3, 18.3] } } })
    renderPage()
    expect(await screen.findByText(/isn't inside any region/)).toBeInTheDocument()
  })

  it('updates occupancy from the card and shows the new number', async () => {
    const calls = serve()
    signIn()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })

    await userEvent.click(screen.getByRole('button', { name: 'Update occupancy' }))
    const field = screen.getByRole('textbox', { name: 'People currently at GBHS Johi' })
    expect(field).toHaveValue('265')
    await userEvent.clear(field)
    await userEvent.type(field, '300')
    await userEvent.click(screen.getByRole('button', { name: 'Save occupancy' }))

    expect(await screen.findByText('Occupancy at GBHS Johi is now 300 / 400.')).toBeInTheDocument()
    expect(calls.occupancy).toEqual([{ capacity_current: 300 }])
    await waitFor(() => expect(screen.getByRole('region', { name: 'Occupancy' })).toHaveTextContent('Capacity 300 / 400'))
    expect(screen.queryByRole('textbox', { name: /People currently at/ })).not.toBeInTheDocument()
  })

  it('puts the keyboard back on Update occupancy when the editor closes', async () => {
    serve()
    signIn()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })
    await userEvent.click(screen.getByRole('button', { name: 'Update occupancy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update occupancy' })).toHaveFocus())
  })

  it("keeps the editor open with the server's words when the save is refused", async () => {
    serve({ occupancyError: { status: 400, error: 'capacity_current must be between 0 and capacity_total' } })
    signIn()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })
    await userEvent.click(screen.getByRole('button', { name: 'Update occupancy' }))
    const field = screen.getByRole('textbox', { name: /People currently at/ })
    await userEvent.clear(field)
    await userEvent.type(field, '399')
    await userEvent.click(screen.getByRole('button', { name: 'Save occupancy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('capacity_current must be between 0 and capacity_total')
  })

  it('lets an admin edit status and certification — sending only what changed — and shows the result', async () => {
    const calls = serve()
    signIn()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })

    await userEvent.click(screen.getByRole('button', { name: 'Edit shelter' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Certified' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('GBHS Johi was updated.')).toBeInTheDocument()
    expect(calls.patched).toEqual([{ certification_status: 'certified' }])
    expect(await screen.findByText('Certified', { selector: 'span' })).toBeInTheDocument()
  })

  it('offers a volunteer occupancy but not Edit, since the API restricts editing to the admin', async () => {
    serve()
    signIn('ngo_volunteer')
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })
    expect(screen.getByRole('button', { name: 'Update occupancy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit shelter' })).not.toBeInTheDocument()
  })

  it("shows another organisation's shelter read-only, and says so — the API would refuse every write with a 403", async () => {
    serve({ shelter: theirs })
    signIn()
    renderPage('/ngo/shelters/s9')
    expect(await screen.findByRole('heading', { level: 1, name: 'Other Group Camp' })).toBeInTheDocument()
    expect(screen.getByText(/run by another organisation/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit shelter' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update occupancy' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Details' })).getByText('Managed by').nextElementSibling).toHaveTextContent('Another organisation')
  })

  it('treats a shelter with no managing organisation as not theirs', async () => {
    const orphan = { ...mine, managed_by_ngo_id: undefined }
    serve({ shelter: orphan })
    signIn()
    renderPage()
    expect(await screen.findByText(/run by another organisation/)).toBeInTheDocument()
  })

  it('still offers the controls when the organisation lookup fails — the server keeps the final say', async () => {
    serve({ ngo: 'fail' })
    signIn()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })
    expect(screen.getByRole('button', { name: 'Edit shelter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update occupancy' })).toBeInTheDocument()
    expect(screen.queryByText(/run by another organisation/)).not.toBeInTheDocument()
  })

  it('reads an unknown id and one that is not a UUID both as "not found", with a way back to the list', async () => {
    serve({ fail: { status: 404, body: { error: 'shelter not found' } } })
    signIn()
    const { unmount } = renderPage('/ngo/shelters/nope')
    expect(await screen.findByRole('heading', { name: 'Shelter not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to shelters' })).toHaveAttribute('href', '/ngo/shelters')
    unmount()

    serve({ fail: { status: 400, body: { error: 'id must be a valid uuid' } } })
    renderPage('/ngo/shelters/not-a-uuid')
    expect(await screen.findByRole('heading', { name: 'Shelter not found' })).toBeInTheDocument()
  })

  it('shows any other failure with a retry that recovers', async () => {
    let failing = true
    server.use(
      http.get('*/shelters/:id', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(mine))),
      http.get('*/ngo/me', () => HttpResponse.json({ id: NGO, name: 'Flood Relief', status: 'active', created_at: '', updated_at: '' })),
      http.get('*/map/flood-overlay', () => HttpResponse.json([])),
      http.get('*/regions', () => HttpResponse.json([sindh])),
    )
    signIn()
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })).toBeInTheDocument()
  })
})

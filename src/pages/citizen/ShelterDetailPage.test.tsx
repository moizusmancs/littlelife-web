import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import type { Shelter } from '@/api/facilities'
import type { MapCanvasProps } from '@/features/map/MapCanvas'
import { makeHazard, makeShelter } from '@/features/map/testMap'
import { ShelterDetailPage } from './ShelterDetailPage'

// The real canvas needs a layout jsdom lacks (and has its own tests); the stub exposes what the page hands it and lets a test press the
// callbacks that matter.
vi.mock('@/features/map/MapCanvas', async () => {
  const { useEffect } = await import('react')
  return {
    MapCanvas: (props: MapCanvasProps) => {
      const { onViewportChange } = props
      useEffect(() => onViewportChange({ west: 68.7, south: 27.6, east: 69.0, north: 27.8 }), [onViewportChange])
      return (
        <div data-testid="canvas">
          <output data-testid="places">{props.places.map((p) => `${p.name}@${p.position.join(',')}`).join('|')}</output>
          <output data-testid="selected">{props.selectedPlaceKey ?? ''}</output>
          <output data-testid="zones">{props.hazards.map((h) => h.hazard_zone_id).join(',')}</output>
          <output data-testid="user">{props.userPosition ? props.userPosition.join(',') : 'none'}</output>
          <output data-testid="focus">{props.focus ? JSON.stringify(props.focus) : 'none'}</output>
          <output data-testid="wheel">{String(props.scrollWheelZoom)}</output>
          <button type="button" onClick={props.onRecenter}>
            recenter
          </button>
        </div>
      )
    },
  }
})

const shelter: Shelter = makeShelter('s1', 'GBHS Johi', {
  location: { type: 'Point', coordinates: [68.858, 27.706] },
  capacity_current: 265,
  capacity_total: 400,
  updated_at: new Date(Date.now() - 2 * 60_000).toISOString(),
})

function serve(options: { shelter?: Shelter; fail?: { status: number; body: Record<string, string> }; overlay?: unknown } = {}) {
  const calls = { shelter: [] as string[], overlay: [] as string[] }
  server.use(
    http.get('*/shelters/:id', ({ params }) => {
      calls.shelter.push(String(params.id))
      return options.fail ? HttpResponse.json(options.fail.body, { status: options.fail.status }) : HttpResponse.json(options.shelter ?? shelter)
    }),
    http.get('*/map/flood-overlay', ({ request }) => {
      calls.overlay.push(new URL(request.url).searchParams.get('bbox') ?? '')
      return options.overlay === 'fail' ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(options.overlay ?? [])
    }),
  )
  return calls
}

function renderPage(path = '/app/map/shelters/s1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/map/shelters/:id" element={<ShelterDetailPage />} />
          <Route path="/app/map" element={<p>the map page</p>} />
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
afterEach(() => Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true }))

describe('ShelterDetailPage', () => {
  it('reads the shelter named in the URL and shows its name, badges, capacity and details', async () => {
    const calls = serve()
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })).toBeInTheDocument()
    expect(calls.shelter).toEqual(['s1'])
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Certified').length).toBeGreaterThan(0)
    const capacity = screen.getByRole('region', { name: 'Capacity' })
    expect(capacity).toHaveTextContent('Capacity 265 / 400')
    expect(within(capacity).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '66')
    expect(screen.getByRole('region', { name: 'Details' })).toBeInTheDocument()
  })

  it('shows a skeleton first, then the page', async () => {
    serve()
    renderPage()
    expect(screen.getByLabelText('Loading shelter')).toBeInTheDocument()
    await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })
    expect(screen.queryByLabelText('Loading shelter')).not.toBeInTheDocument()
  })

  it('hands the map the shelter — as [lat, lng], selected — and lets the page scroll past it', async () => {
    serve()
    renderPage()
    await screen.findByTestId('canvas')
    expect(screen.getByTestId('places')).toHaveTextContent('GBHS Johi@27.706,68.858')
    expect(screen.getByTestId('selected')).toHaveTextContent('shelter:s1')
    expect(screen.getByTestId('wheel')).toHaveTextContent('false')
  })

  it('asks for the flood zones of the box the map is looking at, and passes them on', async () => {
    const calls = serve({ overlay: [makeHazard('z1', 'high', 0.8, [68.85, 27.7])] })
    renderPage()
    await waitFor(() => expect(calls.overlay).toEqual(['68.7,27.6,69,27.8']))
    await waitFor(() => expect(screen.getByTestId('zones')).toHaveTextContent('z1'))
  })

  it('says under the map when the flood zones could not be loaded, and keeps the rest of the page', async () => {
    serve({ overlay: 'fail' })
    renderPage()
    expect(await screen.findByText("Couldn't load flood zones for this area.")).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'GBHS Johi' })).toBeInTheDocument()
  })

  it('says "not found" for an unknown id and for one that is not a UUID, with the way back to the map', async () => {
    serve({ fail: { status: 404, body: { error: 'shelter not found' } } })
    const first = renderPage('/app/map/shelters/nope')
    expect(await screen.findByRole('heading', { name: 'Shelter not found' })).toBeInTheDocument()
    first.unmount()
    serve({ fail: { status: 400, body: { error: 'id must be a valid uuid' } } })
    renderPage('/app/map/shelters/not-a-uuid')
    expect(await screen.findByRole('heading', { name: 'Shelter not found' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Back to map' }))
    expect(screen.getByText('the map page')).toBeInTheDocument()
  })

  it('shows any other failure as an alert with a retry that recovers', async () => {
    serve({ fail: { status: 500, body: { error: 'internal server error' } } })
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    serve()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })).toBeInTheDocument()
  })

  it('asks for nothing about the visitor until they press the button — then shows the distance and fits the map to both places', async () => {
    serve()
    const getCurrentPosition = stubLocation((ok) => ok({ coords: { latitude: 27.75, longitude: 68.9 } } as GeolocationPosition))
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'GBHS Johi' })
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(screen.getByTestId('user')).toHaveTextContent('none')

    await userEvent.click(screen.getByRole('button', { name: 'Show distance from me' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/km away|m away/)).toBeInTheDocument()
    expect(screen.getByTestId('user')).toHaveTextContent('27.75,68.9')
    const focus = JSON.parse(screen.getByTestId('focus').textContent ?? 'null') as { bounds: number[][] }
    expect(focus.bounds).toEqual([[27.706, 68.858], [27.75, 68.9]])
  })

  it('the map’s own location button does the same', async () => {
    serve()
    stubLocation((ok) => ok({ coords: { latitude: 27.75, longitude: 68.9 } } as GeolocationPosition))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'recenter' }))
    expect(await screen.findByText(/km away|m away/)).toBeInTheDocument()
  })

  it('explains a blocked location in terms of the distance, and leaves the button to try again', async () => {
    serve()
    stubLocation((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Show distance from me' }))
    expect(await screen.findByText(/to see how far this shelter is from you/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show distance from me' })).toBeEnabled()
  })

  it('links Navigate Here to the route planner with this shelter as the destination', async () => {
    serve()
    renderPage()
    expect(await screen.findByRole('link', { name: /Navigate Here/ })).toHaveAttribute('href', '/app/navigate?destination_shelter_id=s1')
  })
})

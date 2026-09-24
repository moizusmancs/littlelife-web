import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import type { Region } from '@/api/geo'
import type { EssentialLocation, Infrastructure, Shelter } from '@/api/facilities'
import type { HazardZoneDetail, MapOverlayEntry, RiskCheckResult } from '@/api/floodIntel'
import type { MapCanvasProps } from '@/features/map/MapCanvas'
import { makeEssential, makeHazard, makeInfrastructure, makeShelter } from '@/features/map/testMap'
import { makeRegion } from '@/features/regions/testRegion'
import { MapPage } from './MapPage'

// Leaflet needs a real layout, which jsdom doesn't have. The canvas is replaced by a stub that exposes what the
// page hands it and lets a test press its callbacks; the real canvas is covered by its own tests and the E2E.
vi.mock('@/features/map/MapCanvas', async () => {
  const { useEffect } = await import('react')
  return {
    MapCanvas: (props: MapCanvasProps) => {
      const { onViewportChange } = props
      useEffect(() => onViewportChange({ west: 67.02, south: 24.03, east: 68.41, north: 25.02 }), [onViewportChange])
      return (
        <div data-testid="canvas">
          <output data-testid="zones">{props.hazards.map((h) => h.hazard_zone_id).join(',')}</output>
          <output data-testid="markers">{props.places.map((p) => p.name).join(',')}</output>
          <output data-testid="selected-place">{props.selectedPlaceKey ?? ''}</output>
          <output data-testid="selected-zone">{props.selectedHazardId ?? ''}</output>
          <output data-testid="user">{props.userPosition ? props.userPosition.join(',') : 'none'}</output>
          <output data-testid="focus">{props.focus ? JSON.stringify(props.focus) : 'none'}</output>
          <output data-testid="bounds">{JSON.stringify(props.initialBounds)}</output>
          <output data-testid="locating">{String(props.locating)}</output>
          {props.places.map((p) => (
            <button key={p.key} type="button" onClick={() => props.onSelectPlace(p.key)}>
              {`marker ${p.name}`}
            </button>
          ))}
          {props.hazards.map((h) => (
            <button key={h.hazard_zone_id} type="button" onClick={() => props.onSelectHazard(h.hazard_zone_id)}>
              {`zone ${h.hazard_zone_id}`}
            </button>
          ))}
          {props.overlays}
          <button type="button" onClick={props.onRecenter}>
            recenter
          </button>

        </div>
      )
    },
  }
})

const box = (west: number, south: number, east: number, north: number) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] })
const sindh = makeRegion('sindh', 'Sindh', 'province', undefined, { boundary: box(67, 26, 70, 28) })
const sukkur = makeRegion('sukkur', 'Sukkur', 'district', 'sindh', { boundary: box(68, 27, 69, 28) })
const punjab = makeRegion('punjab', 'Punjab', 'province', undefined, { boundary: box(70, 30, 75, 34) })

const hazards: MapOverlayEntry[] = [makeHazard('zone-model', 'high', 0.87, [68.8, 27.6]), makeHazard('zone-manual', 'medium', undefined, [68.5, 27.4]), makeHazard('zone-low', 'low', 0.04, [68.2, 27.2])]
const detail: HazardZoneDetail = {
  id: 'zone-model',
  source: 'ai_prediction',
  risk_level: 'high',
  boundary: box(68.8, 27.6, 68.9, 27.7),
  status: 'active',
  detected_at: '2026-09-24T01:19:47Z',
  confidence_score: 0.87,
  model_version: 'convlstm-unet-v3',
  valid_from: '2026-09-20T00:00:00Z',
  valid_until: '2026-09-21T00:00:00Z',
  generated_at: '2026-09-20T05:58:00Z',
}

interface Options {
  regions?: Region[]
  homeRegionId?: string
  overlay?: MapOverlayEntry[]
  shelters?: Record<string, Shelter[]>
  infrastructure?: Record<string, Infrastructure[]>
  essentials?: Record<string, EssentialLocation[]>
  risk?: RiskCheckResult
}

function serve(options: Options = {}) {
  const calls = { overlay: [] as string[], shelters: [] as string[], infrastructure: [] as string[], essentials: [] as string[], detail: [] as string[], risk: [] as Array<{ lat: number; lng: number }> }
  const overlay = options.overlay ?? hazards
  server.use(
    http.get('*/regions', () => HttpResponse.json(options.regions ?? [sindh, sukkur, punjab])),
    http.get('*/profile', () => (options.homeRegionId ? HttpResponse.json({ id: 'p', name: 'A', home_region_id: options.homeRegionId, created_at: '', updated_at: '' }) : HttpResponse.json({ error: 'profile not found' }, { status: 404 }))),
    http.get('*/map/flood-overlay', ({ request }) => {
      calls.overlay.push(new URL(request.url).searchParams.get('bbox') ?? '')
      return HttpResponse.json(overlay)
    }),
    http.get('*/shelters', ({ request }) => {
      const id = new URL(request.url).searchParams.get('region_id') ?? ''
      calls.shelters.push(id)
      return HttpResponse.json(options.shelters?.[id] ?? [])
    }),
    http.get('*/infrastructure', ({ request }) => {
      const id = new URL(request.url).searchParams.get('region_id') ?? ''
      calls.infrastructure.push(id)
      return HttpResponse.json(options.infrastructure?.[id] ?? [])
    }),
    http.get('*/essential-locations', ({ request }) => {
      const id = new URL(request.url).searchParams.get('region_id') ?? ''
      calls.essentials.push(id)
      return HttpResponse.json(options.essentials?.[id] ?? [])
    }),
    http.get('*/hazard-zones/:id', ({ params }) => {
      calls.detail.push(String(params.id))
      return params.id === 'zone-model' ? HttpResponse.json(detail) : HttpResponse.json({ ...detail, id: params.id, source: 'manual_admin', confidence_score: undefined })
    }),
    http.post('*/hazard-zones/risk-check', async ({ request }) => {
      calls.risk.push((await request.json()) as { lat: number; lng: number })
      return HttpResponse.json(options.risk ?? { inside_hazard_zone: false, distance_meters: 0 })
    }),
  )
  return calls
}

function renderPage() {
  // staleTime as in the app, so a layer toggled off and on again is served from the cache.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MapPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const original = window.matchMedia
const setDesktop = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: desktop, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
}
const stubLocation = (impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) =>
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: vi.fn(impl) }, configurable: true })

const shelters = { sindh: [makeShelter('s1', 'GBHS Johi', { location: { type: 'Point', coordinates: [68.86, 27.7] } }), makeShelter('s2', 'Relief Camp', { type: 'relief_center', capacity_current: 130, capacity_total: 100 })], punjab: [makeShelter('s3', 'Lahore Hall')] }
const text = (id: string) => screen.getByTestId(id).textContent

beforeEach(() => setDesktop(true))
afterEach(() => {
  window.matchMedia = original
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
})

describe('MapPage — data and layers', () => {
  it('opens with the flood layer and the shelters layer on: zones worst first in the list, shelters as markers, asked per top-level region only', async () => {
    const calls = serve({ shelters })
    renderPage()

    const list = await screen.findByRole('heading', { name: /Active hazards in view/ })
    await waitFor(() => expect(text('zones')).toBe('zone-model,zone-manual,zone-low'))
    await waitFor(() => expect(text('markers')).toContain('GBHS Johi'))
    expect(text('markers').split(',').sort()).toEqual(['GBHS Johi', 'Lahore Hall', 'Relief Camp'])
    expect(list).toHaveTextContent('3')
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('High-risk flood zone')
    expect(rows[2]).toHaveTextContent('Low-risk flood zone')
    // Sukkur is inside Sindh, so it is never asked for; nor are the layers that are off.
    expect(calls.shelters.sort()).toEqual(['punjab', 'sindh'])
    expect(calls.infrastructure).toEqual([])
    expect(calls.essentials).toEqual([])
  })

  it('asks the overlay for the visible rectangle rounded outwards, so a small pan reuses the same request', async () => {
    const calls = serve()
    renderPage()
    await waitFor(() => expect(calls.overlay).toEqual(['67,24,68.5,25.1']))
  })

  it('shows one zone for a boundary the overlay returns many times, in the map and in the list', async () => {
    const copies = [makeHazard('copy-a', 'low', 0.04, [68.1, 25.1]), makeHazard('copy-b', 'low', 0.04, [68.1, 25.1]), makeHazard('copy-c', 'low', 0.04, [68.1, 25.1]), makeHazard('other', 'medium', 0.5, [68.2, 25.2])]
    serve({ overlay: copies })
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(text('zones').split(',').sort()).toHaveLength(2)
    expect(screen.getByRole('heading', { name: /Active hazards in view/ })).toHaveTextContent('2')
  })

  it('requests a facility layer only when it is switched on, and never again for a region it already has', async () => {
    const calls = serve({ infrastructure: { sindh: [makeInfrastructure('i1', 'General Hospital')] } })
    renderPage()
    await screen.findByRole('heading', { name: /Active hazards in view/ })

    await userEvent.click(screen.getByRole('button', { name: 'Infrastructure' }))
    await waitFor(() => expect(text('markers')).toContain('General Hospital'))
    expect(calls.infrastructure.sort()).toEqual(['punjab', 'sindh'])

    await userEvent.click(screen.getByRole('button', { name: 'Infrastructure' }))
    await waitFor(() => expect(text('markers')).not.toContain('General Hospital'))
    await userEvent.click(screen.getByRole('button', { name: 'Infrastructure' }))
    await waitFor(() => expect(text('markers')).toContain('General Hospital'))
    expect(calls.infrastructure).toHaveLength(2)
  })

  it('shows essential locations as places too, with the unknown status kept as unknown', async () => {
    serve({ essentials: { sindh: [makeEssential('e1', 'Corner Pharmacy')] } })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Essentials' }))
    await userEvent.click(await screen.findByRole('button', { name: 'marker Corner Pharmacy' }))
    expect(screen.getByRole('region', { name: 'Corner Pharmacy details' })).toHaveTextContent('Status unknown')
  })

  it('turning Flood off removes the zones from the map and list and says how to get them back', async () => {
    serve()
    renderPage()
    await waitFor(() => expect(text('zones')).not.toBe(''))
    await userEvent.click(screen.getByRole('button', { name: 'Flood' }))
    expect(text('zones')).toBe('')
    expect(screen.getByText('Turn on the Flood layer to see hazards.')).toBeInTheDocument()
  })

  it('a layer switched off clears a selection that belonged to it, and leaves one that did not', async () => {
    serve({ shelters })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'marker GBHS Johi' }))
    expect(screen.getByRole('region', { name: 'GBHS Johi details' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Flood' })) // not its layer
    expect(screen.getByRole('region', { name: 'GBHS Johi details' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Shelters' })) // its layer
    expect(screen.queryByRole('region', { name: 'GBHS Johi details' })).not.toBeInTheDocument()
  })
})

describe('MapPage — search', () => {
  it('filters the map’s places and the hazard list, and lists the matching places', async () => {
    serve({ shelters })
    renderPage()
    await screen.findByRole('button', { name: 'marker GBHS Johi' })
    await waitFor(() => expect(text('zones')).toBe('zone-model,zone-manual,zone-low'))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the map' }), 'johi')
    expect(text('markers')).toBe('GBHS Johi')
    const results = screen.getByRole('heading', { name: /Places matching your search/ }).closest('section')!
    expect(within(results).getAllByRole('button')).toHaveLength(1)
    expect(within(results).getByRole('button', { name: /GBHS Johi/ })).toBeInTheDocument()
    expect(text('zones')).toBe('') // no hazard matches "johi"
    expect(screen.getByText('No active hazards in this area.')).toBeInTheDocument()
  })

  it('matches hazards by risk level, and shows a helpful empty result', async () => {
    serve({ shelters })
    renderPage()
    await screen.findByRole('button', { name: 'marker GBHS Johi' })
    await waitFor(() => expect(text('zones')).toBe('zone-model,zone-manual,zone-low'))
    const search = screen.getByRole('searchbox', { name: 'Search the map' })

    await userEvent.type(search, 'high')
    expect(text('zones')).toBe('zone-model')

    await userEvent.clear(search)
    await userEvent.type(search, 'zzz')
    expect(text('markers')).toBe('')
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument()
  })

  it('selecting a search result selects the place and moves the map to it', async () => {
    serve({ shelters })
    renderPage()
    await screen.findByRole('button', { name: 'marker GBHS Johi' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the map' }), 'lahore')
    const results = screen.getByRole('heading', { name: /Places matching your search/ }).closest('section')!
    await userEvent.click(within(results).getByRole('button', { name: /Lahore Hall/ }))

    expect(screen.getByRole('region', { name: 'Lahore Hall details' })).toBeInTheDocument()
    expect(JSON.parse(text('focus')!)).toMatchObject({ center: [27.7, 68.86], zoom: 15 })
  })
})

describe('MapPage — selection', () => {
  it('a zone chosen in the list shows its card with the forecast detail fetched by id, and moves the map to it', async () => {
    const calls = serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /High-risk flood zone/ }))

    const card = await screen.findByRole('region', { name: 'Hazard zone details' })
    expect(card).toHaveTextContent('High-risk flood zone')
    expect(await within(card).findByText('convlstm-unet-v3')).toBeInTheDocument()
    expect(calls.detail).toEqual(['zone-model'])
    expect(text('selected-zone')).toBe('zone-model')
    expect(JSON.parse(text('focus')!).bounds).toBeTruthy()
  })

  it('a zone clicked on the map is selected without moving the map', async () => {
    serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'zone zone-manual' }))
    expect(await screen.findByRole('heading', { name: 'Medium-risk hazard zone' })).toBeInTheDocument()
    expect(text('focus')).toBe('none')
  })

  it('a shelter clicked on the map shows its capacity and links, without moving the map, and closes', async () => {
    serve({ shelters })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'marker Relief Camp' }))

    const card = screen.getByRole('region', { name: 'Relief Camp details' })
    expect(card).toHaveTextContent('Over capacity')
    expect(within(card).getByRole('link', { name: 'View Details' })).toHaveAttribute('href', '/app/map/shelters/s2')
    expect(text('selected-place')).toBe('shelter:s2')
    expect(text('focus')).toBe('none')

    await userEvent.click(within(card).getByRole('button', { name: 'Close details' }))
    expect(screen.queryByRole('region', { name: 'Relief Camp details' })).not.toBeInTheDocument()
  })

  it('keeps a selected zone after panning takes it out of the list', async () => {
    serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Low-risk flood zone/ }))
    await screen.findByRole('region', { name: 'Hazard zone details' })
    // Search hides it from the list and the map, but the card stays until closed.
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the map' }), 'high')
    expect(screen.getByRole('region', { name: 'Hazard zone details' })).toHaveTextContent('Low-risk flood zone')
  })
})

describe('MapPage — where the map opens', () => {
  it('opens on the box around every top-level region when there is no home region', async () => {
    serve()
    renderPage()
    await waitFor(() => expect(JSON.parse(text('bounds')!)).toEqual([[26, 67], [34, 75]]))
  })

  it('opens on the citizen’s home region when they have one', async () => {
    serve({ homeRegionId: 'sukkur' })
    renderPage()
    await waitFor(() => expect(JSON.parse(text('bounds')!)).toEqual([[27, 68], [28, 69]]))
  })

  it('falls back to a frame of Pakistan when there are no regions at all, and says places can’t be shown', async () => {
    serve({ regions: [] })
    renderPage()
    expect(await screen.findByText("No regions have been set up yet, so places can't be shown.")).toBeInTheDocument()
    expect(JSON.parse(text('bounds')!)).toEqual([[23.5, 60.8], [37.2, 77.9]])
  })
})

describe('MapPage — the viewer’s location', () => {
  it('asks for nothing until the location button is pressed', async () => {
    serve()
    stubLocation(() => undefined)
    renderPage()
    await screen.findByRole('heading', { name: /Active hazards in view/ })
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
    expect(text('user')).toBe('none')
  })

  it('moves the map to the position, draws it, and asks the server for a risk check with coarsened coordinates', async () => {
    const calls = serve({ risk: { inside_hazard_zone: false, hazard_zone_id: 'zone-manual', risk_level: 'medium', distance_meters: 842.3 } })
    stubLocation((ok) => ok({ coords: { latitude: 24.860712, longitude: 67.0011 } } as GeolocationPosition))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'recenter' }))

    expect(text('user')).toBe('24.860712,67.0011')
    expect(JSON.parse(text('focus')!)).toMatchObject({ center: [24.860712, 67.0011], zoom: 14 })
    expect(await screen.findByText(/The nearest active hazard is/)).toHaveTextContent('840 m away (medium risk)')
    expect(calls.risk).toEqual([{ lat: 24.861, lng: 67.001 }])
  })

  it('"Show zone" jumps to the zone the server named, fetching it by id when it is not in view', async () => {
    const calls = serve({ overlay: [], risk: { inside_hazard_zone: true, hazard_zone_id: 'zone-model', risk_level: 'high', distance_meters: 0 } })
    stubLocation((ok) => ok({ coords: { latitude: 27.7, longitude: 68.85 } } as GeolocationPosition))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'recenter' }))
    expect(await screen.findByText(/You're inside a high-risk hazard zone/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show zone' }))
    expect(await screen.findByRole('region', { name: 'Hazard zone details' })).toHaveTextContent('High-risk flood zone')
    expect(calls.detail).toContain('zone-model')
    expect(text('selected-zone')).toBe('zone-model')
  })

  it('explains a blocked location and sends no risk check', async () => {
    const calls = serve()
    stubLocation((_, fail) => fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'recenter' }))
    expect(await screen.findByText(/Location is blocked for this site/)).toBeInTheDocument()
    expect(text('user')).toBe('none')
    expect(calls.risk).toEqual([])
  })
})

describe('MapPage — failures', () => {
  it('shows a failed flood overlay as an alert with a retry that recovers', async () => {
    serve()
    let failing = true
    server.use(http.get('*/map/flood-overlay', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(hazards))))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load flood zones.")

    failing = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(text('zones')).toBe('zone-model,zone-manual,zone-low'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows failed regions — which places depend on — with a retry, and does not stop the flood layer', async () => {
    serve()
    let failing = true
    server.use(http.get('*/regions', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json([sindh, punjab]))))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load the regions that places are found by.")
    await waitFor(() => expect(text('zones')).toBe('zone-model,zone-manual,zone-low'))

    failing = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a failed facilities request for one region, with the places that did load', async () => {
    serve({ shelters })
    server.use(http.get('*/shelters', ({ request }) => (new URL(request.url).searchParams.get('region_id') === 'punjab' ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(shelters.sindh))))
    renderPage()
    expect(await screen.findByText("Couldn't load some places.")).toBeInTheDocument()
    await waitFor(() => expect(text('markers').split(',').sort()).toEqual(['GBHS Johi', 'Relief Camp']))
  })
})

describe('MapPage — on a phone', () => {
  beforeEach(() => setDesktop(false))

  it('shows the map with the layer chips over it, and the list only when asked — the map stays mounted', async () => {
    serve({ shelters })
    renderPage()
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Map layers' })).toBeInTheDocument() // the chips over the map
    expect(screen.queryByRole('searchbox', { name: 'Search the map' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'List & filters' }))
    expect(screen.getByRole('searchbox', { name: 'Search the map' })).toBeInTheDocument()
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
  })

  it('choosing a zone from the list returns to the map, where the selected card is shown once', async () => {
    serve()
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'List & filters' }))
    await userEvent.click(await screen.findByRole('button', { name: /High-risk flood zone/ }))

    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('searchbox', { name: 'Search the map' })).not.toBeInTheDocument()
    expect(await screen.findAllByRole('region', { name: 'Hazard zone details' })).toHaveLength(1)
  })
})

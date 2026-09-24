import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import type { AdminHazardZone, FloodPrediction } from '@/api/floodIntel'
import type { MapCanvasProps } from '@/features/map/MapCanvas'
import { makeAdminZone, makePrediction } from '@/features/hazardZones/testZones'
import { HazardZonesPage } from './HazardZonesPage'

// Leaflet needs a real layout, which jsdom lacks (and the canvas has its own tests): the stub reports a fixed view and shows what it is handed.
vi.mock('@/features/map/MapCanvas', async () => {
  const { useEffect } = await import('react')
  return {
    MapCanvas: (props: MapCanvasProps) => {
      const { onViewportChange } = props
      useEffect(() => onViewportChange({ west: 67, south: 24, east: 70, north: 28 }), [onViewportChange])
      return (
        <div data-testid="canvas">
          <output data-testid="zones">{props.hazards.map((h) => h.hazard_zone_id).join(',')}</output>
          <output data-testid="selected">{props.selectedHazardId ?? ''}</output>
          <output data-testid="focus">{props.focus ? JSON.stringify(props.focus) : 'none'}</output>
          <output data-testid="locate">{String(props.onRecenter !== undefined)}</output>
          <button type="button" onClick={() => props.onSelectHazard('clicked-zone')}>
            open a zone on the map
          </button>
        </div>
      )
    },
  }
})

const original = window.matchMedia
const setDesktop = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: desktop, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
}
beforeEach(() => setDesktop(true))
afterEach(() => (window.matchMedia = original))

interface Options {
  zones?: AdminHazardZone[]
  predictions?: FloodPrediction[]
  failZones?: boolean
  resolve?: 'ok' | 'not-active' | 'gone' | 'boom'
  declare?: 'ok' | 'invalid'
}

function serve(options: Options = {}) {
  // Each default zone has a box of its own — identical boxes are collapsed to one on the map, as the real overlay's stacked copies are.
  const store = { zones: options.zones ?? Array.from({ length: 25 }, (_, i) => makeAdminZone(`zone-${String(i).padStart(2, '0')}`, { boundary: boxAt(68 + i * 0.3) })) }
  const calls = {
    zones: [] as Array<Record<string, string>>,
    predictions: [] as Array<Record<string, string>>,
    overlay: [] as Array<Record<string, string>>,
    resolve: [] as string[],
    declare: [] as unknown[],
  }
  server.use(
    http.get('*/admin/hazard-zones', ({ request }) => {
      const q = Object.fromEntries(new URL(request.url).searchParams)
      calls.zones.push(q)
      if (options.failZones) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      const matching = q.status ? store.zones.filter((zone) => zone.status === q.status) : store.zones
      const limit = Number(q.limit ?? 20)
      const offset = Number(q.offset ?? 0)
      return HttpResponse.json({ zones: matching.slice(offset, offset + limit), total: matching.length, limit, offset })
    }),
    http.get('*/admin/flood-predictions', ({ request }) => {
      calls.predictions.push(Object.fromEntries(new URL(request.url).searchParams))
      const all = options.predictions ?? [makePrediction('p1'), makePrediction('p2', { risk_level: 'low', confidence_score: 0.1 })]
      return HttpResponse.json({ predictions: all, total: all.length, limit: 20, offset: 0 })
    }),
    http.get('*/admin/map/flood-overlay', ({ request }) => {
      calls.overlay.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json(store.zones.filter((zone) => zone.status === 'active').slice(0, 2).map((zone) => ({ hazard_zone_id: zone.id, risk_level: zone.risk_level, boundary: zone.boundary, detected_at: zone.detected_at, source: zone.source })))
    }),
    http.patch('*/admin/hazard-zones/:id/resolve', ({ params }) => {
      calls.resolve.push(String(params.id))
      if (options.resolve === 'not-active') return HttpResponse.json({ error: 'hazard zone is not active' }, { status: 400 })
      if (options.resolve === 'gone') return HttpResponse.json({ error: 'hazard zone not found' }, { status: 404 })
      if (options.resolve === 'boom') return HttpResponse.json({ error: 'internal server error' }, { status: 500 })
      const zone = store.zones.find((entry) => entry.id === params.id)
      if (zone) Object.assign(zone, { status: 'resolved', resolved_at: new Date().toISOString() })
      return HttpResponse.json(zone)
    }),
    http.post('*/admin/hazard-zones', async ({ request }) => {
      const body = (await request.json()) as { boundary: AdminHazardZone['boundary']; risk_level: AdminHazardZone['risk_level'] }
      calls.declare.push(body)
      if (options.declare === 'invalid') return HttpResponse.json({ error: 'risk_level must be one of: low, medium, high' }, { status: 400 })
      const zone = makeAdminZone('declared-zone', { source: 'manual_admin', risk_level: body.risk_level, boundary: body.boundary })
      delete zone.flood_prediction_id
      store.zones.unshift(zone)
      return HttpResponse.json(zone, { status: 201 })
    }),
  )
  return { calls, store }
}

function renderPage(path = '/admin/hazard-zones') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/hazard-zones" element={<HazardZonesPage />} />
          <Route path="/admin/hazard-zones/:id" element={<p>the detail page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const boxAt = (x: number) => ({ type: 'Polygon', coordinates: [[[x, 27], [x + 0.2, 27], [x + 0.2, 27.2], [x, 27.2], [x, 27]]] })
const square = JSON.stringify({ type: 'Polygon', coordinates: [[[70.1, 22.5], [70.4, 22.5], [70.4, 22.8], [70.1, 22.8], [70.1, 22.5]]] })
const rows = () => within(screen.getByRole('list', { name: 'Hazard zones' })).getAllByRole('listitem')
// Zones on the map are in draw order, which for equal risk depends on how recently each was detected — so compare as a set.
const zonesOnMap = () => (screen.getByTestId('zones').textContent ?? '').split(',').filter(Boolean).sort().join(',')

describe('HazardZonesPage — the table and the map', () => {
  it('opens on the active zones — the first page of 20, newest first — and asks the map for the box in view, with every model zone', async () => {
    const { calls } = serve()
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(20))
    expect(calls.zones[0]).toEqual({ status: 'active', limit: '20', offset: '0' })
    expect(screen.getByText('1–20 of 25')).toBeInTheDocument()
    await waitFor(() => expect(calls.overlay).toEqual([{ bbox: '67,24,70,28' }]))
    await waitFor(() => expect(zonesOnMap()).toBe('zone-00,zone-01'))
    expect(screen.getByTestId('locate')).toHaveTextContent('false')
  })

  it('pages through the server’s pages and changes the page size, starting again from the first page', async () => {
    const { calls } = serve()
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(20))
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(calls.zones.at(-1)).toEqual({ status: 'active', limit: '20', offset: '20' }))
    expect(await screen.findByText('21–25 of 25')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Rows per page'), '50')
    await waitFor(() => expect(calls.zones.at(-1)).toEqual({ status: 'active', limit: '50', offset: '0' }))
  })

  it('reads its view from the URL — page, size, status, dates — and clamps nothing it cannot know', async () => {
    const resolved = Array.from({ length: 3 }, (_, i) => makeAdminZone(`r${i}`, { status: 'resolved', resolved_at: new Date().toISOString() }))
    const { calls } = serve({ zones: resolved })
    renderPage('/admin/hazard-zones?status=resolved&page=2&size=50&from=2026-09-24&to=2026-09-25')
    await waitFor(() => expect(calls.zones.length).toBeGreaterThan(0))
    const request = calls.zones[0]
    expect(request).toMatchObject({ status: 'resolved', limit: '50', offset: '50' })
    expect(new Date(request.from).getTime()).toBe(new Date('2026-09-24T00:00:00').getTime())
    expect(new Date(request.to).getTime()).toBe(new Date('2026-09-25T23:59:59.999').getTime())
    expect(await screen.findByText('There is nothing on this page. Go back to an earlier one.')).toBeInTheDocument()
  })

  it('switches to Resolved: asks for resolved zones, draws that page on the map, and does not ask the overlay again', async () => {
    const zones = [makeAdminZone('a1'), makeAdminZone('r1', { status: 'resolved', resolved_at: new Date().toISOString() }), makeAdminZone('r2', { status: 'resolved', resolved_at: new Date().toISOString() })]
    const { calls } = serve({ zones })
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(1))
    await waitFor(() => expect(calls.overlay).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Resolved' }))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(calls.zones.at(-1)).toMatchObject({ status: 'resolved' })
    expect(zonesOnMap()).toBe('r1,r2')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(calls.overlay).toHaveLength(1)
  })

  it('shows the model’s predictions as a second view, with no map and no slider, filtered by when they were generated', async () => {
    const { calls } = serve()
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Predictions' }))
    const list = await screen.findByRole('list', { name: 'Flood predictions' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(calls.predictions[0]).toEqual({ limit: '20', offset: '0' })
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Generated from')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Generated from'), { target: { value: '2026-09-24' } })
    await waitFor(() => expect(calls.predictions.at(-1)).toHaveProperty('from'))
  })

  it('asks for a date range as timestamps, and — when the range runs backwards — asks for nothing and says so', async () => {
    const { calls } = serve()
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(20))
    fireEvent.change(screen.getByLabelText('Detected from'), { target: { value: '2026-09-24' } })
    await waitFor(() => expect(calls.zones.at(-1)).toHaveProperty('from'))
    const before = calls.zones.length
    fireEvent.change(screen.getByLabelText('Detected to'), { target: { value: '2026-09-20' } })
    expect(await screen.findByText('Fix the dates to see results.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('The start date is after the end date')
    expect(calls.zones).toHaveLength(before)
    await userEvent.click(screen.getByRole('button', { name: 'Clear dates' }))
    await waitFor(() => expect(rows()).toHaveLength(20))
  })

  it('sends the confidence slider to the overlay as min_confidence — once it settles — and leaves the table alone', async () => {
    const { calls } = serve()
    renderPage()
    await waitFor(() => expect(calls.overlay).toHaveLength(1))
    const tableCalls = calls.zones.length
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.5' } })
    expect(screen.getByText('50%')).toBeInTheDocument()
    await waitFor(() => expect(calls.overlay.at(-1)).toEqual({ bbox: '67,24,70,28', min_confidence: '0.5' }))
    expect(calls.zones).toHaveLength(tableCalls)
  })

  it('points the map at a row’s zone — fitted to it, selected, and drawn even when the overlay doesn’t hold it', async () => {
    serve()
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(20))
    await waitFor(() => expect(zonesOnMap()).toBe('zone-00,zone-01'))
    await userEvent.click(screen.getByRole('button', { name: /Show High-risk flood zone zone-05 on the map/ }))
    expect(screen.getByTestId('selected')).toHaveTextContent('zone-05')
    expect(zonesOnMap()).toBe('zone-00,zone-01,zone-05')
    const focus = JSON.parse(screen.getByTestId('focus').textContent ?? 'null') as { bounds: number[][] }
    expect(focus.bounds).toEqual([[27, 69.5], [27.2, 69.7]])
  })

  it('opens a zone from a click on the map', async () => {
    serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'open a zone on the map' }))
    expect(screen.getByText('the detail page')).toBeInTheDocument()
  })

  it('says why a list is empty, and shows a failed load with a retry that recovers', async () => {
    serve({ zones: [] })
    const first = renderPage()
    expect(await screen.findByText('No active hazard zones.')).toBeInTheDocument()
    first.unmount()

    serve({ failZones: true })
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    serve()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(rows()).toHaveLength(20))
  })
})

describe('HazardZonesPage — on a phone', () => {
  it('shows the list or the map, and moves to the map when a row is pointed at', async () => {
    setDesktop(false)
    serve()
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(20))
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /Show High-risk flood zone zone-03 on the map/ }))
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('list', { name: 'Hazard zones' })).not.toBeInTheDocument()
    expect(screen.getByTestId('selected')).toHaveTextContent('zone-03')
  })
})

describe('HazardZonesPage — resolving', () => {
  const resolveFirst = async () => {
    await waitFor(() => expect(rows()).toHaveLength(20))
    await userEvent.click(screen.getByRole('button', { name: /Resolve High-risk flood zone zone-00/ }))
    return screen.getByRole('dialog', { name: 'Resolve this hazard zone?' })
  }

  it('confirms first, then resolves, says so, and the zone leaves the active list', async () => {
    const { calls } = serve()
    renderPage()
    const dialog = await resolveFirst()
    expect(calls.resolve).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve zone' }))
    await waitFor(() => expect(calls.resolve).toEqual(['zone-00']))
    expect(await screen.findByText(/is resolved and off the citizen map/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('1–20 of 24')).toBeInTheDocument())
  })

  it('cancelling changes nothing', async () => {
    const { calls } = serve()
    renderPage()
    const dialog = await resolveFirst()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(calls.resolve).toEqual([])
  })

  it('says a zone that was already resolved (the real 400) or removed wasn’t resolved here, closes the dialog, and refreshes', async () => {
    const { calls } = serve({ resolve: 'not-active' })
    renderPage()
    const dialog = await resolveFirst()
    const before = calls.zones.length
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve zone' }))
    expect(await screen.findByText(/hazard zone is not active. The list has been refreshed./)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(calls.zones.length).toBeGreaterThan(before))
  })

  it('keeps the dialog open with the message for any other failure', async () => {
    serve({ resolve: 'boom' })
    renderPage()
    const dialog = await resolveFirst()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve zone' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('internal server error')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('HazardZonesPage — declaring', () => {
  const declare = async (risk = 'high') => {
    await userEvent.click(screen.getByRole('button', { name: 'Declare hazard zone' }))
    const dialog = screen.getByRole('dialog', { name: 'Declare a hazard zone' })
    await userEvent.click(within(dialog).getByLabelText('Boundary (GeoJSON Polygon)'))
    await userEvent.paste(square)
    await userEvent.selectOptions(within(dialog).getByLabelText('Risk level'), risk)
    return dialog
  }

  it('sends the boundary and level, then shows the new zone: active view, first page, the map fitted to it', async () => {
    const { calls } = serve()
    renderPage('/admin/hazard-zones?status=resolved&page=2')
    await waitFor(() => expect(calls.zones.length).toBeGreaterThan(0))
    const dialog = await declare('medium')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Declare zone' }))
    await waitFor(() => expect(calls.declare).toEqual([{ boundary: JSON.parse(square), risk_level: 'medium' }]))
    expect(await screen.findByText(/Hazard zone declared \(#declared\). It is active, and on the citizen map now./)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(calls.zones.at(-1)).toEqual({ status: 'active', limit: '20', offset: '0' }))
    expect(await screen.findByRole('link', { name: 'Medium-risk hazard zone' })).toBeInTheDocument()
    expect(screen.getByTestId('selected')).toHaveTextContent('declared-zone')
    expect(JSON.parse(screen.getByTestId('focus').textContent ?? 'null')).toHaveProperty('bounds')
  })

  it('offers the map’s current view as the boundary', async () => {
    serve()
    renderPage()
    await waitFor(() => expect(screen.getByTestId('zones')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Declare hazard zone' }))
    await userEvent.click(await screen.findByRole('button', { name: "Use the map's current view" }))
    const text = (screen.getByLabelText('Boundary (GeoJSON Polygon)') as HTMLTextAreaElement).value
    expect(JSON.parse(text)).toEqual({ type: 'Polygon', coordinates: [[[67, 24], [70, 24], [70, 28], [67, 28], [67, 24]]] })
  })

  it('keeps the dialog open with the server’s message when it refuses', async () => {
    const { calls } = serve({ declare: 'invalid' })
    renderPage()
    await waitFor(() => expect(rows()).toHaveLength(20))
    const dialog = await declare()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Declare zone' }))
    expect(await within(dialog).findByText('risk_level must be one of: low, medium, high')).toBeInTheDocument()
    expect(calls.declare).toHaveLength(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('never sends a boundary that fails the checks', async () => {
    const { calls } = serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Declare hazard zone' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByLabelText('Boundary (GeoJSON Polygon)'))
    await userEvent.paste('{"type":"Point","coordinates":[1,2]}')
    await userEvent.selectOptions(within(dialog).getByLabelText('Risk level'), 'low')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Declare zone' }))
    expect(await within(dialog).findByText(/Expected a Polygon/)).toBeInTheDocument()
    expect(calls.declare).toEqual([])
  })
})

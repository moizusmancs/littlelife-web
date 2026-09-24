import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import type { HazardZoneDetail } from '@/api/floodIntel'
import type { MapCanvasProps } from '@/features/map/MapCanvas'
import { makeZoneDetail } from '@/features/hazardZones/testZones'
import { HazardZoneDetailPage } from './HazardZoneDetailPage'

vi.mock('@/features/map/MapCanvas', () => ({
  MapCanvas: (props: MapCanvasProps) => (
    <div data-testid="canvas">
      <output data-testid="zones">{props.hazards.map((h) => `${h.hazard_zone_id}:${h.confidence_score ?? 'flat'}`).join(',')}</output>
      <output data-testid="bounds">{JSON.stringify(props.initialBounds)}</output>
      <output data-testid="wheel">{String(props.scrollWheelZoom)}</output>
      <output data-testid="locate">{String(props.onRecenter !== undefined)}</output>
    </div>
  ),
}))

interface Options {
  zone?: HazardZoneDetail
  fail?: { status: number; body: Record<string, string> }
  resolve?: 'ok' | 'not-active' | 'boom'
}

function serve(options: Options = {}) {
  let zone = options.zone ?? makeZoneDetail('z1')
  const calls = { read: [] as string[], resolve: [] as string[] }
  server.use(
    http.get('*/hazard-zones/:id', ({ params }) => {
      calls.read.push(String(params.id))
      return options.fail ? HttpResponse.json(options.fail.body, { status: options.fail.status }) : HttpResponse.json(zone)
    }),
    http.patch('*/admin/hazard-zones/:id/resolve', ({ params }) => {
      calls.resolve.push(String(params.id))
      if (options.resolve === 'not-active') return HttpResponse.json({ error: 'hazard zone is not active' }, { status: 400 })
      if (options.resolve === 'boom') return HttpResponse.json({ error: 'internal server error' }, { status: 500 })
      zone = { ...zone, status: 'resolved', resolved_at: '2026-09-24T09:00:00Z' }
      return HttpResponse.json(zone)
    }),
  )
  return calls
}

function renderPage(path = '/admin/hazard-zones/z1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/hazard-zones/:id" element={<HazardZoneDetailPage />} />
          <Route path="/admin/hazard-zones" element={<p>the zones page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HazardZoneDetailPage', () => {
  it('reads the zone named in the URL and shows its title, badges, facts and prediction', async () => {
    const calls = serve()
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'High-risk flood zone' })).toBeInTheDocument()
    expect(calls.read).toEqual(['z1'])
    expect(screen.getByRole('region', { name: 'Zone' })).toBeInTheDocument()
    const prediction = screen.getByRole('region', { name: 'Prediction' })
    expect(within(prediction).getByRole('progressbar', { name: 'Model confidence' })).toHaveAttribute('aria-valuenow', '87')
    expect(within(prediction).getByText('convlstm-unet-v3')).toBeInTheDocument()
  })

  it('shows a skeleton first', async () => {
    serve()
    renderPage()
    expect(screen.getByLabelText('Loading hazard zone')).toBeInTheDocument()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByLabelText('Loading hazard zone')).not.toBeInTheDocument()
  })

  it('hands the map the zone with its confidence, fitted to its outline, with no locate button and the wheel off', async () => {
    serve()
    renderPage()
    await screen.findByTestId('canvas')
    expect(screen.getByTestId('zones')).toHaveTextContent('z1:0.87')
    expect(screen.getByTestId('bounds')).toHaveTextContent('[[27,68],[27.2,68.2]]')
    expect(screen.getByTestId('wheel')).toHaveTextContent('false')
    expect(screen.getByTestId('locate')).toHaveTextContent('false')
  })

  it('draws a declared zone flat and says it has no prediction', async () => {
    const manual = makeZoneDetail('z1', { source: 'manual_admin', risk_level: 'medium' })
    for (const key of ['confidence_score', 'model_version', 'valid_from', 'valid_until', 'generated_at'] as const) delete manual[key]
    serve({ zone: manual })
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Medium-risk hazard zone' })).toBeInTheDocument()
    expect(screen.getByTestId('zones')).toHaveTextContent('z1:flat')
    expect(screen.getByRole('region', { name: 'Prediction' })).toHaveTextContent('no model prediction behind it')
  })

  it('says "not found" for an unknown id and for one that is not a UUID, with the way back', async () => {
    serve({ fail: { status: 404, body: { error: 'hazard zone not found' } } })
    const first = renderPage('/admin/hazard-zones/nope')
    expect(await screen.findByRole('heading', { name: 'Hazard zone not found' })).toBeInTheDocument()
    first.unmount()
    serve({ fail: { status: 400, body: { error: 'id must be a valid uuid' } } })
    renderPage('/admin/hazard-zones/bad')
    expect(await screen.findByRole('heading', { name: 'Hazard zone not found' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Back to hazard zones' }))
    expect(screen.getByText('the zones page')).toBeInTheDocument()
  })

  it('shows any other failure with a retry that recovers', async () => {
    serve({ fail: { status: 500, body: { error: 'internal server error' } } })
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    serve()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'High-risk flood zone' })).toBeInTheDocument()
  })
})

describe('HazardZoneDetailPage — resolving', () => {
  it('confirms, resolves, says so, and the page shows it resolved with no Resolve button', async () => {
    const calls = serve()
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Resolve zone' }))
    const dialog = screen.getByRole('dialog', { name: 'Resolve this hazard zone?' })
    expect(calls.resolve).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve zone' }))
    await waitFor(() => expect(calls.resolve).toEqual(['z1']))
    expect(await screen.findByText(/Resolved. High-risk flood zone/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resolve zone' })).not.toBeInTheDocument())
    expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0)
  })

  it('says a zone someone else resolved first wasn’t resolved here, and refreshes', async () => {
    serve({ resolve: 'not-active' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Resolve zone' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resolve zone' }))
    expect(await screen.findByText(/hazard zone is not active. The page has been refreshed./)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dialog open with the message for another failure', async () => {
    serve({ resolve: 'boom' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Resolve zone' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolve zone' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('internal server error')
  })

  it('offers no Resolve for a zone that is already resolved', async () => {
    serve({ zone: makeZoneDetail('z1', { status: 'resolved', resolved_at: '2026-09-24T03:00:00Z' }) })
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: 'Resolve zone' })).not.toBeInTheDocument()
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import type { EssentialLocation, EssentialReportEntry, Infrastructure, Shelter } from '@/api/facilities'
import type { Region } from '@/api/geo'
import type { LocationPickerProps } from '@/features/map/LocationPicker'
import type { MapCanvasProps } from '@/features/map/MapCanvas'
import { makeEssential, makeHazard, makeInfrastructure, makeShelter } from '@/features/map/testMap'
import { FacilitiesPage } from './FacilitiesPage'

// The real canvas and picker are Leaflet maps (with their own tests); the stubs expose what the page hands them and let a test act.
vi.mock('@/features/map/MapCanvas', async () => {
  const { useEffect } = await import('react')
  return {
    MapCanvas: (props: MapCanvasProps) => {
      const { onViewportChange } = props
      useEffect(() => onViewportChange({ west: 68.7, south: 27.6, east: 69.0, north: 27.8 }), [onViewportChange])
      return (
        <div data-testid="canvas">
          <output data-testid="places">{props.places.map((p) => p.name).join('|')}</output>
          <output data-testid="zones">{props.hazards.map((h) => h.hazard_zone_id).join(',')}</output>
          <output data-testid="locate">{String(props.onRecenter !== undefined)}</output>
        </div>
      )
    },
    MapResizer: () => null,
  }
})
vi.mock('@/features/map/LocationPicker', () => ({
  LocationPicker: (props: LocationPickerProps) => (
    <div data-testid="picker">
      <output data-testid="pin">{props.value ? props.value.join(',') : 'none'}</output>
      <output data-testid="areas">{props.areas ? props.areas.map((area) => area.name).join(',') : 'none'}</output>
      <button type="button" onClick={() => props.onChange([27.7, 68.9])}>
        click the map
      </button>
    </div>
  ),
}))

const square = (west: number, south: number, east: number, north: number) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] })
const region = (id: string, name: string, level: Region['level'], boundary: Region['boundary'], parent?: string): Region => ({ id, name, level, boundary, ...(parent ? { parent_region_id: parent } : {}), created_at: '', updated_at: '' })
const sindh = region('r-sindh', 'Sindh', 'province', square(66, 24, 71, 29))
const punjab = region('r-punjab', 'Punjab', 'province', square(70, 30, 75, 34))
const sukkur = region('r-sukkur', 'Sukkur', 'district', square(68.5, 27.4, 69.2, 28), 'r-sindh')
const REGIONS = [sindh, punjab, sukkur]

interface World {
  shelters: Record<string, Shelter[]>
  infrastructure: Record<string, Infrastructure[]>
  essential: Record<string, EssentialLocation[]>
  reports: Record<string, EssentialReportEntry[]>
  requested: { shelters: string[]; infrastructure: string[]; essential: string[]; regions: number; ngos: number; overlay: string[] }
  posted: { infrastructure: unknown[]; essential: unknown[] }
  patched: Array<{ id: string; body: unknown }>
}

const degree = makeShelter('s1', 'Degree College', { managed_by_ngo_id: 'n1', capacity_total: 450, capacity_current: 380 })
const mehar = makeShelter('s2', 'Mehar Complex', { managed_by_ngo_id: 'n2', capacity_total: 300, capacity_current: 300 })
const lahore = makeShelter('s3', 'Lahore Hall', { status: 'closed', certification_status: 'pending' })
const hospital = makeInfrastructure('i1', 'General Hospital', { type: 'hospital', status: 'safe' })
const bridge = makeInfrastructure('i2', 'Indus Bridge', { type: 'bridge', status: 'at_risk' })
const pharmacy = makeEssential('e1', 'Corner Pharmacy', { type: 'pharmacy', current_status: 'closed', status_reported_at: '2026-09-25T09:30:00Z' })
const atm = makeEssential('e2', 'Main ATM', { type: 'atm' })

/** Each test gets its own copies of the rows — the PATCH handler changes them, and a later test must not inherit that. */
const fresh = <T,>(value: T): T => structuredClone(value)

function makeWorld(overrides: Partial<Pick<World, 'shelters' | 'infrastructure' | 'essential' | 'reports'>> = {}): World {
  return {
    shelters: fresh({ 'r-sindh': [degree, mehar], 'r-punjab': [lahore], 'r-sukkur': [degree] }),
    infrastructure: fresh({ 'r-sindh': [hospital, bridge], 'r-punjab': [], 'r-sukkur': [hospital] }),
    essential: fresh({ 'r-sindh': [pharmacy, atm], 'r-punjab': [], 'r-sukkur': [] }),
    reports: fresh({
      e1: [
        { id: 'r1', status: 'open', created_at: '2026-09-25T08:00:00Z' },
        { id: 'r2', status: 'closed', created_at: '2026-09-25T09:30:00Z' },
      ],
    }),
    requested: { shelters: [], infrastructure: [], essential: [], regions: 0, ngos: 0, overlay: [] },
    posted: { infrastructure: [], essential: [] },
    patched: [],
    ...overrides,
  }
}

interface ServeOptions {
  failRegion?: string
  failAllShelters?: boolean
  failRegions?: boolean
  failNgos?: boolean
  postError?: { status: number; error: string }
  patchError?: { status: number; error: string }
  zones?: unknown[]
  zonesFail?: boolean
  reportsFail?: boolean
}

function serve(world: World, options: ServeOptions = {}) {
  const rows = <K extends 'shelters' | 'infrastructure' | 'essential'>(kind: K, log: string[]) =>
    ({ request }: { request: Request }) => {
      const id = new URL(request.url).searchParams.get('region_id') ?? ''
      log.push(id)
      if (options.failAllShelters && kind === 'shelters') return HttpResponse.json({ error: 'boom' }, { status: 500 })
      if (options.failRegion === id) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      return HttpResponse.json(world[kind][id] ?? [])
    }
  server.use(
    http.get('*/regions', () => {
      world.requested.regions += 1
      return options.failRegions ? HttpResponse.json({ error: 'regions down' }, { status: 500 }) : HttpResponse.json(REGIONS)
    }),
    http.get('*/shelters', rows('shelters', world.requested.shelters)),
    http.get('*/infrastructure', rows('infrastructure', world.requested.infrastructure)),
    http.get('*/essential-locations', rows('essential', world.requested.essential)),
    http.get('*/admin/ngos', () => {
      world.requested.ngos += 1
      return options.failNgos
        ? HttpResponse.json({ error: 'nope' }, { status: 500 })
        : HttpResponse.json({ ngos: [{ id: 'n1', name: 'Al-Khidmat' }, { id: 'n2', name: 'Indus Aid' }], total: 2, limit: 100, offset: 0 })
    }),
    http.get('*/admin/map/flood-overlay', ({ request }) => {
      world.requested.overlay.push(new URL(request.url).searchParams.get('bbox') ?? '')
      return options.zonesFail ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json(options.zones ?? [])
    }),
    http.get('*/essential-locations/:id/status-reports', ({ params }) => (options.reportsFail ? HttpResponse.json({ error: 'reports down' }, { status: 500 }) : HttpResponse.json(world.reports[String(params.id)] ?? []))),
    http.post('*/admin/infrastructure', async ({ request }) => {
      const body = (await request.json()) as { name: string; type: Infrastructure['type']; location: Infrastructure['location'] }
      world.posted.infrastructure.push(body)
      if (options.postError) return HttpResponse.json({ error: options.postError.error }, { status: options.postError.status })
      const created = makeInfrastructure('i-new', body.name, { type: body.type, location: body.location, status: 'safe' })
      world.infrastructure['r-sindh'] = [...(world.infrastructure['r-sindh'] ?? []), created]
      return HttpResponse.json(created, { status: 201 })
    }),
    http.post('*/admin/essential-locations', async ({ request }) => {
      const body = (await request.json()) as { name: string; type: EssentialLocation['type']; location: EssentialLocation['location'] }
      world.posted.essential.push(body)
      if (options.postError) return HttpResponse.json({ error: options.postError.error }, { status: options.postError.status })
      const created = makeEssential('e-new', body.name, { type: body.type, location: body.location })
      world.essential['r-sindh'] = [...(world.essential['r-sindh'] ?? []), created]
      return HttpResponse.json(created, { status: 201 })
    }),
    http.patch('*/admin/infrastructure/:id/status', async ({ params, request }) => {
      const body = (await request.json()) as { status: Infrastructure['status'] }
      world.patched.push({ id: String(params.id), body })
      if (options.patchError) return HttpResponse.json({ error: options.patchError.error }, { status: options.patchError.status })
      let updated: Infrastructure | undefined
      for (const list of Object.values(world.infrastructure)) {
        for (const item of list) {
          if (item.id !== params.id) continue
          item.status = body.status
          updated = item
        }
      }
      return HttpResponse.json(updated)
    }),
  )
}

function Where() {
  const location = useLocation()
  return <output data-testid="where">{location.search}</output>
}

function renderPage(path = '/admin/facilities') {
  // The app's own freshness window (30 s): what a tab has read is not read again when the tab is shown again.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <FacilitiesPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
const tab = (name: string) => screen.getByRole('tab', { name })
const uniqueSorted = (list: string[]) => [...new Set(list)].sort()

describe('FacilitiesPage — reading', () => {
  it('opens on Shelters and asks once for each top-level region — never a district — showing every shelter once, by name', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()

    expect(await screen.findByText('Degree College', { selector: 'p' })).toBeInTheDocument()
    expect(names()).toEqual(['Degree College', 'Lahore Hall', 'Mehar Complex'])
    expect(uniqueSorted(world.requested.shelters)).toEqual(['r-punjab', 'r-sindh'])
    expect(world.requested.shelters).toHaveLength(2)
    expect(screen.getByText('3 shelters in every region')).toBeInTheDocument()
    expect(tab('Shelters')).toHaveAttribute('aria-selected', 'true')
  })

  it('names each shelter\'s organisation from the admin NGO list, as a link to its page', async () => {
    serve(makeWorld())
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    expect(await screen.findByRole('link', { name: 'Al-Khidmat' })).toHaveAttribute('href', '/admin/ngos/n1')
    expect(screen.getByRole('link', { name: 'Indus Aid' })).toHaveAttribute('href', '/admin/ngos/n2')
    expect(screen.getByText('No organisation')).toBeInTheDocument()
  })

  it('carries on with an unnamed organisation, and says so, when the NGO list cannot be read', async () => {
    serve(makeWorld(), { failNgos: true })
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    expect(await screen.findByText(/Organisation names couldn't be loaded/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'An organisation' })).toHaveLength(2)
  })

  it('reads only the tab that is showing — and shares what it has read (no second request for a region already asked)', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    expect(world.requested.infrastructure).toEqual([])
    expect(world.requested.essential).toEqual([])

    await userEvent.click(tab('Infrastructure'))
    expect(await screen.findByText('General Hospital', { selector: 'p' })).toBeInTheDocument()
    expect(uniqueSorted(world.requested.infrastructure)).toEqual(['r-punjab', 'r-sindh'])
    expect(world.requested.essential).toEqual([])
    expect(world.requested.regions).toBe(1)

    await userEvent.click(tab('Essential locations'))
    expect(await screen.findByText('Corner Pharmacy', { selector: 'p' })).toBeInTheDocument()

    await userEvent.click(tab('Infrastructure'))
    await screen.findByText('General Hospital', { selector: 'p' })
    expect(world.requested.infrastructure).toHaveLength(2)
  })

  it('keeps the tab in the URL, opens on a tab named there, and starts a tab with no filters', async () => {
    serve(makeWorld())
    renderPage('/admin/facilities?tab=infrastructure&type=bridge&status=at_risk&q=indus')
    expect(await screen.findByText('Indus Bridge', { selector: 'p' })).toBeInTheDocument()
    expect(names()).toEqual(['Indus Bridge'])
    expect(screen.getByRole('searchbox')).toHaveValue('indus')

    await userEvent.click(tab('Essential locations'))
    await screen.findByText('Corner Pharmacy', { selector: 'p' })
    expect(screen.getByTestId('where')).toHaveTextContent('?tab=essential')
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(names()).toEqual(['Corner Pharmacy', 'Main ATM'])
  })

  it('ignores a type, status or tab it does not know', async () => {
    serve(makeWorld())
    renderPage('/admin/facilities?tab=nonsense&type=zzz&status=zzz')
    await screen.findByText('Degree College', { selector: 'p' })
    expect(names()).toHaveLength(3)
  })

  it('is a real tablist — arrow keys move between the tabs', async () => {
    serve(makeWorld())
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    tab('Shelters').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tab('Infrastructure')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Infrastructure')).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'facilities-tab-infrastructure')
  })
})

describe('FacilitiesPage — the region scope', () => {
  it('asks only for a chosen region — a district no one has read yet — and, cleared, is back to every top-level region without asking again', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    expect(world.requested.shelters).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: /Choose a region/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose a region' })
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search regions' }), 'Sukkur')
    await userEvent.click(await within(dialog).findByRole('radio', { name: /Sukkur/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show this region' }))

    await waitFor(() => expect(names()).toEqual(['Degree College']))
    expect(world.requested.shelters.slice(2)).toEqual(['r-sukkur'])
    expect(screen.getByText('1 shelter in Sindh › Sukkur')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('region=r-sukkur')

    await userEvent.click(screen.getByRole('button', { name: 'Show all regions' }))
    await waitFor(() => expect(names()).toHaveLength(3))
    expect(screen.getByTestId('where')).not.toHaveTextContent('region=')
    expect(world.requested.shelters).toHaveLength(3)
  })

  it('opens on the region named in the URL — one request for it and nothing for the others', async () => {
    const world = makeWorld()
    serve(world)
    renderPage('/admin/facilities?region=r-sindh')
    expect(await screen.findByText('Degree College', { selector: 'p' })).toBeInTheDocument()
    expect(world.requested.shelters).toEqual(['r-sindh'])
    expect(screen.getByRole('button', { name: /Region: Sindh/ })).toBeInTheDocument()
  })

  it('treats a region it does not know as "every region" and says so, rather than sending it to the API', async () => {
    const world = makeWorld()
    serve(world)
    renderPage('/admin/facilities?region=not-a-region')
    await screen.findByText('Degree College', { selector: 'p' })
    expect(await screen.findByText(/That region isn't on the platform, so every region is shown/)).toBeInTheDocument()
    expect(world.requested.shelters).not.toContain('not-a-region')
  })

  it('asks for nothing until the region list has loaded, and shows a retry if it never does', async () => {
    const world = makeWorld()
    serve(world, { failRegions: true })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('regions down')
    expect(world.requested.shelters).toEqual([])
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('FacilitiesPage — finding things', () => {
  it('filters by type and by status with counts that follow each other, and searches — by name, and by organisation', async () => {
    serve(makeWorld())
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    const status = screen.getByRole('group', { name: 'Status' })
    expect(within(status).getAllByRole('button').map((b) => b.textContent)).toEqual(['All3', 'Open2', 'Closed1', 'At capacity1', 'Pending certification1'])

    await userEvent.click(within(status).getByRole('button', { name: /^At capacity/ }))
    expect(names()).toEqual(['Mehar Complex'])
    expect(screen.getByText('1 of 3 shelters in every region')).toBeInTheDocument()
    await userEvent.click(within(status).getByRole('button', { name: /^All/ }))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search shelters' }), 'indus')
    await waitFor(() => expect(names()).toEqual(['Mehar Complex']))
  })

  it('says nothing matches, with a way back', async () => {
    serve(makeWorld())
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByRole('heading', { name: 'Nothing matches' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(names()).toHaveLength(3)
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('pages through what is left, 20 at a time, and steps back to the last real page when a filter shrinks the list', async () => {
    const many = Array.from({ length: 45 }, (_, i) => makeInfrastructure(`i${i}`, `Facility ${String(i).padStart(2, '0')}`, { type: i % 2 === 0 ? 'hospital' : 'bridge' }))
    serve(makeWorld({ infrastructure: { 'r-sindh': many, 'r-punjab': [], 'r-sukkur': [] } }))
    renderPage('/admin/facilities?tab=infrastructure&page=3')
    await screen.findByText('Facility 40', { selector: 'p' })
    expect(names()).toHaveLength(5)
    expect(screen.getByText(/41–45 of 45/)).toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('group', { name: 'Type' })).getByRole('button', { name: /^Bridge/ }))
    await waitFor(() => expect(screen.getByText(/1–20 of 22/)).toBeInTheDocument())
    expect(names()).toHaveLength(20)
  })
})

describe('FacilitiesPage — load states', () => {
  it('shows an empty state per tab: none for shelters to add, an action for the other two', async () => {
    serve(makeWorld({ shelters: {}, infrastructure: {}, essential: {} }))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'No shelters in any region' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Add/ })).not.toBeInTheDocument()

    await userEvent.click(tab('Infrastructure'))
    expect(await screen.findByRole('heading', { name: 'No infrastructure items in any region' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add infrastructure' })).toHaveLength(2)
    await userEvent.click(tab('Essential locations'))
    expect(await screen.findByRole('heading', { name: 'No essential locations in any region' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add essential location' })).toHaveLength(2)
  })

  it('shows a failed read with a retry that recovers', async () => {
    const world = makeWorld()
    let failing = true
    server.use(
      http.get('*/regions', () => HttpResponse.json(REGIONS)),
      http.get('*/shelters', () => (failing ? HttpResponse.json({ error: 'shelters down' }, { status: 500 }) : HttpResponse.json([degree]))),
      http.get('*/admin/ngos', () => HttpResponse.json({ ngos: [], total: 0 })),
    )
    void world
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('shelters down')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Degree College', { selector: 'p' })).toBeInTheDocument()
  })

  it('shows what did load, with a notice that some regions failed, rather than a list that looks complete', async () => {
    serve(makeWorld(), { failRegion: 'r-punjab' })
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    expect(await screen.findByText("One region couldn't be loaded, so this list may be missing places.")).toBeInTheDocument()
    expect(names()).toEqual(['Degree College', 'Mehar Complex'])
  })

  it('always says that a place outside every region cannot be listed', async () => {
    serve(makeWorld())
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    expect(screen.getByText(/A place outside every region can't be listed by any route/)).toBeInTheDocument()
    expect(screen.getByText(/Shelters are managed by the organisation that runs them/)).toBeInTheDocument()
  })
})

describe('FacilitiesPage — shelters are read-only', () => {
  it('offers no Add, no edit and no status change — only the location', async () => {
    serve(makeWorld())
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    expect(screen.queryByRole('button', { name: /^Add/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit|^Update/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Location of/ })).toHaveLength(3)
  })
})

describe('FacilitiesPage — adding', () => {
  async function openInfrastructureDrawer() {
    await userEvent.click(tab('Infrastructure'))
    await screen.findByText('General Hospital', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Add infrastructure' }))
    return screen.getByRole('dialog', { name: 'Add infrastructure' })
  }

  it('adds infrastructure: every gap named and nothing sent when empty; then the request in GeoJSON order, closed, a notice saying where it is, and the list refreshed', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    const drawer = await openInfrastructureDrawer()

    await userEvent.click(within(drawer).getByRole('button', { name: 'Add infrastructure' }))
    expect(await within(drawer).findByText('Enter the name.')).toBeInTheDocument()
    expect(world.posted.infrastructure).toEqual([])

    await userEvent.type(within(drawer).getByLabelText('Name'), 'Sukkur Barrage')
    await userEvent.click(within(drawer).getByText('Bridge'))
    await userEvent.click(within(drawer).getByRole('button', { name: 'click the map' }))
    expect(await screen.findByText(/citizens looking at that region will see it/)).toHaveTextContent('In Sindh')
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add infrastructure' }))

    expect(await screen.findByText('Sukkur Barrage was added. It is in Sindh › Sukkur.')).toBeInTheDocument()
    expect(world.posted.infrastructure).toEqual([{ name: 'Sukkur Barrage', type: 'bridge', location: { type: 'Point', coordinates: [68.9, 27.7] } }])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Sukkur Barrage', { selector: 'p' })).toBeInTheDocument()
  })

  it('says where the point is even when saved straight after typing, before the region note has settled', async () => {
    serve(makeWorld())
    renderPage()
    const drawer = await openInfrastructureDrawer()
    await userEvent.type(within(drawer).getByLabelText('Name'), 'Quick Bridge')
    await userEvent.type(within(drawer).getByLabelText('Latitude'), '27.7')
    await userEvent.type(within(drawer).getByLabelText('Longitude'), '68.9')
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add infrastructure' }))
    expect(await screen.findByText('Quick Bridge was added. It is in Sindh › Sukkur.')).toBeInTheDocument()
  })

  it('refuses a point in no region — says so before saving, sends nothing, and tells the latitude field why', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    const drawer = await openInfrastructureDrawer()
    await waitFor(() => expect(within(drawer).getByTestId('areas')).not.toHaveTextContent('none'))
    await userEvent.type(within(drawer).getByLabelText('Name'), 'Sea Platform')
    await userEvent.type(within(drawer).getByLabelText('Latitude'), '5')
    await userEvent.type(within(drawer).getByLabelText('Longitude'), '60')
    expect(await within(drawer).findByText(/outside the shaded areas, so it can't be saved/)).toHaveTextContent('To cover a new area, add a region under Regions first.')
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add infrastructure' }))
    expect(await within(drawer).findByText('Pick a spot inside a shaded area of the map.')).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Latitude')).toHaveFocus()
    expect(world.posted.infrastructure).toEqual([])
    expect(screen.getByRole('dialog', { name: 'Add infrastructure' })).toBeInTheDocument()
  })

  it('refuses it for an essential location too, and hands the regions to the map', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    await userEvent.click(tab('Essential locations'))
    await screen.findByText('Corner Pharmacy', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Add essential location' }))
    const drawer = screen.getByRole('dialog', { name: 'Add essential location' })
    await waitFor(() => expect(within(drawer).getByTestId('areas')).toHaveTextContent('Sindh'))
    await userEvent.type(within(drawer).getByLabelText('Name'), 'Sea ATM')
    await userEvent.type(within(drawer).getByLabelText('Latitude'), '5')
    await userEvent.type(within(drawer).getByLabelText('Longitude'), '60')
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add essential location' }))
    expect(await within(drawer).findByText('Pick a spot inside a shaded area of the map.')).toBeInTheDocument()
    expect(world.posted.essential).toEqual([])
  })

  it('asks for the regions again before refusing, and names the region it finds — one added since the list was fetched', async () => {
    const world = makeWorld()
    serve(world)
    const north = region('north', 'North', 'province', square(60, 5, 62, 7))
    let asked = 0
    server.use(http.get('*/regions', () => HttpResponse.json(++asked === 1 ? REGIONS : [...REGIONS, north])))
    renderPage()
    const drawer = await openInfrastructureDrawer()
    await waitFor(() => expect(within(drawer).getByTestId('areas')).not.toHaveTextContent('none'))
    await userEvent.type(within(drawer).getByLabelText('Name'), 'Far Bridge')
    await userEvent.type(within(drawer).getByLabelText('Latitude'), '6')
    await userEvent.type(within(drawer).getByLabelText('Longitude'), '61')
    expect(await within(drawer).findByText(/outside the shaded areas/)).toBeInTheDocument() // as far as the list it holds can tell
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add infrastructure' }))
    expect(await screen.findByText('Far Bridge was added. It is in North.')).toBeInTheDocument()
    expect(world.posted.infrastructure).toHaveLength(1)
  })

  it("keeps the drawer open with the server's words when the add is refused", async () => {
    serve(makeWorld(), { postError: { status: 403, error: 'insufficient permissions' } })
    renderPage()
    const drawer = await openInfrastructureDrawer()
    await userEvent.type(within(drawer).getByLabelText('Name'), 'X')
    await userEvent.click(within(drawer).getByRole('button', { name: 'click the map' }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add infrastructure' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('insufficient permissions')
  })

  it('opens empty every time', async () => {
    serve(makeWorld())
    renderPage()
    let drawer = await openInfrastructureDrawer()
    await userEvent.type(within(drawer).getByLabelText('Name'), 'Half done')
    await userEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add infrastructure' }))
    drawer = screen.getByRole('dialog', { name: 'Add infrastructure' })
    expect(within(drawer).getByLabelText('Name')).toHaveValue('')
  })

  it('adds an essential location — a pharmacy — with no status in the request', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    await userEvent.click(tab('Essential locations'))
    await screen.findByText('Corner Pharmacy', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Add essential location' }))
    const drawer = screen.getByRole('dialog', { name: 'Add essential location' })
    await userEvent.type(within(drawer).getByLabelText('Name'), 'Night Pharmacy')
    await userEvent.click(within(drawer).getByText('Pharmacy'))
    await userEvent.click(within(drawer).getByRole('button', { name: 'click the map' }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Add essential location' }))
    expect(await screen.findByText(/Night Pharmacy was added/)).toBeInTheDocument()
    expect(world.posted.essential).toEqual([{ name: 'Night Pharmacy', type: 'pharmacy', location: { type: 'Point', coordinates: [68.9, 27.7] } }])
    expect(await screen.findByText('Night Pharmacy', { selector: 'p' })).toBeInTheDocument()
  })
})

describe('FacilitiesPage — infrastructure status', () => {
  async function openStatus(name: string) {
    await userEvent.click(tab('Infrastructure'))
    await screen.findByText('General Hospital', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: `Update status of ${name}` }))
    return screen.getByRole('dialog', { name: 'Update status' })
  }

  it('sets a new status — the PATCH carries only the status — closes, says what happened, and shows the change', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    const dialog = await openStatus('General Hospital')
    await userEvent.click(within(dialog).getByText('Damaged'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save status' }))

    expect(await screen.findByText('General Hospital is now damaged.')).toBeInTheDocument()
    expect(world.patched).toEqual([{ id: 'i1', body: { status: 'damaged' } }])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(within(screen.getAllByRole('listitem')[0]).getByText('Damaged')).toBeInTheDocument())
  })

  it('lets the status be confirmed as it is — a real request that says it was "confirmed"', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    const dialog = await openStatus('Indus Bridge')
    expect(within(dialog).getByText(/already its status/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm status' }))
    expect(await screen.findByText('Indus Bridge was confirmed as at risk.')).toBeInTheDocument()
    expect(world.patched).toEqual([{ id: 'i2', body: { status: 'at_risk' } }])
  })

  it("keeps the dialog open with the server's words when the change is refused", async () => {
    serve(makeWorld(), { patchError: { status: 403, error: 'insufficient permissions' } })
    renderPage()
    const dialog = await openStatus('General Hospital')
    await userEvent.click(within(dialog).getByText('At risk'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save status' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('insufficient permissions')
  })

  it('says the item is gone — and closes — when the change meets a 404', async () => {
    serve(makeWorld(), { patchError: { status: 404, error: 'infrastructure not found' } })
    renderPage()
    const dialog = await openStatus('General Hospital')
    await userEvent.click(within(dialog).getByText('Damaged'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save status' }))
    expect(await screen.findByText(/General Hospital no longer exists, so its status wasn't changed. The list has been refreshed./)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on the item\'s own status each time, not the last one chosen', async () => {
    serve(makeWorld())
    renderPage()
    let dialog = await openStatus('General Hospital')
    await userEvent.click(within(dialog).getByText('Damaged'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Update status of Indus Bridge' }))
    dialog = screen.getByRole('dialog', { name: 'Update status' })
    expect(within(dialog).getByRole('radio', { name: /At risk/ })).toBeChecked()
  })
})

describe('FacilitiesPage — essential locations\' report log', () => {
  it('shows the log newest first, with the one citizens see marked', async () => {
    serve(makeWorld())
    renderPage()
    await userEvent.click(tab('Essential locations'))
    await screen.findByText('Corner Pharmacy', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Status reports for Corner Pharmacy' }))
    const dialog = await screen.findByRole('dialog', { name: 'Status reports' })
    const entries = await within(dialog).findAllByRole('listitem')
    expect(entries[0]).toHaveTextContent('Closed')
    expect(entries[0]).toHaveTextContent('shown now')
    expect(entries[1]).toHaveTextContent('Open')
  })

  it('says a place nobody has reported on has no reports', async () => {
    serve(makeWorld())
    renderPage()
    await userEvent.click(tab('Essential locations'))
    await screen.findByText('Main ATM', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Status reports for Main ATM' }))
    expect(await screen.findByText(/No one has reported on this place yet/)).toBeInTheDocument()
  })

  it('shows a failed read with a retry', async () => {
    serve(makeWorld(), { reportsFail: true })
    renderPage()
    await userEvent.click(tab('Essential locations'))
    await screen.findByText('Main ATM', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Status reports for Main ATM' }))
    const dialog = await screen.findByRole('dialog', { name: 'Status reports' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('reports down')
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('FacilitiesPage — location', () => {
  it('opens a map of the place — with no locate button, and the admin overlay\'s zones — and says it is not inside a zone', async () => {
    const world = makeWorld()
    serve(world, { zones: [] })
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Location of Degree College' }))
    const dialog = await screen.findByRole('dialog', { name: 'Degree College' })
    expect(within(dialog).getByTestId('places')).toHaveTextContent('Degree College')
    expect(within(dialog).getByTestId('locate')).toHaveTextContent('false')
    expect(await within(dialog).findByText('Not inside any active hazard zone.')).toBeInTheDocument()
    expect(world.requested.overlay.length).toBeGreaterThan(0)
  })

  it('says it is inside a zone — worst first — when the point lies in one, with a link to that zone', async () => {
    // The default test shelter sits at 27.7°N, 68.86°E; both zones' boxes hold it (strictly inside: a point exactly on a zone's edge is outside, as the server counts it).
    const high = { ...makeHazard('z-high', 'high', 0.87, [68.8, 27.65]) } // the shelter (27.7°N, 68.86°E) is well inside its box, not on an edge
    const low = { ...makeHazard('z-low', 'low', 0.1, [68.8, 27.6]), boundary: { type: 'Polygon', coordinates: [[[68.7, 27.5], [69.1, 27.5], [69.1, 27.9], [68.7, 27.9], [68.7, 27.5]]] } }
    serve(makeWorld(), { zones: [low, high] })
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Location of Degree College' }))
    const dialog = await screen.findByRole('dialog', { name: 'Degree College' })
    expect(await within(dialog).findByText(/Inside a/)).toHaveTextContent('Inside a high-risk flood zone — 87% model confidence.')
    expect(within(dialog).getByRole('link', { name: 'View zone' })).toHaveAttribute('href', '/admin/hazard-zones/z-high')
  })

  it('asks the overlay again every time it is opened — a zone resolved in the meantime is not still reported', async () => {
    const high = { ...makeHazard('z-high', 'high', 0.87, [68.8, 27.65]) } // the shelter (27.7°N, 68.86°E) is well inside its box, not on an edge
    serve(makeWorld(), { zones: [high] })
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Location of Degree College' }))
    let dialog = await screen.findByRole('dialog', { name: 'Degree College' })
    expect(await within(dialog).findByText(/Inside a/)).toHaveTextContent('Inside a high-risk flood zone')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Degree College' })).not.toBeInTheDocument())

    server.use(http.get('*/admin/map/flood-overlay', () => HttpResponse.json([]))) // resolved while the dialog was shut
    await userEvent.click(screen.getByRole('button', { name: 'Location of Degree College' }))
    dialog = await screen.findByRole('dialog', { name: 'Degree College' })
    expect(await within(dialog).findByText('Not inside any active hazard zone.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Inside a/)).not.toBeInTheDocument()
  })

  it('does not claim "clear" when the zones could not be checked', async () => {
    serve(makeWorld(), { zonesFail: true })
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Location of Degree College' }))
    const dialog = await screen.findByRole('dialog', { name: 'Degree College' })
    expect(await within(dialog).findByText("Couldn't check the hazard zones around this place.")).toBeInTheDocument()
    expect(within(dialog).queryByText('Not inside any active hazard zone.')).not.toBeInTheDocument()
  })

  it('says which region the place is in, from the region list', async () => {
    serve(makeWorld())
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    await userEvent.click(screen.getByRole('button', { name: 'Location of Degree College' }))
    const dialog = await screen.findByRole('dialog', { name: 'Degree College' })
    expect(await within(dialog).findByText(/citizens looking at that region will see it/)).toHaveTextContent('In Sindh')
  })

  it('asks for no overlay until a place is chosen', async () => {
    const world = makeWorld()
    serve(world)
    renderPage()
    await screen.findByText('Degree College', { selector: 'p' })
    expect(world.requested.overlay).toEqual([])
  })
})

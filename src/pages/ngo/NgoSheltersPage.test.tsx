import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore, type Role } from '@/store/auth'
import type { Region } from '@/api/geo'
import type { Shelter } from '@/api/facilities'
import type { LocationPickerProps } from '@/features/map/LocationPicker'
import { makeShelter } from '@/features/map/testMap'
import { NgoSheltersPage } from './NgoSheltersPage'

// The real picker is a Leaflet map (with its own tests); the stub shows the pin it was handed and lets a test "click the map".
vi.mock('@/features/map/LocationPicker', () => ({
  LocationPicker: (props: LocationPickerProps) => (
    <div data-testid="picker">
      <output data-testid="pin">{props.value ? props.value.join(',') : 'none'}</output>
      <output data-testid="areas">{props.areas ? props.areas.map((area) => area.name).join(',') : 'none'}</output>
      <button type="button" onClick={() => props.onChange([24.9, 67.1])}>
        click the map
      </button>
    </div>
  ),
}))

const NGO = 'ngo-1'
const degree = makeShelter('s1', 'Degree College', { capacity_total: 450, capacity_current: 380, managed_by_ngo_id: NGO })
const mehar = makeShelter('s2', 'Mehar Sports Complex', { capacity_total: 300, capacity_current: 300, managed_by_ngo_id: NGO })
const johi = makeShelter('s3', 'GBHS Johi', { capacity_total: 200, capacity_current: 20, status: 'closed', certification_status: 'pending', managed_by_ngo_id: NGO })

const square = (west: number, south: number, east: number, north: number) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] })
const sindh: Region = { id: 'r1', name: 'Sindh', level: 'province', boundary: square(66, 24, 68, 26), created_at: '', updated_at: '' }

interface World {
  shelters: Shelter[]
  requests: { posted: unknown[]; occupancy: Array<{ id: string; body: unknown }>; patched: Array<{ id: string; body: unknown }>; listed: number; regionScoped: number }
}

/** An in-memory organisation: the list, and the three writes acting on it as the real API does. */
function serve(initial: Shelter[], options: { failList?: boolean; occupancyError?: { status: number; error: string }; patchError?: { status: number; error: string }; registerError?: { status: number; error: string }; regions?: Region[] } = {}) {
  const world: World = { shelters: [...initial], requests: { posted: [], occupancy: [], patched: [], listed: 0, regionScoped: 0 } }
  server.use(
    http.get('*/ngo/shelters', ({ request }) => {
      world.requests.listed += 1
      if (new URL(request.url).searchParams.has('region_id')) world.requests.regionScoped += 1
      return options.failList && world.requests.listed === 1 ? HttpResponse.json({ error: 'account is not affiliated with an ngo' }, { status: 403 }) : HttpResponse.json(world.shelters)
    }),
    http.post('*/ngo/shelters', async ({ request }) => {
      const body = (await request.json()) as { name: string; type: Shelter['type']; location: Shelter['location']; capacity_total: number }
      world.requests.posted.push(body)
      if (options.registerError) return HttpResponse.json({ error: options.registerError.error }, { status: options.registerError.status })
      const created = makeShelter('new-1', body.name, { type: body.type, location: body.location, capacity_total: body.capacity_total, capacity_current: 0, certification_status: 'pending', status: 'open', managed_by_ngo_id: NGO })
      world.shelters.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.patch('*/shelters/:id/occupancy', async ({ params, request }) => {
      const body = (await request.json()) as { capacity_current: number }
      world.requests.occupancy.push({ id: String(params.id), body })
      if (options.occupancyError) return HttpResponse.json({ error: options.occupancyError.error }, { status: options.occupancyError.status })
      const shelter = world.shelters.find((s) => s.id === params.id)!
      shelter.capacity_current = body.capacity_current
      return HttpResponse.json(shelter)
    }),
    http.patch('*/shelters/:id', async ({ params, request }) => {
      const body = (await request.json()) as Partial<Shelter>
      world.requests.patched.push({ id: String(params.id), body })
      if (options.patchError) return HttpResponse.json({ error: options.patchError.error }, { status: options.patchError.status })
      const shelter = world.shelters.find((s) => s.id === params.id)!
      Object.assign(shelter, body)
      return HttpResponse.json(shelter)
    }),
    http.get('*/regions', () => HttpResponse.json(options.regions ?? [sindh])),
  )
  return world
}

function signIn(role: Role = 'ngo_admin') {
  useAuthStore.getState().setAuth('token', { id: 'a1', email: 'admin@ngo.org', role, emailVerified: true, profileComplete: true })
}

function Where() {
  return <output data-testid="where">{useLocation().search}</output>
}

function renderPage(path = '/ngo/shelters') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NgoSheltersPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const rowOf = (name: string) => screen.getByText(name, { selector: 'p' }).closest('li') as HTMLElement

describe('NgoSheltersPage', () => {
  afterEach(() => useAuthStore.getState().clearAuth())

  describe('the list', () => {
    it('lists what the organisation manages by name — no region asked for — with the totals in the header and the KPI cards', async () => {
      const world = serve([johi, mehar, degree])
      signIn()
      renderPage()

      expect(await screen.findByText('Degree College', { selector: 'p' })).toBeInTheDocument()
      expect(screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)).toEqual(['Degree College', 'GBHS Johi', 'Mehar Sports Complex'])
      expect(screen.getByText('3 registered · 700 / 950 occupied · 1 closed')).toBeInTheDocument()
      const totals = screen.getByLabelText('Shelter totals')
      expect(within(totals).getByText('At capacity').nextElementSibling).toHaveTextContent('1')
      expect(within(totals).getByText('Pending certification').nextElementSibling).toHaveTextContent('1')
      expect(world.requests.regionScoped).toBe(0)
    })

    it('shows an empty state for an organisation with nothing — an invitation to register for an admin, an explanation for a volunteer', async () => {
      serve([])
      signIn()
      const { unmount } = renderPage()
      expect(await screen.findByRole('heading', { name: 'No shelters yet' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Register a shelter' })).toBeInTheDocument()
      unmount()

      useAuthStore.getState().clearAuth()
      signIn('ngo_volunteer')
      renderPage()
      expect(await screen.findByRole('heading', { name: 'No shelters yet' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Register/ })).not.toBeInTheDocument()
    })

    it('shows a failed load with a retry that recovers', async () => {
      serve([degree], { failList: true })
      signIn()
      renderPage()
      expect(await screen.findByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('Degree College', { selector: 'p' })).toBeInTheDocument()
    })
  })

  describe('finding shelters', () => {
    it('filters with the pills — each with its count — and searches by name, and the two combine', async () => {
      serve([degree, mehar, johi])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })

      const group = screen.getByRole('group', { name: 'Filter shelters' })
      expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All3', 'Open2', 'Closed1', 'At capacity1', 'Pending certification1'])

      await userEvent.click(within(group).getByRole('button', { name: /^At capacity/ }))
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByText('Mehar Sports Complex')).toBeInTheDocument()

      await userEvent.click(within(group).getByRole('button', { name: /^All/ }))
      await userEvent.type(screen.getByRole('searchbox'), 'johi')
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      // The pills count within the search, so none promises rows the search has hidden.
      expect(within(group).getByRole('button', { name: /^Open/ })).toHaveTextContent('Open0')
      expect(within(group).getByRole('button', { name: /^Closed/ })).toHaveTextContent('Closed1')
    })

    it('says so — with a way back — when nothing matches', async () => {
      serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.type(screen.getByRole('searchbox'), 'zzz')
      expect(screen.getByRole('heading', { name: 'No shelters match' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Show all shelters' }))
      expect(screen.getByText('Degree College', { selector: 'p' })).toBeInTheDocument()
      expect(screen.getByRole('searchbox')).toHaveValue('')
    })

    it('reads the view from the URL, and writes only what differs from the default back to it', async () => {
      serve([degree, mehar, johi])
      signIn()
      renderPage('/ngo/shelters?show=full&q=mehar')
      expect(await screen.findByText('Mehar Sports Complex', { selector: 'p' })).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
      expect(screen.getByRole('searchbox')).toHaveValue('mehar')

      await userEvent.click(screen.getByRole('button', { name: /^All/ }))
      await userEvent.clear(screen.getByRole('searchbox'))
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^$/))
    })

    it('ignores a filter name it does not know', async () => {
      serve([degree, johi])
      signIn()
      renderPage('/ngo/shelters?show=nonsense')
      await screen.findByText('Degree College', { selector: 'p' })
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })
  })

  describe('updating occupancy', () => {
    it('opens an editor inside the row, saves a new number, and shows it — with a notice', async () => {
      const world = serve([degree, mehar])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })

      await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Degree College' }))
      const row = rowOf('Degree College')
      const field = within(row).getByRole('textbox', { name: 'People currently at Degree College' })
      expect(field).toHaveValue('380')
      await userEvent.clear(field)
      await userEvent.type(field, '412')
      expect(within(row).getByText(/of 450 · was 380 ·/)).toHaveTextContent('92% after save')
      await userEvent.click(within(row).getByRole('button', { name: 'Save occupancy' }))

      expect(await screen.findByText('Occupancy at Degree College is now 412 / 450.')).toBeInTheDocument()
      expect(world.requests.occupancy).toEqual([{ id: 's1', body: { capacity_current: 412 } }])
      expect(within(rowOf('Degree College')).queryByRole('textbox')).not.toBeInTheDocument()
      expect(within(rowOf('Degree College')).getByRole('progressbar', { name: 'Occupancy of Degree College' })).toHaveAttribute('aria-valuenow', '92')
      // The list is refetched for the server's version rather than trusted.
      await waitFor(() => expect(world.requests.listed).toBeGreaterThan(1))
    })

    it('has one editor open at a time, and its own button closes it', async () => {
      serve([degree, mehar])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Degree College' }))
      await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Mehar Sports Complex' }))
      expect(screen.getAllByRole('textbox', { name: /^People currently at/ })).toHaveLength(1)
      expect(screen.getByRole('textbox', { name: 'People currently at Mehar Sports Complex' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Mehar Sports Complex' }))
      expect(screen.queryByRole('textbox', { name: /^People currently at/ })).not.toBeInTheDocument()
    })

    it('cancels without a request, and a number over the capacity never leaves the browser', async () => {
      const world = serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Degree College' }))
      const field = screen.getByRole('textbox', { name: /People currently at/ })
      await userEvent.clear(field)
      await userEvent.type(field, '451{Enter}')
      expect(screen.getByRole('button', { name: 'Save occupancy' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('textbox', { name: /^People currently at/ })).not.toBeInTheDocument()
      expect(world.requests.occupancy).toEqual([])
    })

    it("puts the keyboard back on the row's own button when the editor closes — by Cancel, by Escape or by saving", async () => {
      serve([degree, mehar])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      const button = () => screen.getByRole('button', { name: 'Update occupancy for Degree College' })

      await userEvent.click(button())
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(button()).toHaveFocus())

      await userEvent.click(button())
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(button()).toHaveFocus())

      await userEvent.click(button())
      const field = screen.getByRole('textbox', { name: /People currently at/ })
      await userEvent.clear(field)
      await userEvent.type(field, '390{Enter}')
      expect(await screen.findByText(/Occupancy at Degree College is now 390/)).toBeInTheDocument()
      await waitFor(() => expect(button()).toHaveFocus())
    })

    it("keeps the editor open with the server's own words when the save is refused", async () => {
      serve([degree], { occupancyError: { status: 400, error: 'capacity_current must be between 0 and capacity_total' } })
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Degree College' }))
      const field = screen.getByRole('textbox', { name: /People currently at/ })
      await userEvent.clear(field)
      await userEvent.type(field, '400')
      await userEvent.click(screen.getByRole('button', { name: 'Save occupancy' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('capacity_current must be between 0 and capacity_total')
      expect(screen.getByRole('textbox', { name: /People currently at/ })).toHaveValue('400')
    })

    it('says the shelter is gone — and closes the editor — when the save meets a 404', async () => {
      serve([degree], { occupancyError: { status: 404, error: 'shelter not found' } })
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Degree College' }))
      const field = screen.getByRole('textbox', { name: /People currently at/ })
      await userEvent.clear(field)
      await userEvent.type(field, '100')
      await userEvent.click(screen.getByRole('button', { name: 'Save occupancy' }))
      expect(await screen.findByText(/Degree College no longer exists, so its occupancy wasn't saved/)).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: /^People currently at/ })).not.toBeInTheDocument()
    })

    it('is available to a volunteer, who is offered nothing else', async () => {
      const world = serve([degree])
      signIn('ngo_volunteer')
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      expect(screen.queryByRole('button', { name: /Register shelter/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Degree College' }))
      const field = screen.getByRole('textbox', { name: /People currently at/ })
      await userEvent.clear(field)
      await userEvent.type(field, '381')
      await userEvent.click(screen.getByRole('button', { name: 'Save occupancy' }))
      expect(await screen.findByText(/Occupancy at Degree College is now 381 \/ 450/)).toBeInTheDocument()
      expect(world.requests.occupancy).toHaveLength(1)
    })
  })

  describe('editing status and certification', () => {
    it('sends only what changed, and shows it', async () => {
      const world = serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })

      await userEvent.click(screen.getByRole('button', { name: 'Edit Degree College' }))
      const drawer = screen.getByRole('dialog', { name: 'Edit shelter' })
      expect(within(drawer).getByRole('button', { name: 'Save changes' })).toBeDisabled()
      await userEvent.click(within(drawer).getByRole('radio', { name: /^Closed/ }))
      await userEvent.click(within(drawer).getByRole('button', { name: 'Save changes' }))

      expect(await screen.findByText('Degree College was updated.')).toBeInTheDocument()
      expect(world.requests.patched).toEqual([{ id: 's1', body: { status: 'closed' } }])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(within(rowOf('Degree College')).getByText('Closed')).toBeInTheDocument()
    })

    it("keeps the drawer open with the server's words when the save is refused", async () => {
      serve([degree], { patchError: { status: 403, error: 'this shelter is not managed by your ngo' } })
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Edit Degree College' }))
      await userEvent.click(screen.getByRole('radio', { name: 'Not certified' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('this shelter is not managed by your ngo')
      expect(screen.getByRole('dialog', { name: 'Edit shelter' })).toBeInTheDocument()
    })

    it('opens fresh on the next shelter — not with the last one\'s choices', async () => {
      serve([degree, johi])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Edit Degree College' }))
      await userEvent.click(screen.getByRole('radio', { name: /^Closed/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await userEvent.click(screen.getByRole('button', { name: 'Edit GBHS Johi' }))
      expect(screen.getByRole('radio', { name: /^Closed/ })).toBeChecked()
      expect(screen.getByRole('radio', { name: 'Pending certification' })).toBeChecked()
    })
  })

  describe('registering', () => {
    it('names every missing field, and sends nothing, when submitted empty', async () => {
      const world = serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      const drawer = screen.getByRole('dialog', { name: 'Register a shelter' })
      await userEvent.click(within(drawer).getByRole('button', { name: 'Register shelter' }))
      expect(await within(drawer).findByText('Enter the name of the shelter.')).toBeInTheDocument()
      expect(world.requests.posted).toEqual([])
    })

    it('registers with the point in GeoJSON order, closes, says what it starts as, and lists the new shelter', async () => {
      const world = serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      const drawer = screen.getByRole('dialog', { name: 'Register a shelter' })
      await userEvent.type(within(drawer).getByLabelText('Name'), 'Community Center')
      await userEvent.type(within(drawer).getByLabelText('Capacity'), '200')
      await userEvent.type(within(drawer).getByLabelText('Latitude'), '24.9')
      await userEvent.type(within(drawer).getByLabelText('Longitude'), '67.1')
      await userEvent.click(within(drawer).getByRole('button', { name: 'Register shelter' }))

      expect(await screen.findByText('Community Center is registered. It starts open, with nobody in it, and pending certification.')).toBeInTheDocument()
      expect(world.requests.posted).toEqual([{ name: 'Community Center', type: 'shelter', location: { type: 'Point', coordinates: [67.1, 24.9] }, capacity_total: 200 }])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByText('Community Center', { selector: 'p' })).toBeInTheDocument()
    })

    it('fills both coordinate fields from a click on the map, and the pin follows what is typed', async () => {
      serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      expect(screen.getByTestId('pin')).toHaveTextContent('none')

      await userEvent.click(screen.getByRole('button', { name: 'click the map' }))
      expect(screen.getByLabelText('Latitude')).toHaveValue('24.9')
      expect(screen.getByLabelText('Longitude')).toHaveValue('67.1')
      await waitFor(() => expect(screen.getByTestId('pin')).toHaveTextContent('24.9,67.1'))

      await userEvent.clear(screen.getByLabelText('Latitude'))
      await userEvent.type(screen.getByLabelText('Latitude'), '25.5')
      await waitFor(() => expect(screen.getByTestId('pin')).toHaveTextContent('25.5,67.1'))
    })

    it('says whether the point is in a region — and warns when it is in none, since citizens are only shown shelters in a region', async () => {
      serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))

      await userEvent.click(screen.getByRole('button', { name: 'click the map' })) // 24.9, 67.1 — inside Sindh's box
      expect(await screen.findByText(/citizens looking at that region will see it/)).toHaveTextContent('In Sindh')

      await userEvent.clear(screen.getByLabelText('Latitude'))
      await userEvent.type(screen.getByLabelText('Latitude'), '18.3')
      expect(await screen.findByText(/outside the shaded areas, so it can't be saved/)).toBeInTheDocument()
    })

    it('hands the regions to the map to shade, once they have loaded', async () => {
      serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      await waitFor(() => expect(screen.getByTestId('areas')).toHaveTextContent('Sindh'))
    })

    it('refuses a point outside every region — nothing is sent, the latitude says why — and saves once it is moved inside', async () => {
      const world = serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      const drawer = screen.getByRole('dialog', { name: 'Register a shelter' })
      await waitFor(() => expect(screen.getByTestId('areas')).toHaveTextContent('Sindh'))
      await userEvent.type(within(drawer).getByLabelText('Name'), 'Balochistan Camp')
      await userEvent.type(within(drawer).getByLabelText('Capacity'), '80')
      await userEvent.type(within(drawer).getByLabelText('Latitude'), '30.37')
      await userEvent.type(within(drawer).getByLabelText('Longitude'), '67.36')
      // Straight away — before the note has settled — the answer is the same.
      await userEvent.click(within(drawer).getByRole('button', { name: 'Register shelter' }))

      expect(await within(drawer).findByText('Pick a spot inside a shaded area of the map.')).toBeInTheDocument()
      expect(within(drawer).getByLabelText('Latitude')).toHaveFocus()
      expect(world.requests.posted).toEqual([])
      expect(screen.getByRole('dialog', { name: 'Register a shelter' })).toBeInTheDocument()

      await userEvent.click(within(drawer).getByRole('button', { name: 'click the map' })) // 24.9, 67.1 — inside Sindh
      await waitFor(() => expect(within(drawer).queryByText('Pick a spot inside a shaded area of the map.')).not.toBeInTheDocument())
      await userEvent.click(within(drawer).getByRole('button', { name: 'Register shelter' }))
      expect(await screen.findByText('Balochistan Camp is registered. It starts open, with nobody in it, and pending certification.')).toBeInTheDocument()
      expect(world.requests.posted).toHaveLength(1)
    })

    it('asks for the regions again before refusing — one added since the list was fetched makes the point fine, and the save goes through', async () => {
      const world = serve([degree])
      const north: Region = { id: 'r2', name: 'North', level: 'province', boundary: square(66, 29, 68, 31), created_at: '', updated_at: '' }
      let asked = 0
      // The first answer is the drawer's own read (Sindh alone); an administrator adds North before the save.
      server.use(http.get('*/regions', () => HttpResponse.json(++asked === 1 ? [sindh] : [sindh, north])))
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      const drawer = screen.getByRole('dialog', { name: 'Register a shelter' })
      await waitFor(() => expect(screen.getByTestId('areas')).toHaveTextContent('Sindh'))
      await userEvent.type(within(drawer).getByLabelText('Name'), 'New Ground')
      await userEvent.type(within(drawer).getByLabelText('Capacity'), '40')
      await userEvent.type(within(drawer).getByLabelText('Latitude'), '30.37')
      await userEvent.type(within(drawer).getByLabelText('Longitude'), '67.36')
      expect(await within(drawer).findByText(/outside the shaded areas/)).toBeInTheDocument() // as far as the list it holds can tell
      await userEvent.click(within(drawer).getByRole('button', { name: 'Register shelter' }))
      expect(await screen.findByText('New Ground is registered. It starts open, with nobody in it, and pending certification.')).toBeInTheDocument()
      expect(world.requests.posted).toHaveLength(1)
      expect(asked).toBeGreaterThanOrEqual(2)
    })

    it('does not block when the regions could not be loaded — it cannot tell, so it leaves the decision to the API', async () => {
      const world = serve([degree])
      server.use(http.get('*/regions', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      const drawer = screen.getByRole('dialog', { name: 'Register a shelter' })
      await userEvent.type(within(drawer).getByLabelText('Name'), 'Unknown Ground')
      await userEvent.type(within(drawer).getByLabelText('Capacity'), '10')
      await userEvent.type(within(drawer).getByLabelText('Latitude'), '30.37')
      await userEvent.type(within(drawer).getByLabelText('Longitude'), '67.36')
      await userEvent.click(within(drawer).getByRole('button', { name: 'Register shelter' }))
      await waitFor(() => expect(world.requests.posted).toHaveLength(1))
    })

    it('stays silent about regions when they cannot be loaded, rather than saying "outside" wrongly', async () => {
      serve([degree])
      server.use(http.get('*/regions', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      await userEvent.click(screen.getByRole('button', { name: 'click the map' }))
      await waitFor(() => expect(screen.getByTestId('pin')).toHaveTextContent('24.9,67.1'))
      expect(screen.queryByText(/isn't inside any region/)).not.toBeInTheDocument()
      expect(screen.queryByText(/citizens looking at that region/)).not.toBeInTheDocument()
    })

    it("keeps the drawer open with the server's words when registration is refused", async () => {
      serve([degree], { registerError: { status: 403, error: 'account is not affiliated with an ngo' } })
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      const drawer = screen.getByRole('dialog', { name: 'Register a shelter' })
      await userEvent.type(within(drawer).getByLabelText('Name'), 'X')
      await userEvent.type(within(drawer).getByLabelText('Capacity'), '5')
      await userEvent.click(within(drawer).getByRole('button', { name: 'click the map' }))
      await userEvent.click(within(drawer).getByRole('button', { name: 'Register shelter' }))
      expect(await within(drawer).findByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
    })

    it('opens empty every time', async () => {
      serve([degree])
      signIn()
      renderPage()
      await screen.findByText('Degree College', { selector: 'p' })
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      await userEvent.type(screen.getByLabelText('Name'), 'Half done')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await userEvent.click(screen.getByRole('button', { name: 'Register shelter' }))
      expect(screen.getByLabelText('Name')).toHaveValue('')
    })

    it('is offered from the empty state too', async () => {
      serve([])
      signIn()
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Register a shelter' }))
      expect(screen.getByRole('dialog', { name: 'Register a shelter' })).toBeInTheDocument()
    })
  })
})

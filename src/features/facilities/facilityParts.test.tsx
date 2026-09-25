import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { EssentialReportEntry } from '@/api/facilities'
import { makeEssential, makeHazard, makeInfrastructure, makeShelter } from '@/features/map/testMap'
import { infrastructurePlace } from '@/features/map/mapModel'
import type { RegionCoverage } from '@/features/regions/useRegionCoverage'
import { AddFacilityDrawer, type AddFacilityDrawerProps } from './AddFacilityDrawer'
import { EssentialReportsDialog } from './EssentialReportsDialog'
import { EssentialTable } from './EssentialTable'
import { FacilityLocationDialog } from './FacilityLocationDialog'
import { FacilitiesEmptyState, FacilitiesLoadState, FacilitiesNoMatch, PartialLoadNotice } from './FacilityStates'
import { FacilityToolbar } from './FacilityToolbar'
import { FilterPills } from './FilterPills'
import { InfrastructureTable } from './InfrastructureTable'
import { RegionScope } from './RegionScope'
import { SheltersOversightTable } from './SheltersOversightTable'
import { UpdateInfrastructureStatusDialog } from './UpdateInfrastructureStatusDialog'
import { ALL } from './facilityModel'
import { EMPTY_FACILITY_FORM, facilityFormSchema, type AddableKind, type FacilityFormValues } from './facilityForm'

describe('FilterPills', () => {
  const options = [
    { value: 'hospital', label: 'Hospital' },
    { value: 'bridge', label: 'Bridge' },
  ]
  const counts = { [ALL]: 5, hospital: 3, bridge: 2 }

  it('is a named group of All plus the options, each with its count, the chosen one pressed', () => {
    render(<FilterPills label="Type" value="bridge" options={options} counts={counts} onChange={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Type' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All5', 'Hospital3', 'Bridge2'])
    expect(within(group).getByRole('button', { name: /^Bridge/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the value pressed — "all" for All', async () => {
    const onChange = vi.fn()
    render(<FilterPills label="Type" value="bridge" options={options} counts={counts} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /^Hospital/ }))
    expect(onChange).toHaveBeenCalledWith('hospital')
    await userEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(onChange).toHaveBeenCalledWith(ALL)
  })

  it('shows 0 for a pill the counts do not mention', () => {
    render(<FilterPills label="Type" value={ALL} options={options} counts={{ [ALL]: 1 }} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^Bridge/ })).toHaveTextContent('Bridge0')
  })
})

describe('RegionScope', () => {
  it('says "All regions" and offers no way to clear it', () => {
    render(<RegionScope path={null} onChoose={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Region: all regions/ })).toHaveTextContent('All regions')
    expect(screen.queryByRole('button', { name: 'Show all regions' })).not.toBeInTheDocument()
  })

  it('shows the chosen region\'s path, changes it, and clears back to everywhere', async () => {
    const onChoose = vi.fn()
    const onClear = vi.fn()
    render(<RegionScope path="Sindh › Sukkur" onChoose={onChoose} onClear={onClear} />)
    const change = screen.getByRole('button', { name: 'Region: Sindh › Sukkur. Change region' })
    expect(change).toHaveTextContent('Sindh › Sukkur')
    await userEvent.click(change)
    expect(onChoose).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Show all regions' }))
    expect(onClear).toHaveBeenCalled()
  })
})

describe('FacilityToolbar', () => {
  it('has a labelled search, the scope slot and one pill group per filter', async () => {
    const onSearchChange = vi.fn()
    render(
      <FacilityToolbar
        search=""
        onSearchChange={onSearchChange}
        searchLabel="Search shelters"
        scope={<span>scope slot</span>}
        groups={[
          { label: 'Type', value: ALL, options: [{ value: 'a', label: 'A' }], counts: { [ALL]: 1, a: 1 }, onChange: vi.fn() },
          { label: 'Status', value: ALL, options: [{ value: 'b', label: 'B' }], counts: { [ALL]: 1, b: 1 }, onChange: vi.fn() },
        ]}
      />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search shelters' }), 'h')
    expect(onSearchChange).toHaveBeenCalledWith('h')
    expect(screen.getByText('scope slot')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument()
  })
})

describe('list states', () => {
  it('shows a busy skeleton, and on failure the message with a working Try again', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<FacilitiesLoadState label="shelters" error={null} onRetry={onRetry} />)
    expect(screen.getByLabelText('Loading shelters')).toHaveAttribute('aria-busy', 'true')
    rerender(<FacilitiesLoadState label="shelters" error="boom" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('says how many regions failed, that the list may be missing places, and lets you ask again', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<PartialLoadNotice failed={1} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent("One region couldn't be loaded, so this list may be missing places.")
    rerender(<PartialLoadNotice failed={3} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent("3 regions couldn't be loaded")
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('names what is missing and where, with the action when there is one', async () => {
    const onClick = vi.fn()
    render(<FacilitiesEmptyState noun="infrastructure items" where="in Sindh" hint="Ones you add appear here." action={{ label: 'Add infrastructure', onClick }} />)
    expect(screen.getByRole('heading', { name: 'No infrastructure items in Sindh' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add infrastructure' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('offers no action for shelters, which admins do not add', () => {
    render(<FacilitiesEmptyState noun="shelters" where="in any region" hint="Shelters are registered by the organisation." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers to clear a search and filters that hide everything', async () => {
    const onClear = vi.fn()
    render(<FacilitiesNoMatch onClear={onClear} />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(onClear).toHaveBeenCalled()
  })
})

describe('SheltersOversightTable', () => {
  const rows = [
    makeShelter('s1', 'Degree College', { managed_by_ngo_id: 'n1', capacity_total: 450, capacity_current: 380, location: { type: 'Point', coordinates: [68.86, 27.7] } }),
    makeShelter('s2', 'Orphan Hall', { status: 'closed', certification_status: 'pending' }),
  ]
  const renderTable = (names = new Map([['n1', 'Al-Khidmat']]), onShowLocation = vi.fn()) =>
    render(
      <MemoryRouter>
        <SheltersOversightTable rows={rows} organisationNames={names} onShowLocation={onShowLocation} />
      </MemoryRouter>,
    )

  it('shows name, kind and coordinates, the organisation as a link to its page, status, certification and occupancy', () => {
    renderTable()
    const [first, second] = screen.getAllByRole('listitem')
    expect(first).toHaveTextContent('Degree College')
    expect(first).toHaveTextContent('Shelter · 27.7000° N, 68.8600° E')
    expect(within(first).getByRole('link', { name: 'Al-Khidmat' })).toHaveAttribute('href', '/admin/ngos/n1')
    expect(within(first).getByText('Open')).toBeInTheDocument()
    expect(within(first).getByText('Certified')).toBeInTheDocument()
    expect(within(first).getByRole('progressbar', { name: 'Occupancy of Degree College' })).toHaveAttribute('aria-valuenow', '84')
    expect(second).toHaveTextContent('No organisation')
    expect(within(second).getByText('Closed')).toBeInTheDocument()
    expect(within(second).getByText('Pending certification')).toBeInTheDocument()
  })

  it('names the organisation generically until its name has loaded', () => {
    renderTable(new Map())
    expect(screen.getByRole('link', { name: 'An organisation' })).toHaveAttribute('href', '/admin/ngos/n1')
  })

  it('is read-only: one action, the location — no edit, no status change', async () => {
    const onShowLocation = vi.fn()
    renderTable(undefined, onShowLocation)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Location of Orphan Hall' }))
    expect(onShowLocation).toHaveBeenCalledWith(rows[1])
    expect(screen.queryByRole('button', { name: /^Edit|Update/ })).not.toBeInTheDocument()
  })
})

describe('InfrastructureTable', () => {
  const rows = [makeInfrastructure('i1', 'General Hospital', { type: 'hospital', status: 'at_risk' }), makeInfrastructure('i2', 'Indus Bridge', { type: 'bridge', status: 'damaged' })]

  it('shows each item with its kind, coordinates and a status badge in the status colour', () => {
    render(<InfrastructureTable rows={rows} onShowLocation={vi.fn()} onUpdateStatus={vi.fn()} />)
    const [first, second] = screen.getAllByRole('listitem')
    expect(first).toHaveTextContent('General Hospital')
    expect(first).toHaveTextContent('Hospital · 27.7100° N, 68.8700° E')
    expect(within(first).getByText('At risk')).toBeInTheDocument()
    expect(within(second).getByText('Damaged')).toBeInTheDocument()
    expect(first).toHaveTextContent(/Status updated .* ago/)
    expect(first).toHaveTextContent('Added 18 Sep 2026')
  })

  it('reports which item\'s location or status was pressed', async () => {
    const onShowLocation = vi.fn()
    const onUpdateStatus = vi.fn()
    render(<InfrastructureTable rows={rows} onShowLocation={onShowLocation} onUpdateStatus={onUpdateStatus} />)
    await userEvent.click(screen.getByRole('button', { name: 'Location of Indus Bridge' }))
    expect(onShowLocation).toHaveBeenCalledWith(rows[1])
    await userEvent.click(screen.getByRole('button', { name: 'Update status of General Hospital' }))
    expect(onUpdateStatus).toHaveBeenCalledWith(rows[0])
  })
})

describe('EssentialTable', () => {
  const rows = [
    makeEssential('e1', 'Corner Pharmacy', { type: 'pharmacy', current_status: 'closed', status_reported_at: new Date(Date.now() - 5 * 60_000).toISOString() }),
    makeEssential('e2', 'Main ATM', { type: 'atm' }),
  ]

  it('shows the latest reported status, and "Status unknown" and "No reports yet" for a place nobody has reported on — never a guess at open', () => {
    render(<EssentialTable rows={rows} onShowLocation={vi.fn()} onShowReports={vi.fn()} />)
    const [first, second] = screen.getAllByRole('listitem')
    expect(within(first).getByText('Closed')).toBeInTheDocument()
    expect(first).toHaveTextContent(/Last report 5 minutes ago/)
    expect(within(second).getByText('Status unknown')).toBeInTheDocument()
    expect(second).toHaveTextContent('No reports yet')
    expect(screen.queryByText('Open')).not.toBeInTheDocument()
  })

  it('offers the location and the report log — and nothing that edits', async () => {
    const onShowLocation = vi.fn()
    const onShowReports = vi.fn()
    render(<EssentialTable rows={rows} onShowLocation={onShowLocation} onShowReports={onShowReports} />)
    await userEvent.click(screen.getByRole('button', { name: 'Status reports for Main ATM' }))
    expect(onShowReports).toHaveBeenCalledWith(rows[1])
    await userEvent.click(screen.getByRole('button', { name: 'Location of Corner Pharmacy' }))
    expect(onShowLocation).toHaveBeenCalledWith(rows[0])
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })
})

function AddHarness({ kind = 'infrastructure', onValid = vi.fn(), coverage = { status: 'none' } as RegionCoverage, ...rest }: { kind?: AddableKind; onValid?: (values: FacilityFormValues) => void; coverage?: RegionCoverage } & Partial<AddFacilityDrawerProps>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FacilityFormValues>({ resolver: zodResolver(facilityFormSchema(kind)), defaultValues: EMPTY_FACILITY_FORM(kind) })
  return (
    <AddFacilityDrawer
      kind={kind}
      onClose={vi.fn()}
      register={register}
      errors={errors}
      map={<div data-testid="picker" />}
      coverage={coverage}
      onUseMyLocation={vi.fn()}
      locationStatus="idle"
      onSubmit={handleSubmit(onValid)}
      isSubmitting={false}
      serverError={null}
      {...rest}
    />
  )
}

describe('AddFacilityDrawer', () => {
  it('for infrastructure: says it starts as Safe, offers hospital, bridge and utility, and warns what cannot be undone', () => {
    render(<AddHarness />)
    const dialog = screen.getByRole('dialog', { name: 'Add infrastructure' })
    expect(within(dialog).getByText(/starts as Safe/)).toBeInTheDocument()
    expect(within(dialog).getAllByRole('radio').map((r) => (r.closest('label') as HTMLElement).textContent)).toEqual(['Hospital', 'Bridge', 'Utility'])
    expect(within(dialog).getByRole('radio', { name: 'Hospital' })).toBeChecked()
    expect(within(dialog).getByText(/can't be changed afterwards, and there is no way to remove it/)).toBeInTheDocument()
  })

  it('for an essential location: says it is the manual fallback and has no status, and offers ATM, grocery store and pharmacy — no fuel or water', () => {
    render(<AddHarness kind="essential" />)
    const dialog = screen.getByRole('dialog', { name: 'Add essential location' })
    expect(within(dialog).getByText(/manual fallback/)).toBeInTheDocument()
    expect(within(dialog).getByText(/starts with no status/)).toBeInTheDocument()
    expect(within(dialog).getAllByRole('radio').map((r) => (r.closest('label') as HTMLElement).textContent)).toEqual(['ATM', 'Grocery store', 'Pharmacy'])
  })

  it('names every empty field on an empty submit and sends nothing', async () => {
    const onValid = vi.fn()
    render(<AddHarness onValid={onValid} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add infrastructure' }))
    expect(await screen.findByText('Enter the name.')).toBeInTheDocument()
    expect(screen.getByText('Enter the latitude, or click the map.')).toBeInTheDocument()
    expect(screen.getByText('Enter the longitude, or click the map.')).toBeInTheDocument()
    expect(onValid).not.toHaveBeenCalled()
  })

  it('submits what was entered, with the type chosen and the coordinates as typed', async () => {
    const onValid = vi.fn()
    render(<AddHarness onValid={onValid} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Indus Bridge')
    await userEvent.click(screen.getByText('Bridge'))
    await userEvent.type(screen.getByLabelText('Latitude'), '24.86')
    await userEvent.type(screen.getByLabelText('Longitude'), '67.05')
    await userEvent.click(screen.getByRole('button', { name: 'Add infrastructure' }))
    expect(onValid.mock.calls[0][0]).toEqual({ name: 'Indus Bridge', type: 'bridge', latitude: '24.86', longitude: '67.05' })
  })

  it('says, before saving, that a point in no region cannot be saved — and how to get that area covered', () => {
    render(<AddHarness coverage={{ status: 'outside' }} />)
    expect(screen.getByText(/outside the shaded areas, so it can't be saved/)).toHaveTextContent('To cover a new area, add a region under Regions first.')
  })

  it('shows the map it was given, the server\'s refusal, and locks the buttons while saving', () => {
    const { rerender } = render(<AddHarness serverError="insufficient permissions" />)
    expect(screen.getByTestId('picker')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('insufficient permissions')
    rerender(<AddHarness isSubmitting />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})

describe('UpdateInfrastructureStatusDialog', () => {
  const target = makeInfrastructure('i1', 'General Hospital', { type: 'hospital', status: 'at_risk' })
  const props = { target, status: 'at_risk' as const, onStatusChange: vi.fn(), onSave: vi.fn(), onClose: vi.fn(), isSaving: false, error: null }

  it('names the item, offers the three statuses with the current one marked, and says citizens see the colour', () => {
    render(<UpdateInfrastructureStatusDialog {...props} />)
    const dialog = screen.getByRole('dialog', { name: 'Update status' })
    expect(dialog).toHaveTextContent('General Hospital · Hospital')
    expect(dialog).toHaveTextContent('Citizens see its status on the map')
    expect(within(dialog).getAllByRole('radio')).toHaveLength(3)
    expect(within(dialog).getByRole('radio', { name: /At risk \(current\)/ })).toBeChecked()
  })

  it('reports the status chosen', async () => {
    const onStatusChange = vi.fn()
    render(<UpdateInfrastructureStatusDialog {...props} onStatusChange={onStatusChange} />)
    await userEvent.click(screen.getByText('Damaged'))
    expect(onStatusChange).toHaveBeenCalledWith('damaged')
  })

  it('lets the current status be saved again — and says that this only refreshes when it was last updated', () => {
    render(<UpdateInfrastructureStatusDialog {...props} />)
    expect(screen.getByText(/already its status. Saving it again just refreshes when it was last updated/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm status' })).toBeEnabled()
  })

  it('says "Save status" once something differs, and saves', async () => {
    const onSave = vi.fn()
    render(<UpdateInfrastructureStatusDialog {...props} status="safe" onSave={onSave} />)
    expect(screen.queryByText(/already its status/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save status' }))
    expect(onSave).toHaveBeenCalled()
  })

  it('shows the server\'s refusal, locks while saving, and is closed for no target', () => {
    const { rerender } = render(<UpdateInfrastructureStatusDialog {...props} error="insufficient permissions" isSaving />)
    expect(screen.getByRole('alert')).toHaveTextContent('insufficient permissions')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    rerender(<UpdateInfrastructureStatusDialog {...props} target={null} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('EssentialReportsDialog', () => {
  const target = makeEssential('e1', 'Corner Pharmacy', { type: 'pharmacy' })
  const entries: EssentialReportEntry[] = [
    { id: 'r1', status: 'open', created_at: '2026-09-25T08:00:00Z' },
    { id: 'r2', status: 'closed', created_at: '2026-09-25T09:30:00Z' },
  ]
  const base = { target, isPending: false, error: null, entries, onRetry: vi.fn(), onClose: vi.fn() }

  it('lists the log newest first, marks the one citizens see, and says who is not shown', () => {
    render(<EssentialReportsDialog {...base} />)
    const dialog = screen.getByRole('dialog', { name: 'Status reports' })
    expect(dialog).toHaveTextContent("Reports don't say who made them")
    expect(dialog).toHaveTextContent('2 reports')
    const items = within(dialog).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Closed')
    expect(items[0]).toHaveTextContent('shown now')
    expect(items[1]).toHaveTextContent('Open')
    expect(items[1]).not.toHaveTextContent('shown now')
  })

  it('says so when nobody has reported — the place then shows as "Status unknown"', () => {
    render(<EssentialReportsDialog {...base} entries={[]} />)
    expect(screen.getByText(/No one has reported on this place yet/)).toBeInTheDocument()
  })

  it('shows a skeleton while loading and a retry when it failed', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<EssentialReportsDialog {...base} isPending entries={undefined} />)
    expect(screen.getByLabelText('Loading reports')).toHaveAttribute('aria-busy', 'true')
    rerender(<EssentialReportsDialog {...base} error="boom" entries={undefined} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('FacilityLocationDialog', () => {
  const place = infrastructurePlace(makeInfrastructure('i1', 'General Hospital', { status: 'at_risk', location: { type: 'Point', coordinates: [68.86, 27.7] } }))
  const base = { place, onClose: vi.fn(), map: <div data-testid="map" />, coverage: { status: 'none' } as RegionCoverage }
  const renderDialog = (props: Partial<Parameters<typeof FacilityLocationDialog>[0]> = {}) =>
    render(
      <MemoryRouter>
        <FacilityLocationDialog {...base} zone={{ state: 'clear' }} {...props} />
      </MemoryRouter>,
    )

  it('names the place with its kind and status, shows the map and the coordinates', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'General Hospital' })
    expect(dialog).toHaveTextContent('Hospital')
    expect(within(dialog).getByText('At risk')).toBeInTheDocument()
    expect(within(dialog).getByTestId('map')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('27.7000° N, 68.8600° E')
  })

  it('says which region it is in, or — when in none — that no citizen sees it and no admin route lists it', () => {
    const { unmount } = renderDialog({ coverage: { status: 'inside', path: 'Sindh › Sukkur' } })
    expect(screen.getByText(/citizens looking at that region will see it/)).toHaveTextContent('In Sindh › Sukkur')
    unmount()
    renderDialog({ coverage: { status: 'outside' } })
    expect(screen.getByText(/isn't inside any region/)).toHaveTextContent("No admin route can list it either.")
  })

  it('says "not inside any active hazard zone" when clear, and what is being done while checking or when it failed', () => {
    const { rerender } = renderDialog({ zone: { state: 'clear' } })
    expect(screen.getByText('Not inside any active hazard zone.')).toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <FacilityLocationDialog {...base} zone={{ state: 'checking' }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Checking active hazard zones…')).toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <FacilityLocationDialog {...base} zone={{ state: 'error' }} />
      </MemoryRouter>,
    )
    expect(screen.getByText("Couldn't check the hazard zones around this place.")).toBeInTheDocument()
  })

  it('says it is inside a zone — what kind and its basis — and links to that zone\'s page', () => {
    renderDialog({ zone: { state: 'inside', zone: makeHazard('z1', 'high', 0.87) } })
    expect(screen.getByText(/Inside a/)).toHaveTextContent('Inside a high-risk flood zone — 87% model confidence.')
    expect(screen.getByRole('link', { name: 'View zone' })).toHaveAttribute('href', '/admin/hazard-zones/z1')
  })

  it('is closed for no place', () => {
    renderDialog({ place: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { essentialPlace, shelterPlace } from '@/features/map/mapModel'
import { makeEssential, makeShelter } from '@/features/map/testMap'
import { CategoryChips } from './CategoryChips'
import { LocalListPlaceholder, LocalResourceList, TabPlaceholder } from './LocalResourceList'
import { LocalResourceRow } from './LocalResourceRow'
import { ResourceTabs } from './ResourceTabs'
import { ScopeToggle } from './ScopeToggle'

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

describe('ResourceTabs', () => {
  it('names the four tabs, marks the active one, and puts only it in the tab order', () => {
    render(<ResourceTabs active="aid" onChange={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Local resources', 'Aid requests', 'Campaigns', 'Missing persons'])
    expect(screen.getByRole('tab', { name: 'Aid requests' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Aid requests' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Campaigns' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tab', { name: 'Campaigns' })).toHaveAttribute('aria-controls', 'resources-panel')
  })

  it('changes tab on click', async () => {
    const onChange = vi.fn()
    render(<ResourceTabs active="local" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Campaigns' }))
    expect(onChange).toHaveBeenCalledWith('campaigns')
  })

  it('moves with the arrow keys (wrapping), Home and End', async () => {
    // Each key is measured from the tab that has focus — `active` here never changes, as it would not for a moment when the page chooses the tab through the URL.
    const onChange = vi.fn()
    render(<ResourceTabs active="local" onChange={onChange} />)
    screen.getByRole('tab', { name: 'Local resources' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('aid')
    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('local')
    await userEvent.keyboard('{ArrowLeft}') // wraps to the last
    expect(onChange).toHaveBeenLastCalledWith('missing')
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith('local')
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('missing')
    await userEvent.keyboard('{ArrowRight}') // wraps to the first
    expect(onChange).toHaveBeenLastCalledWith('local')
  })
})

describe('CategoryChips', () => {
  const counts = { all: 6, shelters: 2, pharmacy: 3, grocery_store: 1, atm: 0 }

  it('shows each kind with its count and marks the chosen one pressed', () => {
    render(<CategoryChips category="pharmacy" counts={counts} onChange={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Kind of place' })
    expect(within(group).getByRole('button', { name: /Pharmacies/ })).toHaveTextContent('Pharmacies3')
    expect(within(group).getByRole('button', { name: /Pharmacies/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: /^ATMs/ })).toHaveTextContent('ATMs0')
    expect(within(group).getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not offer Fuel or Water — the API has no such kind of place', () => {
    render(<CategoryChips category="all" counts={counts} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Fuel|Water/ })).not.toBeInTheDocument()
  })

  it('reports the chosen kind', async () => {
    const onChange = vi.fn()
    render(<CategoryChips category="all" counts={counts} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Grocery stores/ }))
    expect(onChange).toHaveBeenCalledWith('grocery_store')
  })
})

describe('ScopeToggle', () => {
  it('offers the home region by name, or everywhere, and says which is chosen', async () => {
    const onChange = vi.fn()
    render(<ScopeToggle scope="home" homeName="Sukkur City" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Sukkur City' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Everywhere' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Everywhere' }))
    expect(onChange).toHaveBeenCalledWith('all')
  })
})

describe('LocalResourceRow — an essential location', () => {
  const row = (place: ReturnType<typeof essentialPlace>, extra: Partial<React.ComponentProps<typeof LocalResourceRow>> = {}) => {
    const props = { place, distanceMeters: null, reportingBusy: false, onReport: vi.fn(), ...extra }
    inRouter(<ul><LocalResourceRow {...props} /></ul>)
    return props
  }

  it('says nobody has reported when nobody has, and offers both reports — never assuming open', () => {
    row(essentialPlace(makeEssential('e1', 'Corner Pharmacy')))
    expect(screen.getByText('Corner Pharmacy')).toBeInTheDocument()
    expect(screen.getByText('Status unknown')).toBeInTheDocument()
    expect(screen.getByText(/Nobody has reported yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Corner Pharmacy as open' })).toBeInTheDocument()
  })

  it('shows the latest report and offers only the opposite one', () => {
    row(essentialPlace(makeEssential('e1', 'Corner Pharmacy', { current_status: 'open', status_reported_at: minutesAgo(5) })))
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText(/Reported open 5 minutes ago/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark Corner Pharmacy as open' })).not.toBeInTheDocument()
  })

  it('offers "open" alone for a place reported closed', () => {
    row(essentialPlace(makeEssential('e1', 'City ATM', { type: 'atm', current_status: 'closed', status_reported_at: minutesAgo(90) })))
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark City ATM as closed' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark City ATM as open' })).toBeInTheDocument()
  })

  it('reports the choice with the place, and waits while a report is in flight', async () => {
    const place = essentialPlace(makeEssential('e1', 'Corner Pharmacy', { current_status: 'open', status_reported_at: minutesAgo(5) }))
    const { onReport } = row(place)
    await userEvent.click(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' }))
    expect(onReport).toHaveBeenCalledWith(place, 'closed')
  })

  it('disables the report buttons while busy', () => {
    row(essentialPlace(makeEssential('e1', 'Corner Pharmacy')), { reportingBusy: true })
    expect(screen.getByRole('button', { name: 'Mark Corner Pharmacy as closed' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark Corner Pharmacy as open' })).toBeDisabled()
  })

  it('links Navigate by coordinates and shows the distance when there is one', () => {
    row(essentialPlace(makeEssential('e1', 'Corner Pharmacy', { location: { type: 'Point', coordinates: [68.88, 27.72] } })), { distanceMeters: 4200 })
    expect(screen.getByRole('link', { name: 'Navigate to Corner Pharmacy' })).toHaveAttribute('href', '/app/navigate?destination=27.72,68.88')
    expect(screen.getByText(/4\.2 km away/)).toBeInTheDocument()
  })
})

describe('LocalResourceRow — a shelter', () => {
  it('shows its occupancy and links to its page and by id — with no report button, since a shelter report can’t be read back', () => {
    const place = shelterPlace(makeShelter('s1', 'GBHS Johi', { capacity_current: 210, capacity_total: 400 }))
    inRouter(<ul><LocalResourceRow place={place} distanceMeters={null} reportingBusy={false} onReport={vi.fn()} /></ul>)
    expect(screen.getByText(/Capacity 210 \/ 400/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'GBHS Johi occupancy' })).toHaveAttribute('aria-valuenow', '53')
    expect(screen.getByRole('link', { name: 'Navigate to GBHS Johi' })).toHaveAttribute('href', '/app/navigate?destination_shelter_id=s1')
    expect(screen.getByRole('link', { name: 'Details for GBHS Johi' })).toHaveAttribute('href', '/app/map/shelters/s1')
    expect(screen.queryByRole('button', { name: /Mark .* as/ })).not.toBeInTheDocument()
  })

  it('shows a closed shelter as closed', () => {
    const place = shelterPlace(makeShelter('s2', 'Closed Camp', { status: 'closed' }))
    inRouter(<ul><LocalResourceRow place={place} distanceMeters={null} reportingBusy={false} onReport={vi.fn()} /></ul>)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })
})

describe('LocalResourceList and its placeholders', () => {
  const places = [shelterPlace(makeShelter('s1', 'A')), shelterPlace(makeShelter('s2', 'B'))]

  it('lists every place, and offers "Show more" only when there are more than shown', async () => {
    const onShowMore = vi.fn()
    const { rerender } = inRouter(<LocalResourceList places={places} total={2} distanceOf={() => null} reportingBusy={false} onReport={vi.fn()} onShowMore={onShowMore} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <LocalResourceList places={places} total={7} distanceOf={() => null} reportingBusy={false} onReport={vi.fn()} onShowMore={onShowMore} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Show more (5 more)' }))
    expect(onShowMore).toHaveBeenCalled()
  })

  it('has a busy skeleton, an empty sentence and a tab placeholder', () => {
    const { rerender } = render(<LocalListPlaceholder kind="loading" />)
    expect(screen.getByLabelText('Loading places')).toHaveAttribute('aria-busy', 'true')
    rerender(<LocalListPlaceholder kind="empty" message="No ATMs are listed here." />)
    expect(screen.getByText('No ATMs are listed here.')).toBeInTheDocument()
    rerender(<TabPlaceholder title="Aid requests" phase="Phase 6" />)
    expect(screen.getByRole('heading', { name: 'Aid requests' })).toBeInTheDocument()
    expect(screen.getByText('Not built yet — ships in Phase 6.')).toBeInTheDocument()
  })
})

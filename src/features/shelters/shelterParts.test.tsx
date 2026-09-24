import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { capacityInfo } from '@/features/map/mapModel'
import { makeShelter } from '@/features/map/testMap'
import { CapacityMeter } from './CapacityMeter'
import { CertificationBadge } from './CertificationBadge'
import { ShelterCapacityCard } from './ShelterCapacityCard'
import { ShelterDetailState } from './ShelterDetailState'
import { ShelterFactsCard } from './ShelterFactsCard'
import { ShelterHeader } from './ShelterHeader'
import { ShelterLocationCard, type ShelterLocationCardProps } from './ShelterLocationCard'

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('CapacityMeter', () => {
  it('shows current over total, the percentage and a bar carrying the same value', () => {
    render(<CapacityMeter info={capacityInfo({ capacity_current: 210, capacity_total: 400 })} />)
    expect(screen.getByText(/Capacity/)).toHaveTextContent('Capacity 210 / 400')
    expect(screen.getByText('53%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Shelter occupancy' })).toHaveAttribute('aria-valuenow', '53')
  })

  it('says so plainly when over capacity, and holds the bar at full', () => {
    render(<CapacityMeter info={capacityInfo({ capacity_current: 330, capacity_total: 300 })} />)
    expect(screen.getByText('Over capacity — 30 more than it holds.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('does not divide by zero for a shelter with no capacity recorded', () => {
    render(<CapacityMeter info={capacityInfo({ capacity_current: 0, capacity_total: 0 })} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.queryByText(/Over capacity/)).not.toBeInTheDocument()
  })
})

describe('CertificationBadge', () => {
  it('names each certification in words', () => {
    const { rerender } = render(<CertificationBadge status="certified" />)
    expect(screen.getByText('Certified')).toBeInTheDocument()
    rerender(<CertificationBadge status="pending" />)
    expect(screen.getByText('Pending certification')).toBeInTheDocument()
    rerender(<CertificationBadge status="uncertified" />)
    expect(screen.getByText('Not certified')).toBeInTheDocument()
  })
})

describe('ShelterHeader', () => {
  it('leads back to the map, names the shelter and what it is, and carries its status and certification', () => {
    inRouter(<ShelterHeader shelter={makeShelter('s1', 'GBHS Johi', { type: 'relief_center', certification_status: 'pending' })} />)
    expect(screen.getByRole('link', { name: 'Back to map' })).toHaveAttribute('href', '/app/map')
    expect(screen.getByRole('heading', { level: 1, name: 'GBHS Johi' })).toBeInTheDocument()
    expect(screen.getByText('Relief center')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Pending certification')).toBeInTheDocument()
  })

  it('links Navigate Here to the route planner for this shelter', () => {
    inRouter(<ShelterHeader shelter={makeShelter('3f2a-9b', 'GBHS Johi')} />)
    expect(screen.getByRole('link', { name: /Navigate Here/ })).toHaveAttribute('href', '/app/navigate?destination_shelter_id=3f2a-9b')
  })

  it('says a closed shelter is closed', () => {
    inRouter(<ShelterHeader shelter={makeShelter('s1', 'Closed Camp', { status: 'closed' })} />)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })
})

describe('ShelterCapacityCard', () => {
  it('shows the meter and when it was last updated', () => {
    render(<ShelterCapacityCard shelter={makeShelter('s1', 'A', { updated_at: new Date(Date.now() - 3 * 60_000).toISOString() })} />)
    const card = screen.getByRole('region', { name: 'Capacity' })
    expect(within(card).getByRole('progressbar')).toBeInTheDocument()
    expect(within(card).getByText(/Updated 3 minutes ago/)).toBeInTheDocument()
  })

  it('adds that the shelter is closed when it is, and only then', () => {
    const { rerender } = render(<ShelterCapacityCard shelter={makeShelter('s1', 'A', { status: 'closed' })} />)
    expect(screen.getByText('This shelter is closed right now.')).toBeInTheDocument()
    rerender(<ShelterCapacityCard shelter={makeShelter('s1', 'A')} />)
    expect(screen.queryByText(/closed right now/)).not.toBeInTheDocument()
  })
})

describe('ShelterFactsCard', () => {
  it('lists the API’s plain facts — type, certification, registered and last updated dates — and nothing invented', () => {
    render(<ShelterFactsCard shelter={makeShelter('s1', 'A', { created_at: '2026-09-18T10:00:00Z', certification_status: 'uncertified' })} />)
    const card = screen.getByRole('region', { name: 'Details' })
    for (const label of ['Type', 'Certification', 'Registered', 'Last updated']) expect(within(card).getByText(label)).toBeInTheDocument()
    expect(within(card).getByText('Not certified')).toBeInTheDocument()
    expect(within(card).getByText('18 Sep 2026')).toBeInTheDocument()
    expect(within(card).queryByText(/address|managed|run by/i)).not.toBeInTheDocument()
  })
})

describe('ShelterLocationCard', () => {
  const props = (overrides: Partial<ShelterLocationCardProps> = {}): ShelterLocationCardProps => ({
    map: <div data-testid="map" />,
    position: [27.706, 68.858],
    distanceMeters: null,
    locationStatus: 'idle',
    onLocate: vi.fn(),
    ...overrides,
  })

  it('shows the map slot and the coordinates, and asks for the position only when the button is pressed', async () => {
    const onLocate = vi.fn()
    render(<ShelterLocationCard {...props({ onLocate })} />)
    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.getByText('27.7060° N, 68.8580° E')).toBeInTheDocument()
    expect(onLocate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Show distance from me' }))
    expect(onLocate).toHaveBeenCalledTimes(1)
  })

  it('shows the distance once there is one, in place of the button', () => {
    render(<ShelterLocationCard {...props({ distanceMeters: 4200, locationStatus: 'ready' })} />)
    expect(screen.getByText('4.2 km away')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show distance from me' })).not.toBeInTheDocument()
  })

  it('disables the button while locating, and says why a refusal left no distance, in terms of the distance', () => {
    const { rerender } = render(<ShelterLocationCard {...props({ locationStatus: 'locating' })} />)
    expect(screen.getByRole('button', { name: 'Show distance from me' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Finding your location…')
    rerender(<ShelterLocationCard {...props({ locationStatus: 'denied' })} />)
    expect(screen.getByRole('status')).toHaveTextContent('to see how far this shelter is from you')
    expect(screen.getByRole('button', { name: 'Show distance from me' })).toBeEnabled()
  })

  it('says what the map couldn’t do, under it', () => {
    render(<ShelterLocationCard {...props({ mapNotice: "Couldn't load flood zones for this area." })} />)
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't load flood zones for this area.")
  })
})

describe('ShelterDetailState', () => {
  it('shows a busy skeleton while loading', () => {
    render(<ShelterDetailState kind="loading" onRetry={vi.fn()} />)
    expect(screen.getByLabelText('Loading shelter')).toHaveAttribute('aria-busy', 'true')
  })

  it('says there is no such shelter, with the way back and no retry', () => {
    inRouter(<ShelterDetailState kind="not-found" onRetry={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Shelter not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to map' })).toHaveAttribute('href', '/app/map')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('shows a failed load as an alert with a retry', async () => {
    const onRetry = vi.fn()
    inRouter(<ShelterDetailState kind="error" message="Network Error" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Network Error')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

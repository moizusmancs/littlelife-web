import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { HazardZoneDetail } from '@/api/floodIntel'
import { HazardCard } from './HazardCard'
import { PlaceCard } from './PlaceCard'
import { essentialPlace, infrastructurePlace, shelterPlace } from './mapModel'
import { makeEssential, makeHazard, makeInfrastructure, makeShelter } from './testMap'

const renderPlace = (place: ReturnType<typeof shelterPlace>, distance: number | null = null, onClose = vi.fn()) =>
  render(
    <MemoryRouter>
      <PlaceCard place={place} distanceMeters={distance} onClose={onClose} />
    </MemoryRouter>,
  )

describe('PlaceCard — a shelter', () => {
  it('shows status and certification badges, the name, what it is and how far away, and its capacity', () => {
    renderPlace(shelterPlace(makeShelter('s1', 'GBHS Johi', { capacity_current: 210, capacity_total: 400 })), 4200)
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Certified')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'GBHS Johi' })).toBeInTheDocument()
    expect(screen.getByText('Shelter · 4.2 km away')).toBeInTheDocument()
    expect(screen.getByText(/Capacity/)).toHaveTextContent('Capacity 210 / 400')
    expect(screen.getByText('53%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Shelter occupancy' })).toHaveAttribute('aria-valuenow', '53')
  })

  it('leaves out the distance when the viewer’s position is unknown, and never invents an address or an NGO name', () => {
    renderPlace(shelterPlace(makeShelter('s1', 'GBHS Johi', { managed_by_ngo_id: 'ngo-1' })))
    expect(screen.getByText('Shelter')).toBeInTheDocument()
    expect(screen.queryByText(/away/)).not.toBeInTheDocument()
    expect(screen.queryByText(/run by/i)).not.toBeInTheDocument()
  })

  it('flags over-capacity honestly while the bar stays at its maximum', () => {
    renderPlace(shelterPlace(makeShelter('s1', 'Crowded', { capacity_current: 130, capacity_total: 100 })))
    expect(screen.getByText('130%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText(/Over capacity — 30 more than it holds/)).toBeInTheDocument()
  })

  it('words uncertified and pending shelters plainly, and shows a closed one as closed', () => {
    const { unmount } = renderPlace(shelterPlace(makeShelter('s1', 'A', { certification_status: 'pending', status: 'closed' })))
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('Pending certification')).toBeInTheDocument()
    unmount()
    renderPlace(shelterPlace(makeShelter('s2', 'B', { certification_status: 'uncertified' })))
    expect(screen.getByText('Not certified')).toBeInTheDocument()
  })

  it('links Navigate Here and View Details to the shelter, and closes', async () => {
    const onClose = vi.fn()
    renderPlace(shelterPlace(makeShelter('shelter-42', 'A')), null, onClose)
    expect(screen.getByRole('link', { name: 'Navigate Here' })).toHaveAttribute('href', '/app/navigate?destination_shelter_id=shelter-42')
    expect(screen.getByRole('link', { name: 'View Details' })).toHaveAttribute('href', '/app/map/shelters/shelter-42')
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('PlaceCard — other places', () => {
  it('shows infrastructure with its status and when it was last updated, with no shelter actions', () => {
    renderPlace(infrastructurePlace(makeInfrastructure('i1', 'General Hospital', { status: 'damaged', last_status_update: new Date(Date.now() - 3 * 3600_000).toISOString() })))
    expect(screen.getByText('Damaged')).toBeInTheDocument()
    expect(screen.getByText('Hospital')).toBeInTheDocument()
    expect(screen.getByText(/Status updated 3 hours ago/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('says nobody has reported an essential location, rather than assuming it is open', () => {
    renderPlace(essentialPlace(makeEssential('e1', 'Corner Pharmacy')))
    expect(screen.getByText('Status unknown')).toBeInTheDocument()
    expect(screen.getByText('Nobody has reported whether this place is open yet.')).toBeInTheDocument()
  })

  it('shows the latest report on an essential location', () => {
    renderPlace(essentialPlace(makeEssential('e1', 'City ATM', { type: 'atm', current_status: 'closed', status_reported_at: new Date(Date.now() - 30 * 60_000).toISOString() })))
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText(/Reported closed 30 minutes ago/)).toBeInTheDocument()
  })
})

describe('HazardCard', () => {
  const detail: HazardZoneDetail = {
    id: 'h1',
    source: 'ai_prediction',
    risk_level: 'high',
    boundary: { type: 'Polygon', coordinates: [] },
    status: 'active',
    detected_at: '2026-09-24T01:19:47Z',
    confidence_score: 0.87,
    model_version: 'convlstm-unet-v3',
    valid_from: '2026-09-20T00:00:00Z',
    valid_until: '2026-09-21T00:00:00Z',
    generated_at: '2026-09-20T05:58:00Z',
  }
  const props = { detailLoading: false, detailError: false, onClose: vi.fn(), onZoom: vi.fn() }

  it('shows level, source, title, and the model’s confidence with a bar, plus the forecast details once loaded', () => {
    render(<HazardCard entry={makeHazard('h1', 'high', 0.87)} detail={detail} {...props} />)
    expect(screen.getByText('High risk')).toBeInTheDocument()
    expect(screen.getByText('Model forecast')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'High-risk flood zone' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Model confidence' })).toHaveAttribute('aria-valuenow', '87')
    expect(screen.getByText('87%')).toBeInTheDocument()
    expect(screen.getByText('convlstm-unet-v3')).toBeInTheDocument()
    expect(screen.getByText('Valid')).toBeInTheDocument()
    expect(screen.getByText('Forecast made')).toBeInTheDocument()
  })

  it('is useful before the detail arrives — the overview comes from the overlay — and says the rest is loading', () => {
    render(<HazardCard entry={makeHazard('h1', 'medium', 0.6)} detail={undefined} {...props} detailLoading />)
    expect(screen.getByRole('heading', { name: 'Medium-risk flood zone' })).toBeInTheDocument()
    expect(screen.getByText('Loading forecast details…')).toBeInTheDocument()
    expect(screen.queryByText('Model')).not.toBeInTheDocument()
  })

  it('keeps what it has and says so when the detail can’t load', () => {
    render(<HazardCard entry={makeHazard('h1', 'high', 0.87)} detail={undefined} {...props} detailError />)
    expect(screen.getByText("Forecast details couldn't be loaded.")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'High-risk flood zone' })).toBeInTheDocument()
  })

  it('describes a manual zone as declared by an admin or NGO, with no confidence and no model details', () => {
    const manual: HazardZoneDetail = { ...detail, source: 'manual_ngo', confidence_score: undefined, model_version: undefined, valid_from: undefined, valid_until: undefined, generated_at: undefined }
    render(<HazardCard entry={makeHazard('h2', 'medium')} detail={manual} {...props} />)
    expect(screen.getByText('Declared by an NGO')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Medium-risk hazard zone' })).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText('Model confidence')).not.toBeInTheDocument()
  })

  it('zooms to the zone and closes', async () => {
    const onZoom = vi.fn()
    const onClose = vi.fn()
    render(<HazardCard entry={makeHazard('h1', 'high', 0.87)} detail={detail} {...props} onZoom={onZoom} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Zoom to zone' }))
    await userEvent.click(within(screen.getByRole('region', { name: 'Hazard zone details' })).getByRole('button', { name: 'Close details' }))
    expect(onZoom).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

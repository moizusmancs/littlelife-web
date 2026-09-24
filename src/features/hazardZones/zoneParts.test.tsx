import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConfidenceSlider } from './ConfidenceSlider'
import { DateRangeFilter } from './DateRangeFilter'
import { PredictionList } from './PredictionList'
import { ResolveZoneDialog } from './ResolveZoneDialog'
import { TabPills } from './TabPills'
import { ZoneDetailHeader, ZoneFactsCard, ZonePredictionCard } from './ZoneDetailParts'
import { ZoneDetailState } from './ZoneDetailState'
import { ZoneList } from './ZoneList'
import { ZoneListState } from './ZoneListStates'
import { makeAdminZone, makePrediction, makeZoneDetail } from './testZones'

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('TabPills', () => {
  const options = [{ id: 'active' as const, label: 'Active' }, { id: 'resolved' as const, label: 'Resolved' }]

  it('marks the chosen pill pressed and reports another', async () => {
    const onChange = vi.fn()
    render(<TabPills label="Zone status" value="active" options={options} onChange={onChange} />)
    const group = screen.getByRole('group', { name: 'Zone status' })
    expect(within(group).getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(group).getByRole('button', { name: 'Resolved' }))
    expect(onChange).toHaveBeenCalledWith('resolved')
  })
})

describe('DateRangeFilter', () => {
  it('shows both dates under the noun for what they filter, and reports a change to either', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={{ from: '', to: '' }} noun="Detected" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Detected from'), '2026-09-24')
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-24', to: '' })
    expect(screen.queryByRole('button', { name: 'Clear dates' })).not.toBeInTheDocument()
  })

  it('offers Clear once a date is set, and says so when the range runs backwards', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter range={{ from: '2026-09-25', to: '2026-09-24' }} noun="Generated" onChange={onChange} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The start date is after the end date')
    await userEvent.click(screen.getByRole('button', { name: 'Clear dates' }))
    expect(onChange).toHaveBeenCalledWith({ from: '', to: '' })
  })
})

describe('ConfidenceSlider', () => {
  it('says "Everything" at zero and the percentage above it, and says declared zones always show', () => {
    const { rerender } = render(<ConfidenceSlider value={0} onChange={vi.fn()} />)
    expect(screen.getByText('Everything')).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Show every model zone')
    rerender(<ConfidenceSlider value={0.34} onChange={vi.fn()} />)
    expect(screen.getByText('34%')).toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'At least 34% confidence')
    expect(screen.getByText('Zones an admin or NGO declared always show.')).toBeInTheDocument()
  })

  it('reports the new value as a number from 0 to 1', () => {
    const onChange = vi.fn()
    render(<ConfidenceSlider value={0} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider', { name: /Minimum model confidence/ }), { target: { value: '0.5' } })
    expect(onChange).toHaveBeenCalledWith(0.5)
  })
})

describe('ZoneList', () => {
  const active = makeAdminZone('b7e1a2c3-0000', { risk_level: 'high' })
  const resolved = makeAdminZone('c9d8e7f6-0000', { source: 'manual_ngo', risk_level: 'low', status: 'resolved', resolved_at: new Date(Date.now() - 60_000).toISOString() })

  it('shows each zone as a link to its page, with what made it, when, its short id and its status', () => {
    inRouter(<ZoneList zones={[active, resolved]} focusedId={null} onShowOnMap={vi.fn()} onResolve={vi.fn()} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByRole('link', { name: 'High-risk flood zone' })).toHaveAttribute('href', '/admin/hazard-zones/b7e1a2c3-0000')
    expect(rows[0]).toHaveTextContent('Model forecast')
    expect(rows[0]).toHaveTextContent('#b7e1a2c3')
    expect(within(rows[0]).getByText('Active')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('Declared by an NGO')
    expect(rows[1]).toHaveTextContent(/resolved 1 minute ago/)
    expect(within(rows[1]).getByText('Resolved')).toBeInTheDocument()
  })

  it('offers Resolve for an active zone only, and Show on map for either — each naming the zone and its id', async () => {
    const onShowOnMap = vi.fn()
    const onResolve = vi.fn()
    inRouter(<ZoneList zones={[active, resolved]} focusedId={null} onShowOnMap={onShowOnMap} onResolve={onResolve} />)
    expect(screen.getAllByRole('button', { name: /Show .* on the map/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^Resolve / })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Resolve High-risk flood zone b7e1a2c3' }))
    expect(onResolve).toHaveBeenCalledWith(active)
    await userEvent.click(screen.getByRole('button', { name: 'Show Low-risk hazard zone c9d8e7f6 on the map' }))
    expect(onShowOnMap).toHaveBeenCalledWith(resolved)
  })

  it('marks the zone the map was pointed at', () => {
    inRouter(<ZoneList zones={[active, resolved]} focusedId={active.id} onShowOnMap={vi.fn()} onResolve={vi.fn()} />)
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'true')
    expect(screen.getAllByRole('listitem')[1]).not.toHaveAttribute('aria-current')
  })
})

describe('PredictionList', () => {
  it('shows the level, model version, when it was made, its window and a confidence bar', () => {
    render(<PredictionList predictions={[makePrediction('p1', { confidence_score: 0.87 })]} />)
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('High risk')
    expect(row).toHaveTextContent('convlstm-unet-v3')
    expect(row).toHaveTextContent(/Generated 10 minutes ago/)
    expect(row).toHaveTextContent(/valid .* – /)
    expect(within(row).getByRole('progressbar', { name: 'Model confidence' })).toHaveAttribute('aria-valuenow', '87')
    expect(row).not.toHaveTextContent(/uncertainty/)
  })

  it('mentions uncertainty only when the prediction has one', () => {
    render(<PredictionList predictions={[makePrediction('p1', { uncertainty_score: 0.2 })]} />)
    expect(screen.getByRole('listitem')).toHaveTextContent('uncertainty 20%')
  })
})

describe('ResolveZoneDialog', () => {
  const target = { id: 'z1', title: 'High-risk flood zone', shortId: 'b7e1a2c3' }

  it('is closed with no target, and open with one — naming the zone and saying it can’t be undone', () => {
    const { rerender } = render(<ResolveZoneDialog target={null} onClose={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} serverError={null} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<ResolveZoneDialog target={target} onClose={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} serverError={null} />)
    const dialog = screen.getByRole('dialog', { name: 'Resolve this hazard zone?' })
    expect(dialog).toHaveTextContent('High-risk flood zone (#b7e1a2c3)')
    expect(dialog).toHaveTextContent('leaves the citizen map')
    expect(dialog).toHaveTextContent('no way to reactivate')
  })

  it('confirms, cancels, and shows a server error', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(<ResolveZoneDialog target={target} onClose={onClose} onConfirm={onConfirm} isSubmitting={false} serverError={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Resolve zone' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    rerender(<ResolveZoneDialog target={target} onClose={onClose} onConfirm={onConfirm} isSubmitting={false} serverError="boom" />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })
})

describe('the detail page’s parts', () => {
  it('ZoneDetailHeader: a way back, the title, badges, and Resolve only while active', async () => {
    const onResolve = vi.fn()
    const { rerender } = inRouter(<ZoneDetailHeader zone={makeZoneDetail('b7e1a2c3-0000')} onResolve={onResolve} />)
    expect(screen.getByRole('link', { name: 'Hazard zones' })).toHaveAttribute('href', '/admin/hazard-zones')
    expect(screen.getByRole('heading', { level: 1, name: 'High-risk flood zone' })).toBeInTheDocument()
    expect(screen.getByText('High risk')).toBeInTheDocument()
    expect(screen.getByText('Model forecast')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Resolve zone' }))
    expect(onResolve).toHaveBeenCalled()
    rerender(
      <MemoryRouter>
        <ZoneDetailHeader zone={makeZoneDetail('b7e1a2c3-0000', { status: 'resolved', resolved_at: '2026-09-24T03:00:00Z' })} onResolve={onResolve} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Resolve zone' })).not.toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it('ZoneFactsCard: source, level, status, dates, the outline’s size and the full id — with Resolved only once resolved', () => {
    const { rerender } = render(<ZoneFactsCard zone={makeZoneDetail('z1')} />)
    const card = screen.getByRole('region', { name: 'Zone' })
    for (const label of ['Source', 'Risk level', 'Status', 'Detected', 'Outline', 'Zone id']) expect(within(card).getByText(label)).toBeInTheDocument()
    expect(within(card).getByText('A polygon of 5 points')).toBeInTheDocument()
    expect(within(card).queryByText('Resolved')).not.toBeInTheDocument()
    rerender(<ZoneFactsCard zone={makeZoneDetail('z1', { status: 'resolved', resolved_at: '2026-09-24T03:00:00Z' })} />)
    expect(within(screen.getByRole('region', { name: 'Zone' })).getAllByText('Resolved').length).toBeGreaterThan(0)
  })

  it('ZonePredictionCard: a model zone shows its confidence, model, window and generation time', () => {
    render(<ZonePredictionCard zone={makeZoneDetail('z1')} />)
    const card = screen.getByRole('region', { name: 'Prediction' })
    expect(within(card).getByRole('progressbar', { name: 'Model confidence' })).toHaveAttribute('aria-valuenow', '87')
    for (const label of ['Model', 'Valid', 'Forecast made']) expect(within(card).getByText(label)).toBeInTheDocument()
    expect(within(card).getByText('convlstm-unet-v3')).toBeInTheDocument()
  })

  it('ZonePredictionCard: a declared zone says it has no prediction and shows no bar', () => {
    const manual = makeZoneDetail('z2', { source: 'manual_ngo' })
    for (const key of ['confidence_score', 'model_version', 'valid_from', 'valid_until', 'generated_at'] as const) delete manual[key]
    render(<ZonePredictionCard zone={manual} />)
    const card = screen.getByRole('region', { name: 'Prediction' })
    expect(card).toHaveTextContent('Declared by an NGO — there is no model prediction behind it')
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

describe('the states', () => {
  it('ZoneDetailState: loading, not found (no retry), and an error with retry', async () => {
    const onRetry = vi.fn()
    const { rerender } = inRouter(<ZoneDetailState kind="loading" onRetry={onRetry} />)
    expect(screen.getByLabelText('Loading hazard zone')).toHaveAttribute('aria-busy', 'true')
    rerender(
      <MemoryRouter>
        <ZoneDetailState kind="not-found" onRetry={onRetry} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Hazard zone not found' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <ZoneDetailState kind="error" message="Network Error" onRetry={onRetry} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Network Error')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('ZoneListState: a skeleton, an alert with retry, or a sentence', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<ZoneListState kind="loading" noun="zones" />)
    expect(screen.getByLabelText('Loading zones')).toHaveAttribute('aria-busy', 'true')
    rerender(<ZoneListState kind="error" noun="hazard zones" message="boom" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    rerender(<ZoneListState kind="empty" noun="zones" message="No active hazard zones." />)
    expect(screen.getByText('No active hazard zones.')).toBeInTheDocument()
  })
})

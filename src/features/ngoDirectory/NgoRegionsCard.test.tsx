import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { AdminNgoRegion } from '@/api/geo'
import { NgoRegionsCard, type NgoRegionsCardProps } from './NgoRegionsCard'

const regions: AdminNgoRegion[] = [
  { id: 'r-1', name: 'Sindh', level: 'province', path: 'Sindh', assigned_at: '2026-08-06T07:19:47Z' },
  { id: 'r-2', name: 'Sukkur City', level: 'tehsil', parent_region_id: 'r-3', path: 'Sindh › Sukkur › Sukkur City', assigned_at: '2026-09-01T07:19:47Z' },
]

function renderCard(overrides: Partial<NgoRegionsCardProps> = {}) {
  const props: NgoRegionsCardProps = { regions, error: null, onRetry: vi.fn(), ...overrides }
  render(
    <MemoryRouter>
      <NgoRegionsCard {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('NgoRegionsCard', () => {
  it('lists each region with its level and where it sits, linking to its Regions page', () => {
    renderCard()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByRole('link', { name: 'Sindh' })).toHaveAttribute('href', '/admin/regions/r-1')
    expect(rows[0]).toHaveTextContent('Province')
    expect(rows[0]).not.toHaveTextContent('›')
    expect(within(rows[1]).getByRole('link', { name: 'Sukkur City' })).toHaveAttribute('href', '/admin/regions/r-2')
    expect(rows[1]).toHaveTextContent('Tehsil · Sindh › Sukkur › Sukkur City')
    expect(rows[1]).toHaveTextContent('Assigned 1 Sep 2026')
    expect(screen.getByRole('heading', { name: /Operational regions/ })).toHaveTextContent('2')
  })

  it('says so for an organisation that covers nothing yet (for instance one still pending)', () => {
    renderCard({ regions: [] })
    expect(screen.getByText("This organisation doesn't cover any region yet.")).toBeInTheDocument()
  })

  it('shows a skeleton while loading, and a failure with a retry', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <NgoRegionsCard regions={undefined} error={null} onRetry={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('Loading regions')).toBeInTheDocument()
    unmount()

    const props = renderCard({ regions: undefined, error: 'boom' })
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.onRetry).toHaveBeenCalled()
  })
})

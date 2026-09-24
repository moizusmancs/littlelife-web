import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RegionNgo } from '@/api/geo'
import { makeNgo } from '@/features/ngoDirectory/testNgo'
import { RegionNgosCard, type RegionNgosCardProps } from './RegionNgosCard'

const ngos: RegionNgo[] = [
  { ...makeNgo('n-1', 'Indus Relief Foundation', 'active', { volunteer_count: 3, region_count: 2 }), assigned_at: '2026-09-21T08:15:00Z' },
  { ...makeNgo('n-2', 'Sindh Response Network', 'pending_approval', { volunteer_count: 1, region_count: 1 }), assigned_at: '2026-09-22T08:15:00Z' },
]

function renderCard(overrides: Partial<RegionNgosCardProps> = {}) {
  const props: RegionNgosCardProps = { ngos, error: null, onRetry: vi.fn(), ...overrides }
  render(
    <MemoryRouter>
      <RegionNgosCard {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('RegionNgosCard', () => {
  it('lists each organisation with its status, when this region was assigned, and how big it is', () => {
    renderCard()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'Indus Relief Foundation' })).toHaveAttribute('href', '/admin/ngos/n-1')
    expect(within(rows[0]).getByText('Active')).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent('Assigned 21 Sep 2026 · covers 2 regions · 3 volunteers')
    expect(within(rows[1]).getByText('Pending approval')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('covers 1 region · 1 volunteer')
    expect(screen.getByRole('heading', { name: /NGOs covering this region/ })).toHaveTextContent('2')
  })

  it('says these are direct assignments only, so an empty list is not read as "nobody can act here"', () => {
    renderCard()
    expect(screen.getByText(/One assigned to a parent region isn't listed here/)).toBeInTheDocument()
  })

  it('says so when no organisation is assigned', () => {
    renderCard({ ngos: [] })
    expect(screen.getByText('No organisation has been assigned to this region.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows a skeleton while loading', () => {
    renderCard({ ngos: undefined })
    expect(screen.getByLabelText('Loading organisations')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows a failure with a retry, in place of the list', async () => {
    const props = renderCard({ ngos: undefined, error: 'boom' })
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.onRetry).toHaveBeenCalled()
  })
})

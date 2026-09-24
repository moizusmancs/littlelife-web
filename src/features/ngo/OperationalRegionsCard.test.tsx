import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeRegion } from '@/features/regions/testRegion'
import { OperationalRegionsCard, type OperationalRegionsCardProps } from './OperationalRegionsCard'

const regions = [makeRegion('sindh', 'Sindh', 'province'), makeRegion('sukkur', 'Sukkur', 'district', 'sindh')]

function renderCard(overrides: Partial<OperationalRegionsCardProps> = {}) {
  const props: OperationalRegionsCardProps = { regions, error: null, onRetry: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn(), ...overrides }
  render(<OperationalRegionsCard {...props} />)
  return props
}

describe('OperationalRegionsCard', () => {
  it('lists each covered region as a chip with its level and a remove button named for it', () => {
    renderCard()
    const list = screen.getByRole('list')
    const chips = within(list).getAllByRole('listitem')
    expect(chips.map((c) => c.textContent)).toEqual(['SindhProvince', 'SukkurDistrict'])
    expect(screen.getByRole('button', { name: 'Remove Sindh' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Sukkur' })).toBeInTheDocument()
  })

  it('reports Add and which chip was removed', async () => {
    const props = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))
    expect(props.onAdd).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Sukkur' }))
    expect(props.onRemove).toHaveBeenCalledWith(regions[1])
  })

  it('invites adding the first region when there are none', () => {
    renderCard({ regions: [] })
    expect(screen.getByText(/No regions yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add region' })).toBeInTheDocument()
  })

  it('shows a skeleton while loading, with no Add button that could not know what is already covered', () => {
    renderCard({ regions: undefined })
    expect(screen.getByLabelText('Loading regions')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button', { name: 'Add region' })).not.toBeInTheDocument()
  })

  it('shows a failure with a retry, in place of the chips', async () => {
    const props = renderCard({ regions: undefined, error: 'boom' })
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.onRetry).toHaveBeenCalled()
  })
})

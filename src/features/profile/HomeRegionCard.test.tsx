import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HomeRegionCard, type HomeRegionCardProps } from './HomeRegionCard'

function renderCard(overrides: Partial<HomeRegionCardProps> = {}) {
  const props: HomeRegionCardProps = {
    isLoaded: true,
    label: null,
    level: null,
    path: null,
    onChoose: vi.fn(),
    onClear: vi.fn(),
    isClearing: false,
    error: null,
    ...overrides,
  }
  render(<HomeRegionCard {...props} />)
  return props
}

describe('HomeRegionCard', () => {
  it('says "Not set" as a normal state and offers to choose one — no warning, no Remove', async () => {
    const props = renderCard()
    expect(screen.getByText('Not set')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Choose region' }))
    expect(props.onChoose).toHaveBeenCalled()
  })

  it('shows the region, its level and where it sits, with Change and Remove', async () => {
    const props = renderCard({ label: 'Sukkur City, Sukkur', level: 'tehsil', path: 'Sindh › Sukkur › Sukkur City' })
    expect(screen.getByText('Sukkur City, Sukkur')).toBeInTheDocument()
    expect(screen.getByText('Tehsil · Sindh › Sukkur › Sukkur City')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(props.onChoose).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(props.onClear).toHaveBeenCalled()
  })

  it('does not repeat a province’s name as its own path', () => {
    renderCard({ label: 'Sindh', level: 'province', path: 'Sindh' })
    expect(screen.getByText('Province')).toBeInTheDocument()
    expect(screen.queryByText(/›/)).not.toBeInTheDocument()
  })

  it('shows a skeleton while the profile loads, with no buttons that could act on stale data', () => {
    renderCard({ isLoaded: false })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('Not set')).not.toBeInTheDocument()
  })

  it('disables Change and shows progress on Remove while clearing, and shows why a clear failed', () => {
    renderCard({ label: 'Sindh', level: 'province', path: 'Sindh', isClearing: true, error: 'boom' })
    expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })
})

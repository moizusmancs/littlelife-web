import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RegionPickerProps } from '@/features/regions/RegionPicker'
import { OnboardingRegionScreen, type OnboardingRegionScreenProps } from './OnboardingRegionScreen'

const picker: RegionPickerProps = {
  trail: [],
  options: [],
  matches: null,
  parentPathOf: () => '',
  search: '',
  onSearchChange: vi.fn(),
  onOpen: vi.fn(),
  onTrailSelect: vi.fn(),
  selectedId: null,
  onSelect: vi.fn(),
  unavailable: new Map(),
}

function renderScreen(overrides: Partial<OnboardingRegionScreenProps> = {}) {
  const props: OnboardingRegionScreenProps = {
    state: 'ready',
    error: null,
    onRetry: vi.fn(),
    picker,
    hasSelection: false,
    onContinue: vi.fn(),
    onSkip: vi.fn(),
    isSubmitting: false,
    serverError: null,
    ...overrides,
  }
  render(<OnboardingRegionScreen {...props} />)
  return props
}

describe('OnboardingRegionScreen', () => {
  it('asks where they live, says it is optional, and disables Continue until a region is chosen', async () => {
    const props = renderScreen()
    expect(screen.getByRole('heading', { name: 'Where do you live?', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/It's optional/)).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search regions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(props.onContinue).not.toHaveBeenCalled()
  })

  it('continues once something is chosen', async () => {
    const props = renderScreen({ hasSelection: true })
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(props.onContinue).toHaveBeenCalled()
  })

  it('offers Skip for now at the top, as a plain way forward', async () => {
    const props = renderScreen()
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(props.onSkip).toHaveBeenCalled()
  })

  it('shows a skeleton while the regions load, with Skip available and no picker yet', async () => {
    const props = renderScreen({ state: 'loading' })
    expect(screen.getByLabelText('Loading regions')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(props.onSkip).toHaveBeenCalled()
  })

  it('shows a failed load with a retry', async () => {
    const props = renderScreen({ state: 'error', error: 'boom' })
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.onRetry).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled()
  })

  it('explains an empty list and that the step can be skipped', () => {
    renderScreen({ state: 'empty' })
    expect(screen.getByText(/no regions to choose from yet/)).toBeInTheDocument()
  })

  it('shows a refused save, and stops Skip while saving', () => {
    renderScreen({ hasSelection: true, serverError: 'region not found', isSubmitting: true })
    expect(screen.getByRole('alert')).toHaveTextContent('region not found')
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeDisabled()
  })
})

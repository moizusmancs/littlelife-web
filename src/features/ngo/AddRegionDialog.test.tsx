import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RegionPickerProps } from '@/features/regions/RegionPicker'
import { AddRegionDialog, type AddRegionDialogProps } from './AddRegionDialog'

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

function renderDialog(overrides: Partial<AddRegionDialogProps> = {}) {
  const props: AddRegionDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    state: 'ready',
    error: null,
    onRetry: vi.fn(),
    picker,
    hasSelection: false,
    onConfirm: vi.fn(),
    isSubmitting: false,
    serverError: null,
    ...overrides,
  }
  render(<AddRegionDialog {...props} />)
  return props
}

describe('AddRegionDialog', () => {
  it('shows the picker when ready, and keeps Add disabled until something is chosen', async () => {
    const props = renderDialog()
    expect(screen.getByRole('searchbox', { name: 'Search regions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add region' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('confirms once a region is chosen', async () => {
    const props = renderDialog({ hasSelection: true })
    await userEvent.click(screen.getByRole('button', { name: 'Add region' }))
    expect(props.onConfirm).toHaveBeenCalled()
  })

  it('shows a skeleton while the regions load', () => {
    renderDialog({ state: 'loading' })
    expect(screen.getByLabelText('Loading regions')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('shows a failed load with a retry', async () => {
    const props = renderDialog({ state: 'error', error: 'boom' })
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(props.onRetry).toHaveBeenCalled()
  })

  it('explains an empty region list, pointing at who can fill it', () => {
    renderDialog({ state: 'empty' })
    expect(screen.getByText(/There are no regions to choose from yet/)).toBeInTheDocument()
  })

  it("shows the server's message from a failed add", () => {
    renderDialog({ hasSelection: true, serverError: 'region already assigned to this ngo' })
    expect(screen.getByText('region already assigned to this ngo')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RegionPickerDialog } from './RegionPickerDialog'
import type { RegionPickerProps } from './RegionPicker'

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

describe('RegionPickerDialog', () => {
  it('uses whatever wording the screen gives it, and confirms with its own label', async () => {
    const onConfirm = vi.fn()
    render(
      <RegionPickerDialog
        open
        onOpenChange={vi.fn()}
        title="Choose your home region"
        description="Pick where you live."
        confirmLabel="Save home region"
        state="ready"
        error={null}
        onRetry={vi.fn()}
        picker={picker}
        hasSelection
        onConfirm={onConfirm}
        isSubmitting={false}
        serverError={null}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Choose your home region' })).toBeInTheDocument()
    expect(screen.getByText('Pick where you live.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save home region' }))
    expect(onConfirm).toHaveBeenCalled()
  })
})

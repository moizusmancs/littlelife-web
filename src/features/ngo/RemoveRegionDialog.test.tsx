import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeRegion } from '@/features/regions/testRegion'
import { RemoveRegionDialog, type RemoveRegionDialogProps } from './RemoveRegionDialog'

function renderDialog(overrides: Partial<RemoveRegionDialogProps> = {}) {
  const props: RemoveRegionDialogProps = {
    target: makeRegion('sukkur', 'Sukkur', 'district', 'sindh'),
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isSubmitting: false,
    serverError: null,
    ...overrides,
  }
  render(<RemoveRegionDialog {...props} />)
  return props
}

describe('RemoveRegionDialog', () => {
  it('names the region and says nothing is deleted and it can be re-added', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: 'Remove Sukkur?' })).toBeInTheDocument()
    expect(screen.getByText(/The region itself isn't affected/)).toBeInTheDocument()
  })

  it('is closed with no target', () => {
    renderDialog({ target: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('confirms and cancels', async () => {
    const props = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Remove region' }))
    expect(props.onConfirm).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it("shows the server's message", () => {
    renderDialog({ serverError: 'region is not assigned to this ngo' })
    expect(screen.getByRole('alert')).toHaveTextContent('region is not assigned to this ngo')
  })
})

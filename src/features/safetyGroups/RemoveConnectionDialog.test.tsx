import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RemoveTarget } from './connections'
import { RemoveConnectionDialog } from './RemoveConnectionDialog'

function renderDialog(overrides: Partial<React.ComponentProps<typeof RemoveConnectionDialog>> = {}) {
  const props = {
    target: { standing: 'connected', label: 'Member 8D0D395C' } as RemoveTarget | null,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isSubmitting: false,
    serverError: null,
    ...overrides,
  }
  render(<RemoveConnectionDialog {...props} />)
  return props
}

describe('RemoveConnectionDialog', () => {
  it('is closed when nothing is selected', () => {
    renderDialog({ target: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('for a connected member, says it ends for both and stops live location', () => {
    renderDialog()

    expect(screen.getByRole('heading', { name: 'Remove Member 8D0D395C?' })).toBeInTheDocument()
    expect(screen.getByText(/ends for both of you/)).toBeInTheDocument()
    expect(screen.getByText(/live location/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove member' })).toBeInTheDocument()
  })

  it('for a request you sent, is about cancelling it, with a "keep" way out', () => {
    renderDialog({ target: { standing: 'outgoing', label: 'Member 8D0D395C' } })

    expect(screen.getByRole('heading', { name: 'Cancel your request to Member 8D0D395C?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep request' })).toBeInTheDocument()
  })

  it('for a declined one, is a plain tidy-up', () => {
    renderDialog({ target: { standing: 'declined', label: 'Member 8D0D395C' } })

    expect(screen.getByRole('heading', { name: 'Remove the request with Member 8D0D395C?' })).toBeInTheDocument()
    expect(screen.getByText('It disappears from your list and theirs. Nothing else changes.')).toBeInTheDocument()
  })

  it('reports confirm, and reports closing on the way-out button', async () => {
    const { onConfirm, onClose } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Remove member' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("shows the server's message, and disables both buttons while submitting", () => {
    renderDialog({ serverError: 'safety connection not found', isSubmitting: true })

    expect(screen.getByRole('alert')).toHaveTextContent('safety connection not found')
    expect(screen.getByRole('button', { name: 'Remove member' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NgoDecisionDialog, type NgoDecisionDialogProps } from './NgoDecisionDialog'
import { makeNgo } from './testNgo'

const ngo = makeNgo('n-1', 'Flood Relief Karachi', 'pending_approval', { created_by_email: 'founder@example.com' })

function renderDialog(overrides: Partial<NgoDecisionDialogProps> = {}) {
  const props: NgoDecisionDialogProps = {
    target: { ngo, decision: 'approve' },
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isSubmitting: false,
    serverError: null,
    ...overrides,
  }
  render(<NgoDecisionDialog {...props} />)
  return props
}

describe('NgoDecisionDialog', () => {
  it('is closed with no target', () => {
    renderDialog({ target: null })
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('for approval: names the organisation and says the applicant is promoted and signed out', () => {
    renderDialog()

    expect(screen.getByRole('heading', { name: 'Approve Flood Relief Karachi?' })).toBeInTheDocument()
    expect(screen.getByText(/promotes founder@example\.com to its NGO admin/)).toBeInTheDocument()
    expect(screen.getByText(/signed out everywhere and need to log in again/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve organisation' })).toBeInTheDocument()
  })

  it('for rejection: says the applicant stays a citizen and can reapply, and that no reason is kept', () => {
    renderDialog({ target: { ngo, decision: 'reject' } })

    expect(screen.getByRole('heading', { name: 'Reject Flood Relief Karachi?' })).toBeInTheDocument()
    expect(screen.getByText(/founder@example\.com stays a citizen and can submit a new application/)).toBeInTheDocument()
    expect(screen.getByText(/No reason is recorded/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject application' })).toBeInTheDocument()
  })

  it('reports confirm and cancel', async () => {
    const { onConfirm, onClose } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Approve organisation' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders a server error and disables actions while submitting', () => {
    renderDialog({ serverError: 'ngo not found', isSubmitting: true })

    expect(screen.getByRole('alert')).toHaveTextContent('ngo not found')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})

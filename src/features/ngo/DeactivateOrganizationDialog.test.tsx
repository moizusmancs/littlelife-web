import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeactivateOrganizationDialog } from './DeactivateOrganizationDialog'

function renderDialog(overrides: Partial<React.ComponentProps<typeof DeactivateOrganizationDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    organizationName: 'Flood Relief Karachi',
    onConfirm: vi.fn(),
    isSubmitting: false,
    serverError: null,
    ...overrides,
  }
  render(<DeactivateOrganizationDialog {...props} />)
  return props
}

describe('DeactivateOrganizationDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('names the organisation and leads with the fact that it cannot be undone', () => {
    renderDialog()

    expect(screen.getByRole('heading', { name: 'Deactivate Flood Relief Karachi?' })).toBeInTheDocument()
    expect(screen.getByText(/can't be undone/)).toBeInTheDocument()
    expect(screen.getByText(/stay signed in/)).toBeInTheDocument()
  })

  it('reports confirm and cancel', async () => {
    const { onConfirm, onOpenChange } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate organisation' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders a server error', () => {
    renderDialog({ serverError: 'ngo is not active' })
    expect(screen.getByRole('alert')).toHaveTextContent('ngo is not active')
  })
})

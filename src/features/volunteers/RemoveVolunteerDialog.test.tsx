import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RemoveVolunteerDialog } from './RemoveVolunteerDialog'

function renderDialog(overrides: Partial<React.ComponentProps<typeof RemoveVolunteerDialog>> = {}) {
  const props = {
    volunteerEmail: 'aisha@example.com' as string | null,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isSubmitting: false,
    serverError: null,
    ...overrides,
  }
  render(<RemoveVolunteerDialog {...props} />)
  return props
}

describe('RemoveVolunteerDialog', () => {
  it('is closed when there is no volunteer selected', () => {
    renderDialog({ volunteerEmail: null })
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it("names the volunteer and says what really happens — not a suspension, and reversible", () => {
    renderDialog()

    expect(
      screen.getByRole('heading', { name: 'Remove aisha@example.com from your organisation?' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/regular citizen/)).toBeInTheDocument()
    expect(screen.getByText(/isn't suspended or deleted/)).toBeInTheDocument()
    expect(screen.getByText(/invited again/)).toBeInTheDocument()
  })

  it('reports confirm, and reports closing on Cancel', async () => {
    const { onConfirm, onClose } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Remove volunteer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders a server error', () => {
    renderDialog({ serverError: 'this account is not a volunteer under your ngo' })
    expect(screen.getByRole('alert')).toHaveTextContent('this account is not a volunteer under your ngo')
  })
})

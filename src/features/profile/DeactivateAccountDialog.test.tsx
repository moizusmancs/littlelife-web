import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeactivateAccountDialog } from './DeactivateAccountDialog'

describe('DeactivateAccountDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <DeactivateAccountDialog
        open={false}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isSubmitting={false}
        serverError={null}
      />,
    )

    expect(screen.queryByRole('heading', { name: 'Deactivate your account?' })).not.toBeInTheDocument()
  })

  it('calls onConfirm when the destructive button is clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <DeactivateAccountDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isSubmitting={false}
        serverError={null}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate account' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const onOpenChange = vi.fn()
    render(
      <DeactivateAccountDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        isSubmitting={false}
        serverError={null}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders a server error banner when given one', () => {
    render(
      <DeactivateAccountDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isSubmitting={false}
        serverError="account is not active"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('account is not active')
  })
})

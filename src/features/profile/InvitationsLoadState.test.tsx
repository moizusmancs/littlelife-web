import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InvitationsLoadState } from './InvitationsLoadState'

describe('InvitationsLoadState', () => {
  it('renders a busy skeleton, no error and no retry, while loading', () => {
    render(<InvitationsLoadState error={null} onRetry={vi.fn()} />)

    expect(screen.getByLabelText('Loading your invitations')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the error and a retry button that reports the click', async () => {
    const onRetry = vi.fn()
    render(<InvitationsLoadState error="Something went wrong. Please try again." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

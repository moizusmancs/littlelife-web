import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationLoadState } from './OrganizationLoadState'

describe('OrganizationLoadState', () => {
  it('renders a busy skeleton, no error and no retry, while loading', () => {
    render(<OrganizationLoadState error={null} onRetry={vi.fn()} />)

    expect(screen.getByLabelText('Loading your organisation')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the error and a retry that reports the click', async () => {
    const onRetry = vi.fn()
    render(<OrganizationLoadState error="account is not affiliated with an ngo" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MyNgoLoadState } from './MyNgoLoadState'

describe('MyNgoLoadState', () => {
  it('renders a busy skeleton, no error and no retry, while loading', () => {
    render(<MyNgoLoadState error={null} onRetry={vi.fn()} />)

    expect(screen.getByLabelText('Loading your NGO registration')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the error and a retry button that reports the click', async () => {
    const onRetry = vi.fn()
    render(<MyNgoLoadState error="email verification required" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('email verification required')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AlertPreferencesLoadState } from './AlertPreferencesLoadState'

describe('AlertPreferencesLoadState', () => {
  it('shows a busy skeleton while loading, with no error', () => {
    render(<AlertPreferencesLoadState error={null} onRetry={vi.fn()} />)

    expect(screen.getByLabelText('Loading your alert preferences')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the failure with a retry', async () => {
    const onRetry = vi.fn()
    render(<AlertPreferencesLoadState error="boom" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

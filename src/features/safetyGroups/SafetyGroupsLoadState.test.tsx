import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SafetyGroupsLoadState } from './SafetyGroupsLoadState'

describe('SafetyGroupsLoadState', () => {
  it('shows a busy skeleton while loading, with no error', () => {
    render(<SafetyGroupsLoadState error={null} onRetry={vi.fn()} />)

    expect(screen.getByLabelText('Loading your safety groups')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the failure under the given title, with a retry', async () => {
    const onRetry = vi.fn()
    render(<SafetyGroupsLoadState error="boom" onRetry={onRetry} title="Safety Group" />)

    expect(screen.getByRole('heading', { name: 'Safety Group' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

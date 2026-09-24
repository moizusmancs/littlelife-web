import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VolunteersLoadState } from './VolunteersLoadState'

describe('VolunteersLoadState', () => {
  it('shows a busy skeleton with no error while loading', () => {
    render(<VolunteersLoadState error={null} onRetry={vi.fn()} />)

    expect(screen.getByLabelText('Loading your volunteers')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the message and a working retry after a failure', async () => {
    const onRetry = vi.fn()
    render(<VolunteersLoadState error="account is not affiliated with an ngo" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

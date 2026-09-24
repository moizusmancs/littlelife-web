import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountsNoMatches } from './AccountsNoMatches'
import { UsersLoadState } from './UsersLoadState'

describe('UsersLoadState', () => {
  it('is a busy skeleton with no error while loading', () => {
    render(<UsersLoadState error={null} onRetry={vi.fn()} />)

    expect(screen.getByLabelText('Loading accounts')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the message and a working retry after a failure', async () => {
    const onRetry = vi.fn()
    render(<UsersLoadState error="Something went wrong. Please try again." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('AccountsNoMatches', () => {
  it('says nothing matched (not that something failed) and offers to clear', async () => {
    const onClear = vi.fn()
    render(<AccountsNoMatches onClear={onClear} />)

    expect(screen.getByRole('heading', { name: 'No accounts match' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

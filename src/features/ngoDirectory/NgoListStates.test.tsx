import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NgosEmptyState } from './NgosEmptyState'
import { NgosLoadState } from './NgosLoadState'

describe('NgosLoadState', () => {
  it('is a busy skeleton with no error while loading', () => {
    render(<NgosLoadState error={null} onRetry={vi.fn()} />)
    expect(screen.getByLabelText('Loading organisations')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the message and a working retry after a failure', async () => {
    const onRetry = vi.fn()
    render(<NgosLoadState error="Something went wrong." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('NgosEmptyState', () => {
  it('for an empty pending inbox: says nothing is waiting, and offers to show everything', async () => {
    const onClear = vi.fn()
    render(<NgosEmptyState tab="pending_approval" searching={false} onClear={onClear} />)

    expect(screen.getByRole('heading', { name: 'Nothing waiting for approval' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all organisations' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('for another empty tab: says no organisation has that status', () => {
    render(<NgosEmptyState tab="suspended" searching={false} onClear={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'No organisations here' })).toBeInTheDocument()
  })

  it('while searching: says nothing matches, and the button clears the search', async () => {
    const onClear = vi.fn()
    render(<NgosEmptyState tab="active" searching onClear={onClear} />)

    expect(screen.getByRole('heading', { name: 'No organisations match' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('on the All tab with nothing to show, offers no button (there is nothing wider to go to)', () => {
    render(<NgosEmptyState tab="all" searching={false} onClear={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

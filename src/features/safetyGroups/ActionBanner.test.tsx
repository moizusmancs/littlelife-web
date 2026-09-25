import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionBanner } from './ActionBanner'

describe('ActionBanner', () => {
  it('draws nothing when there is nothing to say', () => {
    const { container } = render(<ActionBanner notice={null} onDismissNotice={vi.fn()} error={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the error as an alert and the notice as a dismissible status', async () => {
    const onDismissNotice = vi.fn()
    render(<ActionBanner notice="You're now connected." onDismissNotice={onDismissNotice} error="connection is not pending" />)

    expect(screen.getByRole('alert')).toHaveTextContent('connection is not pending')
    expect(screen.getByRole('status')).toHaveTextContent("You're now connected.")
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismissNotice).toHaveBeenCalledTimes(1)
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './switch'

describe('Switch', () => {
  it('is a labelled switch that reports its state', () => {
    render(<Switch aria-label="Push notifications" checked onCheckedChange={vi.fn()} />)

    const control = screen.getByRole('switch', { name: 'Push notifications' })
    expect(control).toBeChecked()
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('reports the opposite state on a click and on Space', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="SMS" checked={false} onCheckedChange={onCheckedChange} />)

    await userEvent.click(screen.getByRole('switch', { name: 'SMS' }))
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)

    screen.getByRole('switch', { name: 'SMS' }).focus()
    await userEvent.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledTimes(2)
  })

  it('does nothing when disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="SMS" checked={false} disabled onCheckedChange={onCheckedChange} />)

    await userEvent.click(screen.getByRole('switch', { name: 'SMS' }))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})

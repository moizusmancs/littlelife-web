import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './copy-button'

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('CopyButton', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('copies its text, says so, and goes back to "Copy" a couple of seconds later', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CopyButton text="abc-123" label="Member ID" />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy Member ID' }))

    expect(writeText).toHaveBeenCalledWith('abc-123')
    expect(screen.getByRole('button', { name: 'Copy Member ID' })).toHaveTextContent('Copied')
    expect(screen.getByRole('status')).toHaveTextContent('Member ID copied')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(screen.getByRole('button', { name: 'Copy Member ID' })).toHaveTextContent('Copy')
    expect(screen.getByRole('button', { name: 'Copy Member ID' })).not.toHaveTextContent('Copied')
  })

  it('says so when the browser refuses, so the text can be selected instead', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    render(<CopyButton text="abc-123" label="Member ID" />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy Member ID' }))

    expect(screen.getByText("Couldn't copy — select it instead")).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/select it and copy it yourself/)
  })

  it('also reports a failure when there is no clipboard API at all', async () => {
    render(<CopyButton text="abc-123" label="Member ID" />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy Member ID' }))

    expect(screen.getByText("Couldn't copy — select it instead")).toBeInTheDocument()
  })
})

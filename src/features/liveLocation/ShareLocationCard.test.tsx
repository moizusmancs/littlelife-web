import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShareLocationCard } from './ShareLocationCard'
import type { ShareStatus } from './shareStatus'

function renderCard(overrides: Partial<React.ComponentProps<typeof ShareLocationCard>> = {}) {
  const props = { status: 'off' as ShareStatus, on: false, connectedCount: 2, onChange: vi.fn(), onRetry: vi.fn(), ...overrides }
  render(<ShareLocationCard {...props} />)
  return props
}

describe('ShareLocationCard', () => {
  it('is a switch named "Share my live location", reporting the opposite state on a click', async () => {
    const { onChange } = renderCard()

    const control = screen.getByRole('switch', { name: 'Share my live location' })
    expect(control).not.toBeChecked()
    await userEvent.click(control)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('shows a share that is on as on, and turns it off with a click', async () => {
    const { onChange } = renderCard({ on: true, status: 'sharing' })

    expect(screen.getByRole('switch', { name: 'Share my live location' })).toBeChecked()
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('says who it goes to — everyone connected — and that there is no setting for one person', () => {
    const { unmount } = render(<ShareLocationCard status="off" on={false} connectedCount={3} onChange={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.getByText(/Sent to all 3 people you're connected to\. There's no setting for just one of them\./)).toBeInTheDocument()
    unmount()

    render(<ShareLocationCard status="off" on={false} connectedCount={1} onChange={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.getByText(/Sent to the 1 person you're connected to/)).toBeInTheDocument()
  })

  it('says, once and plainly, that it only works while the tab is open and in front', () => {
    renderCard()
    expect(screen.getByText(/Works only while this tab is open and in front\./)).toBeInTheDocument()
    expect(screen.getByText(/can't share location in the background/)).toBeInTheDocument()
  })

  it('is disabled, and says why, when nobody is connected', () => {
    renderCard({ connectedCount: 0 })

    expect(screen.getByRole('switch')).toBeDisabled()
    expect(screen.getByText(/Connect with someone first/)).toBeInTheDocument()
  })

  it('still lets a share that is on be turned off when the last connection has gone', () => {
    renderCard({ connectedCount: 0, on: true, status: 'sharing' })
    expect(screen.getByRole('switch')).toBeEnabled()
  })

  it.each<[ShareStatus, RegExp]>([
    ['off', /Off\. Nobody can see where you are/],
    ['paused', /Paused — this tab is in the background/],
    ['denied', /blocked location access/],
    ['locating', /Finding your position/],
    ['connecting', /Connecting/],
    ['reconnecting', /reconnecting/],
    ['sharing', /Sharing your live location/],
    ['blocked-not-allowed', /only available during an active alert/],
    ['blocked-unauthorized', /session has ended/],
    ['unsupported', /can't share your location/],
  ])('says "%s" in words, in a polite live region', (status, text) => {
    renderCard({ status, on: status !== 'off' && status !== 'denied' && status !== 'unsupported' })
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })

  it('offers Try again when the alert gate said no, or the position cannot be found — and not otherwise', async () => {
    const { onRetry } = renderCard({ status: 'blocked-not-allowed', on: true })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('has no Try again while sharing normally', () => {
    renderCard({ status: 'sharing', on: true })
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})

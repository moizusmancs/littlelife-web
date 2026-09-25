import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { MemberLiveLocationProps } from './MemberLiveLocation'
import { LIVE_FOR_MS } from './liveLocationModel'

// Real Leaflet in jsdom, prepared as the other map tests are (size the document and stub an SVG rect before importing it).
let MemberLiveLocation: typeof import('./MemberLiveLocation').MemberLiveLocation
beforeAll(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  ;(SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({})
  ;(window as unknown as { L_NO_TOUCH: boolean }).L_NO_TOUCH = true
  ;({ MemberLiveLocation } = await import('./MemberLiveLocation'))
})
afterEach(() => vi.restoreAllMocks())

const NOW = 1_000_000
const props = (overrides: Partial<MemberLiveLocationProps> = {}): MemberLiveLocationProps => ({
  name: 'Amna Khan',
  position: undefined,
  now: NOW,
  channel: 'live',
  blocked: null,
  onRetry: vi.fn(),
  ...overrides,
})
const heard = (agoMs: number) => ({ lat: 24.86, lng: 67.05, recordedAt: 't', receivedAt: NOW - agoMs })

describe('MemberLiveLocation', () => {
  it('says the member is not sharing — not "offline" — when nothing has been heard, and draws no map', () => {
    const { container } = render(<MemberLiveLocation {...props()} />)

    expect(screen.getByText("Amna Khan isn't sharing right now")).toBeInTheDocument()
    expect(screen.getByText(/appears here while they're sharing it and this page is open/)).toBeInTheDocument()
    expect(container.querySelector('.leaflet-container')).toBeNull()
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })

  it('shows a fresh position as Live, with how long ago, the coordinates in text, and a marker on a named map', () => {
    const { container } = render(<MemberLiveLocation {...props({ position: heard(12_000) })} />)

    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText(/Updated 12 s ago/)).toBeInTheDocument()
    expect(screen.getByText('24.8600, 67.0500')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Map showing where Amna Khan is' })).toBeInTheDocument()
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1)
  })

  it('a position is still live at exactly three heartbeats, and "Not live — last seen" just after', () => {
    const { unmount } = render(<MemberLiveLocation {...props({ position: heard(LIVE_FOR_MS) })} />)
    expect(screen.getByText('Live')).toBeInTheDocument()
    unmount()

    const { container } = render(<MemberLiveLocation {...props({ position: heard(LIVE_FOR_MS + 1000) })} />)
    expect(screen.getByText('Not live')).toBeInTheDocument()
    expect(screen.getByText(/Last seen 46 s ago/)).toBeInTheDocument()
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1) // where they last were is still worth showing
  })

  it('says what this browser is doing when nothing has been heard: connecting, reconnecting', () => {
    const { unmount } = render(<MemberLiveLocation {...props({ channel: 'connecting' })} />)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
    unmount()
    render(<MemberLiveLocation {...props({ channel: 'reconnecting' })} />)
    expect(screen.getByText(/Connection lost — reconnecting/)).toBeInTheDocument()
  })

  it('explains a channel the backend refused, and offers Try again for the alert gate only', async () => {
    const onRetry = vi.fn()
    const { unmount } = render(<MemberLiveLocation {...props({ channel: 'blocked', blocked: 'not-allowed', onRetry })} />)
    expect(screen.getByText('Live location is only available during an active alert.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    unmount()

    render(<MemberLiveLocation {...props({ channel: 'blocked', blocked: 'unauthorized' })} />)
    expect(screen.getByText(/Your session has ended/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})

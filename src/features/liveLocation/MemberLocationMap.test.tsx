import { render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let MemberLocationMap: typeof import('./MemberLocationMap').MemberLocationMap
let LeafletMap: typeof import('leaflet').Map
beforeAll(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  ;(SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({})
  ;(window as unknown as { L_NO_TOUCH: boolean }).L_NO_TOUCH = true
  ;({ MemberLocationMap } = await import('./MemberLocationMap'))
  ;({ Map: LeafletMap } = await import('leaflet'))
})
afterEach(() => vi.restoreAllMocks())

describe('MemberLocationMap', () => {
  it('is a named group with one marker, not a tab stop', () => {
    const { container, getByRole } = render(<MemberLocationMap position={[24.86, 67.05]} live label="Map showing where Amna is" />)

    expect(getByRole('group', { name: 'Map showing where Amna is' })).toBeInTheDocument()
    const marker = container.querySelector('.leaflet-marker-icon')
    expect(marker).not.toBeNull()
    expect(marker).not.toHaveAttribute('tabindex')
  })

  it('colours the marker teal while live and grey when stale', () => {
    const live = render(<MemberLocationMap position={[24.86, 67.05]} live label="m" />)
    expect(live.container.querySelector('.leaflet-marker-icon')?.innerHTML).toContain('#1f7a8c')
    live.unmount()

    const stale = render(<MemberLocationMap position={[24.86, 67.05]} live={false} label="m" />)
    expect(stale.container.querySelector('.leaflet-marker-icon')?.innerHTML).toContain('#b79aa6')
  })

  it('follows the member to a new position', () => {
    const setView = vi.spyOn(LeafletMap.prototype, 'setView')
    const { rerender } = render(<MemberLocationMap position={[24.86, 67.05]} live label="m" />)
    setView.mockClear()

    rerender(<MemberLocationMap position={[24.9, 67.1]} live label="m" />)

    expect(setView).toHaveBeenCalledWith([24.9, 67.1], expect.any(Number), expect.anything())
  })

  it('stops following once the viewer has touched the map — it is theirs after that', () => {
    const setView = vi.spyOn(LeafletMap.prototype, 'setView')
    const { container, rerender } = render(<MemberLocationMap position={[24.86, 67.05]} live label="m" />)
    container.querySelector('.leaflet-container')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    setView.mockClear()

    rerender(<MemberLocationMap position={[24.9, 67.1]} live label="m" />)

    expect(setView).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeRegion } from '@/features/regions/testRegion'
import type { LocationPickerProps } from './LocationPicker'

// The same jsdom preparation as MapCanvas.test: Leaflet decides layout and SVG support at load time, so size the document and
// stub an SVG rect *before* importing it, and turn off its touch emulation.
let LocationPicker: typeof import('./LocationPicker').LocationPicker
let LeafletMap: typeof import('leaflet').Map
beforeAll(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  ;(SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({})
  ;(window as unknown as { L_NO_TOUCH: boolean }).L_NO_TOUCH = true
  ;({ LocationPicker } = await import('./LocationPicker'))
  ;({ Map: LeafletMap } = await import('leaflet'))
})
afterEach(() => vi.restoreAllMocks())

const props = (overrides: Partial<LocationPickerProps> = {}): LocationPickerProps => ({ value: null, onChange: vi.fn(), label: 'Map for choosing a location', ...overrides })

describe('LocationPicker', () => {
  it('is a named group holding the map', () => {
    const { container, getByRole } = render(<LocationPicker {...props()} />)
    expect(getByRole('group', { name: 'Map for choosing a location' })).toBeInTheDocument()
    expect(container.querySelector('.leaflet-container')).not.toBeNull()
  })

  it('draws no pin until there is a point, then draws one — and it is not a tab stop, since it cannot be moved from the keyboard', () => {
    const { container, rerender } = render(<LocationPicker {...props()} />)
    expect(container.querySelector('.leaflet-marker-icon')).toBeNull()
    rerender(<LocationPicker {...props({ value: [24.9, 67.1] })} />)
    const pin = container.querySelector('.leaflet-marker-icon')
    expect(pin).not.toBeNull()
    expect(pin).toHaveAttribute('title', 'Shelter location — drag to adjust')
    expect(pin).not.toHaveAttribute('tabindex')
  })

  it('reports a click on the map as a point, rounded to about a metre', () => {
    const onChange = vi.fn()
    const { container } = render(<LocationPicker {...props({ onChange })} />)
    fireEvent.click(container.querySelector('.leaflet-container')!, { clientX: 400, clientY: 300 })
    expect(onChange).toHaveBeenCalledTimes(1)
    const [lat, lng] = onChange.mock.calls[0][0] as [number, number]
    expect(Number.isFinite(lat) && Number.isFinite(lng)).toBe(true)
    expect(lat).toBe(Number(lat.toFixed(6)))
    expect(lng).toBe(Number(lng.toFixed(6)))
    // The frame is Pakistan, so a click in the middle of it is somewhere in the country.
    expect(lat).toBeGreaterThan(23)
    expect(lat).toBeLessThan(38)
    expect(lng).toBeGreaterThan(60)
    expect(lng).toBeLessThan(78)
  })

  it('brings the map to a point set from outside — typed coordinates, "use my location" — at a zoom where the pin can be checked', () => {
    const { rerender } = render(<LocationPicker {...props()} />)
    const setView = vi.spyOn(LeafletMap.prototype, 'setView')
    rerender(<LocationPicker {...props({ value: [24.9, 67.1] })} />)
    expect(setView).toHaveBeenCalledTimes(1)
    const [center, zoom] = setView.mock.calls[0]
    expect(center).toEqual([24.9, 67.1])
    expect(zoom).toBeGreaterThanOrEqual(13)
  })

  it('does not move the map for a point the person just placed by clicking — it is already where they are looking', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<LocationPicker {...props({ onChange })} />)
    fireEvent.click(container.querySelector('.leaflet-container')!, { clientX: 400, clientY: 300 })
    const placed = onChange.mock.calls[0][0] as [number, number]
    const setView = vi.spyOn(LeafletMap.prototype, 'setView')
    rerender(<LocationPicker {...props({ onChange, value: placed })} />)
    expect(setView).not.toHaveBeenCalled()
  })

  it('opens on a point it is given, instead of the country', () => {
    const fitBounds = vi.spyOn(LeafletMap.prototype, 'fitBounds')
    render(<LocationPicker {...props({ value: [24.9, 67.1] })} />)
    expect(fitBounds).not.toHaveBeenCalled()
  })

  describe('with regions to show', () => {
    const box = (west: number, south: number, east: number, north: number) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] })
    const sindh = makeRegion('sindh', 'Sindh', 'province', undefined, { boundary: box(67, 24, 70, 28) })
    const sukkur = makeRegion('sukkur', 'Sukkur', 'district', 'sindh', { boundary: box(68.5, 27.4, 69.2, 28) })
    const far = makeRegion('far', 'Far District', 'province', undefined, { boundary: box(74, 31, 74.1, 31.1) })
    // jsdom's SVG elements have no classList, so Leaflet's own class replaces any custom one — find the shapes by that (see MapCanvas.test).
    const shapes = (container: HTMLElement) => container.querySelectorAll('path.leaflet-interactive')

    it('shades every region on the map, and says places can only be added inside the shaded areas', () => {
      const { container } = render(<LocationPicker {...props({ areas: [sindh, sukkur] })} />)
      expect(shapes(container)).toHaveLength(2)
      expect(screen.getByText('Places can only be added inside the shaded areas.')).toBeInTheDocument()
    })

    it('draws nothing extra — no shapes, no menu, no note — when there are no regions (still loading, failed, or none)', () => {
      const { container, rerender } = render(<LocationPicker {...props()} />)
      expect(shapes(container)).toHaveLength(0)
      expect(screen.queryByRole('combobox', { name: 'Jump to an area' })).not.toBeInTheDocument()
      expect(screen.queryByText(/shaded areas/)).not.toBeInTheDocument()
      rerender(<LocationPicker {...props({ areas: [] })} />)
      expect(shapes(container)).toHaveLength(0)
    })

    it('leaves out a region it cannot draw', () => {
      const odd = makeRegion('odd', 'Odd', 'province', undefined, { boundary: { type: 'Point', coordinates: [67, 24] } })
      const { container } = render(<LocationPicker {...props({ areas: [sindh, odd] })} />)
      expect(shapes(container)).toHaveLength(1)
    })

    it('a click on a shaded area still places the pin', () => {
      const onChange = vi.fn()
      const { container } = render(<LocationPicker {...props({ onChange, areas: [sindh] })} />)
      fireEvent.click(shapes(container)[0], { clientX: 400, clientY: 300 })
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('opens on all the shaded areas once they arrive — the box around them — and only then', () => {
      const { rerender } = render(<LocationPicker {...props()} />)
      const fitBounds = vi.spyOn(LeafletMap.prototype, 'fitBounds') // after the map's own first frame of Pakistan
      rerender(<LocationPicker {...props()} />)
      expect(fitBounds).not.toHaveBeenCalled()
      rerender(<LocationPicker {...props({ areas: [sindh, far] })} />)
      expect(fitBounds).toHaveBeenCalledTimes(1)
      const [bounds, options] = fitBounds.mock.calls[0]
      expect(bounds).toEqual([
        [24, 67],
        [31.1, 74.1],
      ])
      expect(options).toMatchObject({ animate: false })
      // A later change of regions does not pull the map away from where the person has taken it.
      rerender(<LocationPicker {...props({ areas: [sindh, far, sukkur] })} />)
      expect(fitBounds).toHaveBeenCalledTimes(1)
    })

    it('does not move the map to the areas when there is already a pin — that says where to look', () => {
      const fitBounds = vi.spyOn(LeafletMap.prototype, 'fitBounds')
      const { rerender } = render(<LocationPicker {...props({ value: [27.7, 68.9] })} />)
      rerender(<LocationPicker {...props({ value: [27.7, 68.9], areas: [sindh] })} />)
      expect(fitBounds).not.toHaveBeenCalled()
    })

    it('shows a typed point that is in none of the areas together with them, instead of zooming in on a blank map', () => {
      const { rerender } = render(<LocationPicker {...props({ areas: [sindh] })} />)
      const fitBounds = vi.spyOn(LeafletMap.prototype, 'fitBounds')
      rerender(<LocationPicker {...props({ areas: [sindh], value: [30.37, 67.36] })} />)
      expect(fitBounds).toHaveBeenCalledTimes(1)
      // Sindh is 24–28°N, 67–70°E; the point is north of it.
      expect(fitBounds.mock.calls[0][0]).toEqual([
        [24, 67],
        [30.37, 70],
      ])
    })

    it('zooms in on a typed point that is inside one, as it does with no regions at all', () => {
      const { rerender } = render(<LocationPicker {...props({ areas: [sindh] })} />)
      const fitBounds = vi.spyOn(LeafletMap.prototype, 'fitBounds')
      const setView = vi.spyOn(LeafletMap.prototype, 'setView')
      rerender(<LocationPicker {...props({ areas: [sindh], value: [25.5, 68.5] })} />)
      expect(fitBounds).not.toHaveBeenCalled()
      expect(setView).toHaveBeenCalledTimes(1)
      expect(setView.mock.calls[0][0]).toEqual([25.5, 68.5])
    })

    it('has a menu that lists every area by its whole path, in tree order', () => {
      render(<LocationPicker {...props({ areas: [sukkur, far, sindh] })} />)
      const menu = screen.getByRole('combobox', { name: 'Jump to an area' })
      const labels = Array.from(menu.querySelectorAll('option')).map((option) => option.textContent)
      expect(labels).toEqual(['Jump to an area…', 'Far District', 'Sindh', 'Sindh › Sukkur'])
    })

    it('jumps to the area chosen — and does it again when the same one is chosen after moving away', async () => {
      const { rerender } = render(<LocationPicker {...props({ areas: [sindh, sukkur] })} />)
      const fitBounds = vi.spyOn(LeafletMap.prototype, 'fitBounds')
      const menu = screen.getByRole('combobox', { name: 'Jump to an area' })
      await userEvent.selectOptions(menu, 'Sindh › Sukkur')
      expect(fitBounds).toHaveBeenCalledTimes(1)
      const [bounds, options] = fitBounds.mock.calls[0]
      expect(bounds).toEqual([
        [27.4, 68.5],
        [28, 69.2],
      ])
      expect(options).toMatchObject({ maxZoom: 13, animate: false })
      // The menu goes back to its prompt, so the same choice is a fresh choice.
      expect(menu).toHaveValue('')
      await userEvent.selectOptions(menu, 'Sindh › Sukkur')
      expect(fitBounds).toHaveBeenCalledTimes(2)
      rerender(<LocationPicker {...props({ areas: [sindh, sukkur] })} />)
      expect(fitBounds).toHaveBeenCalledTimes(2)
    })
  })
})

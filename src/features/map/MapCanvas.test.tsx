import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { MapCanvasProps } from './MapCanvas'
import { essentialPlace, infrastructurePlace, shelterPlace } from './mapModel'
import { makeEssential, makeHazard, makeInfrastructure, makeShelter } from './testMap'

// jsdom has no layout and no SVG capability, and Leaflet decides both at load time — so give the document a size and
// an SVG rect *before* Leaflet is imported, then import the canvas lazily. `L_NO_TOUCH` turns off Leaflet's double-tap
// emulation, which jsdom (it claims touch support) would otherwise run on two quick clicks with coordinates it doesn't have.
let MapCanvas: typeof import('./MapCanvas').MapCanvas
let LeafletMap: typeof import('leaflet').Map
/** What every element measures — mutable, so a test can hide the map (0×0) and show it again. */
const containerSize = { width: 800, height: 600 }
beforeAll(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => containerSize.width })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => containerSize.height })
  ;(SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({})
  ;(window as unknown as { L_NO_TOUCH: boolean }).L_NO_TOUCH = true
  ;({ MapCanvas } = await import('./MapCanvas'))
  ;({ Map: LeafletMap } = await import('leaflet'))
})

const shelter = shelterPlace(makeShelter('s1', 'GBHS Johi', { capacity_current: 210, capacity_total: 400 }))
const hospital = infrastructurePlace(makeInfrastructure('i1', 'General Hospital', { status: 'at_risk' }))
const pharmacy = essentialPlace(makeEssential('e1', 'Corner Pharmacy', { current_status: 'open' }))

function props(overrides: Partial<MapCanvasProps> = {}): MapCanvasProps {
  return {
    initialBounds: [[27, 68], [28, 69.5]],
    hazards: [makeHazard('h-high', 'high', 0.87), makeHazard('h-manual', 'medium')],
    places: [shelter, hospital, pharmacy],
    selectedHazardId: null,
    selectedPlaceKey: null,
    userPosition: null,
    focus: null,
    onViewportChange: vi.fn(),
    onSelectHazard: vi.fn(),
    onSelectPlace: vi.fn(),
    onRecenter: vi.fn(),
    locating: false,
    legend: <p>legend content</p>,
    ...overrides,
  }
}

describe('MapCanvas — flying to a focus', () => {
  const focus = () => ({ bounds: [[27, 68], [28, 69]] as [[number, number], [number, number]] }) // a new object each time, as the page makes one per request

  it('does nothing while the map has no size, and once it is shown flies without taking the page down (flyTo divides by the size: on a map cached as 0×0 it is NaN)', async () => {
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => errors.push(event.error)
    window.addEventListener('error', onError)
    try {
      // Mounted while hidden — the phone's list view — so Leaflet has cached 0×0.
      containerSize.width = 0
      containerSize.height = 0
      const { rerender } = render(<MapCanvas {...props()} />)
      const fly = vi.spyOn(LeafletMap.prototype, 'flyToBounds')
      rerender(<MapCanvas {...props({ focus: focus() })} />)
      expect(fly).not.toHaveBeenCalled() // still hidden: nothing to fly across

      // Shown in the same update as a request to fly (choosing a zone in the list) — before any size observer could have run.
      containerSize.width = 390
      containerSize.height = 722
      rerender(<MapCanvas {...props({ focus: focus() })} />)
      expect(fly).toHaveBeenCalledTimes(1)
      await new Promise((resolve) => setTimeout(resolve, 120)) // a few animation frames
      expect(errors).toEqual([])
      fly.mockRestore()
    } finally {
      window.removeEventListener('error', onError)
      containerSize.width = 800
      containerSize.height = 600
    }
  })
})

describe('MapCanvas — resizing', () => {
  // jsdom has no ResizeObserver: a stand-in that hands the test the callback, so it can say what the container measured.
  const observed: Array<(entries: Array<{ contentRect: { width: number; height: number } }>) => void> = []
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) {
          observed.push(callback)
        }
        observe() {}
        disconnect() {}
      },
    )
  })
  afterAll(() => vi.unstubAllGlobals())

  it('re-measures when the container changes size, but not when it has been hidden (0×0) — measuring a hidden map pans it by half its size, and back again on the way in', () => {
    render(<MapCanvas {...props()} />)
    const invalidate = vi.spyOn(LeafletMap.prototype, 'invalidateSize')
    const callback = observed[observed.length - 1]
    callback([{ contentRect: { width: 0, height: 0 } }])
    callback([{ contentRect: { width: 390, height: 0 } }])
    expect(invalidate).not.toHaveBeenCalled()
    callback([{ contentRect: { width: 390, height: 722 } }])
    expect(invalidate).toHaveBeenCalledTimes(1)
    invalidate.mockRestore()
  })
})

describe('MapCanvas — places', () => {
  it('draws each place as a focusable marker named by its name, type and status', () => {
    render(<MapCanvas {...props()} />)
    expect(screen.getByRole('button', { name: 'GBHS Johi, Shelter, Open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'General Hospital, Hospital, At risk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Corner Pharmacy, Pharmacy, Open' })).toBeInTheDocument()
  })

  it('reports which place was chosen, by key', async () => {
    const onSelectPlace = vi.fn()
    render(<MapCanvas {...props({ onSelectPlace })} />)
    await userEvent.click(screen.getByRole('button', { name: 'General Hospital, Hospital, At risk' }))
    expect(onSelectPlace).toHaveBeenCalledWith('infrastructure:i1')
  })

  it('chooses the focused marker on Enter and on Space — and on nothing else — since Leaflet leaves those to the app', async () => {
    const onSelectPlace = vi.fn()
    render(<MapCanvas {...props({ onSelectPlace })} />)
    const marker = screen.getByRole('button', { name: 'General Hospital, Hospital, At risk' })
    marker.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelectPlace).toHaveBeenCalledTimes(1)
    expect(onSelectPlace).toHaveBeenLastCalledWith('infrastructure:i1')
    await userEvent.keyboard(' ')
    expect(onSelectPlace).toHaveBeenCalledTimes(2)
    await userEvent.keyboard('a')
    await userEvent.keyboard('{Shift}')
    expect(onSelectPlace).toHaveBeenCalledTimes(2)
  })

  it('labels only the selected place, with its capacity for a shelter', () => {
    const { container, rerender } = render(<MapCanvas {...props()} />)
    expect(container.querySelector('.leaflet-tooltip')).toBeNull()
    rerender(<MapCanvas {...props({ selectedPlaceKey: shelter.key })} />)
    expect(container.querySelector('.leaflet-tooltip')).toHaveTextContent('GBHS Johi · 210/400')
    rerender(<MapCanvas {...props({ selectedPlaceKey: hospital.key })} />)
    expect(container.querySelector('.leaflet-tooltip')).toHaveTextContent('General Hospital')
  })

  it('draws the viewer’s own position as a marker that is not a control', () => {
    const { container } = render(<MapCanvas {...props({ userPosition: [27.5, 68.5] })} />)
    // three places + the user dot
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /your location/i })).not.toBeInTheDocument()
  })
})

// jsdom's SVG elements have no `classList`, so Leaflet's second `addClass` (its own `leaflet-interactive`) overwrites the
// custom class name here — a real browser keeps both, which the E2E checks. Polygons are found by Leaflet's own class.
const zonePaths = (container: HTMLElement) => Array.from(container.querySelectorAll('path.leaflet-interactive'))

describe('MapCanvas — hazard zones', () => {
  it('draws each zone as a polygon and reports a click by id', async () => {
    const onSelectHazard = vi.fn()
    const { container } = render(<MapCanvas {...props({ onSelectHazard })} />)
    const paths = zonePaths(container)
    expect(paths).toHaveLength(2)

    const high = paths.find((path) => path.getAttribute('stroke') === '#d42e2e') as Element
    await userEvent.click(high)
    expect(onSelectHazard).toHaveBeenCalledWith('h-high')
  })

  it('draws the outline in the risk colour, a model zone’s fill from its confidence, and a manual zone flat', () => {
    const { container } = render(<MapCanvas {...props()} />)
    const paths = zonePaths(container)
    const high = paths.find((path) => path.getAttribute('stroke') === '#d42e2e')
    const manual = paths.find((path) => path.getAttribute('stroke') === '#f0740b')
    expect(high?.getAttribute('fill')).toMatch(/^rgb\(/)
    expect(high?.getAttribute('fill')).not.toBe('#d42e2e')
    expect(manual?.getAttribute('fill')).toBe('#f0740b')
    expect(manual?.getAttribute('fill-opacity')).toBe('0.35')
  })

  it('skips a zone whose boundary can’t be drawn instead of crashing', () => {
    const broken = { ...makeHazard('h-bad', 'high', 0.5), boundary: { type: 'Polygon', coordinates: 'nope' } }
    const { container } = render(<MapCanvas {...props({ hazards: [broken, makeHazard('h-ok', 'low', 0.2)] })} />)
    expect(zonePaths(container)).toHaveLength(1)
  })

  it('draws the selected zone with a heavier outline', () => {
    const { container } = render(<MapCanvas {...props({ selectedHazardId: 'h-high' })} />)
    const paths = zonePaths(container)
    const width = (color: string) => Number(paths.find((path) => path.getAttribute('stroke') === color)?.getAttribute('stroke-width'))
    expect(width('#d42e2e')).toBeGreaterThan(width('#f0740b'))
  })

  it('draws the least severe zones first so the worst sits on top and stays clickable, whatever order they arrive in', () => {
    const wide = (id: string, risk: 'low' | 'medium' | 'high') => makeHazard(id, risk, 0.5, [68, 27])
    const { container } = render(<MapCanvas {...props({ hazards: [wide('h1', 'high'), wide('l1', 'low'), wide('m1', 'medium')].map((z, i) => ({ ...z, boundary: makeHazard('x', 'low', 0.5, [68 + i * 0.01, 27]).boundary })) })} />)
    const strokes = zonePaths(container).map((path) => path.getAttribute('stroke'))
    expect(strokes).toEqual(['#e0a100', '#f0740b', '#d42e2e'])
  })

  it('brings the selected zone to the front, over zones drawn after it', () => {
    const hazards = [makeHazard('h-high', 'high', 0.9, [68, 27]), makeHazard('h-low', 'low', 0.1, [68.02, 27])]
    const { container, rerender } = render(<MapCanvas {...props({ hazards })} />)
    const strokes = () => zonePaths(container).map((path) => path.getAttribute('stroke'))
    expect(strokes()).toEqual(['#e0a100', '#d42e2e'])
    rerender(<MapCanvas {...props({ hazards, selectedHazardId: 'h-low' })} />)
    expect(strokes()).toEqual(['#d42e2e', '#e0a100'])
  })

  it('redraws a zone when its style changes (selection), rather than leaving the first drawing', () => {
    const { container, rerender } = render(<MapCanvas {...props()} />)
    const widthOfHigh = () => Number(zonePaths(container).find((path) => path.getAttribute('stroke') === '#d42e2e')?.getAttribute('stroke-width'))
    const unselected = widthOfHigh()
    rerender(<MapCanvas {...props({ selectedHazardId: 'h-high' })} />)
    expect(widthOfHigh()).toBeGreaterThan(unselected)
    rerender(<MapCanvas {...props({ selectedHazardId: null })} />)
    expect(widthOfHigh()).toBe(unselected)
  })
})

describe('MapCanvas — viewport and controls', () => {
  it('reports the visible box on mount, as west < east and south < north', async () => {
    const onViewportChange = vi.fn()
    render(<MapCanvas {...props({ onViewportChange })} />)
    await waitFor(() => expect(onViewportChange).toHaveBeenCalled())
    const view = onViewportChange.mock.calls[0][0]
    expect(view.west).toBeLessThan(view.east)
    expect(view.south).toBeLessThan(view.north)
  })

  it('has labelled buttons for the legend, my location and zoom', () => {
    render(<MapCanvas {...props()} />)
    for (const name of ['Map legend', 'Go to my location', 'Zoom in', 'Zoom out']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('has no locate button on a screen that gives it nothing to do', () => {
    render(<MapCanvas {...props({ onRecenter: undefined })} />)
    expect(screen.queryByRole('button', { name: 'Go to my location' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
  })

  it('asks the page to find the viewer when "my location" is pressed, and shows it is working', async () => {
    const onRecenter = vi.fn()
    const { rerender } = render(<MapCanvas {...props({ onRecenter })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Go to my location' }))
    expect(onRecenter).toHaveBeenCalledTimes(1)
    rerender(<MapCanvas {...props({ onRecenter, locating: true })} />)
    expect(screen.getByRole('button', { name: 'Go to my location' })).toBeDisabled()
  })

  it('opens the legend beside its button, and closes it with its X or Escape', async () => {
    render(<MapCanvas {...props()} />)
    const toggle = screen.getByRole('button', { name: 'Map legend' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    const dialog = screen.getByRole('dialog', { name: 'Map legend' })
    expect(within(dialog).getByText('legend content')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close legend' }))
    expect(screen.queryByRole('dialog', { name: 'Map legend' })).not.toBeInTheDocument()

    await userEvent.click(toggle)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Map legend' })).not.toBeInTheDocument()
  })

  it('fits the opening bounds without animating, and again when better ones arrive', () => {
    const fit = vi.spyOn(LeafletMap.prototype, 'fitBounds')
    try {
      const { rerender } = render(<MapCanvas {...props({ initialBounds: [[24, 60], [37, 78]] })} />)
      rerender(<MapCanvas {...props({ initialBounds: [[27, 68], [28, 69.5]] })} />)
      // (MapContainer makes its own first fit; the ones with padding are the canvas's.)
      const ours = fit.mock.calls.filter(([, options]) => (options as { padding?: unknown } | undefined)?.padding)
      expect(ours.map(([bounds]) => bounds)).toEqual([[[24, 60], [37, 78]], [[27, 68], [28, 69.5]]])
      for (const [, options] of ours) expect(options).toMatchObject({ animate: false })
    } finally {
      fit.mockRestore()
    }
  })

  it('zooms with the + and − buttons, so the visible area shrinks and grows', async () => {
    const onViewportChange = vi.fn()
    render(<MapCanvas {...props({ onViewportChange })} />)
    const widths = () => onViewportChange.mock.calls.map(([view]) => view.east - view.west)
    // Wait for the map to settle on the initial bounds (about 2°) before measuring anything.
    await waitFor(() => expect(widths().at(-1)).toBeLessThan(5))
    const start = widths().at(-1) as number

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    await waitFor(() => expect(widths().at(-1)).toBeLessThan(start))
    const zoomedIn = widths().at(-1) as number
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    await waitFor(() => expect(widths().at(-1)).toBeGreaterThan(zoomedIn))
  })
})

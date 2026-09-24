import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoundaryPreview } from './BoundaryPreview'
import type { PolygonGeometry } from './geojson'

const ring = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]

describe('BoundaryPreview', () => {
  it('draws a labelled outline, one closed subpath per ring so a hole is cut out', () => {
    const polygon: PolygonGeometry = { type: 'Polygon', coordinates: [ring(0, 0, 10), ring(2, 2, 2)] }
    const { container } = render(<BoundaryPreview polygon={polygon} label="Outline of Test" />)

    expect(screen.getByRole('img', { name: 'Outline of Test' })).toBeInTheDocument()
    const path = container.querySelector('path')
    expect(path?.getAttribute('fill-rule')).toBe('evenodd')
    expect(path?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    expect(path?.getAttribute('d')?.match(/Z/g)).toHaveLength(2)
  })

  it('keeps the shape true to the ground: north is up and longitude is squeezed away from the equator', () => {
    // 2° wide × 1° tall at 60°N is roughly square (cos 60° = 0.5).
    const polygon: PolygonGeometry = { type: 'Polygon', coordinates: [[[10, 60], [12, 60], [12, 61], [10, 61], [10, 60]]] }
    const { container } = render(<BoundaryPreview polygon={polygon} label="x" />)
    const [, , width, height] = (container.querySelector('svg')?.getAttribute('viewBox') ?? '').split(' ').map(Number)
    expect(width / height).toBeGreaterThan(0.9)
    expect(width / height).toBeLessThan(1.3)

    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    const ys = d.split(/(?=[ML])/).map((segment) => Number(segment.slice(1).split(' ')[1]))
    expect(ys[0]).toBeGreaterThan(ys[2])
  })

  it('does not blow up on a degenerate outline of a single point', () => {
    const polygon: PolygonGeometry = { type: 'Polygon', coordinates: [[[5, 5], [5, 5], [5, 5], [5, 5]]] }
    const { container } = render(<BoundaryPreview polygon={polygon} label="x" />)
    expect(container.querySelector('path')?.getAttribute('d')).not.toMatch(/NaN|Infinity/)
  })

  it('thins a very dense ring instead of drawing every point, keeping it closed', () => {
    const n = 20000
    const points: [number, number][] = Array.from({ length: n }, (_, i) => [Math.cos((2 * Math.PI * i) / n), Math.sin((2 * Math.PI * i) / n)])
    points.push(points[0])
    const { container } = render(<BoundaryPreview polygon={{ type: 'Polygon', coordinates: [points] }} label="x" />)
    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    expect(d.match(/L/g)!.length).toBeLessThan(2000)
    expect(d.endsWith('Z')).toBe(true)
  })
})

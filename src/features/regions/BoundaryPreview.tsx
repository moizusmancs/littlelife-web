import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { PolygonGeometry } from './geojson'

const LONGEST_SIDE = 240
const PADDING = 8
const MAX_POINTS_PER_RING = 1500

interface Projected {
  path: string
  width: number
  height: number
}

/**
 * Longitude/latitude onto a flat drawing: longitude is squeezed by cos(latitude) so a region isn't
 * stretched east–west, north points up, and the longer side is scaled to a fixed size. Very dense
 * rings are thinned — this is a thumbnail for eyeballing a shape, not the boundary itself.
 */
function project(polygon: PolygonGeometry): Projected {
  const points = polygon.coordinates.flat()
  const lngs = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  const [minLng, maxLng, minLat, maxLat] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)]
  const squeeze = Math.max(0.01, Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180))
  const spanX = (maxLng - minLng) * squeeze
  const spanY = maxLat - minLat
  const scale = LONGEST_SIDE / (Math.max(spanX, spanY) || 1)

  const path = polygon.coordinates
    .map((ring) => {
      const stride = Math.max(1, Math.ceil(ring.length / MAX_POINTS_PER_RING))
      const kept = ring.filter((_, i) => i % stride === 0 || i === ring.length - 1)
      return (
        kept
          .map(([lng, lat], i) => {
            const x = PADDING + (lng - minLng) * squeeze * scale
            const y = PADDING + (maxLat - lat) * scale
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
          })
          .join('') + 'Z'
      )
    })
    .join('')

  return { path, width: spanX * scale + PADDING * 2, height: spanY * scale + PADDING * 2 }
}

export interface BoundaryPreviewProps {
  polygon: PolygonGeometry
  /** Read by screen readers in place of the picture. */
  label: string
  className?: string
}

/** A region's outline drawn as an inline SVG — holes cut out — until the shared map component exists. */
export function BoundaryPreview({ polygon, label, className }: BoundaryPreviewProps) {
  const { path, width, height } = useMemo(() => project(polygon), [polygon])
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width.toFixed(1)} ${height.toFixed(1)}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('block w-full', className)}
    >
      <path d={path} fillRule="evenodd" strokeLinejoin="round" strokeWidth={2} vectorEffect="non-scaling-stroke" className="fill-primary-50 stroke-primary-500" />
    </svg>
  )
}

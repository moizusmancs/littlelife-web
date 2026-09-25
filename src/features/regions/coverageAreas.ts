import type { Region, RegionLevel } from '@/api/geo'
import { boundaryBounds, boundaryToLatLngs, unionBounds, type BoundsTuple, type LatLng } from '@/features/map/mapGeo'
import { REGION_LEVELS, buildRegionTree, type RegionNode } from './regionTree'

/** A region as a map draws it: its outline as Leaflet positions and the box around it. */
export interface CoverageArea {
  id: string
  name: string
  level: RegionLevel
  positions: LatLng[][] | LatLng[][][]
  bounds: BoundsTuple
}

/**
 * The regions whose boundary can be drawn (the API stores whatever it was given, so some may not be), **widest level first** — a district is
 * painted after its province, so it sits on top and is the one under the pointer. Same level keeps the API's order.
 */
export function drawableAreas(regions: readonly Region[]): CoverageArea[] {
  return regions
    .flatMap((region): CoverageArea[] => {
      const positions = boundaryToLatLngs(region.boundary)
      const bounds = boundaryBounds(region.boundary)
      return positions && bounds ? [{ id: region.id, name: region.name, level: region.level, positions, bounds }] : []
    })
    .sort((a, b) => REGION_LEVELS.indexOf(a.level) - REGION_LEVELS.indexOf(b.level))
}

/** The box that holds every drawable region — what a picker opens on when nothing is chosen yet; `null` when there is nothing to draw. */
export const coverageBounds = (areas: readonly CoverageArea[]): BoundsTuple | null => unionBounds(areas.map((area) => area.bounds))

/** One entry of the "Jump to an area" list. */
export interface AreaChoice {
  id: string
  /** The whole path (`Sindh › Sukkur`), so two districts with the same name can be told apart. */
  label: string
  bounds: BoundsTuple
}

/** Every drawable region in tree order — a province, then its districts, then their tehsils — for a list the person picks a place to look at from. */
export function areaChoices(regions: readonly Region[]): AreaChoice[] {
  const drawable = new Map(drawableAreas(regions).map((area) => [area.id, area]))
  const walk = (nodes: RegionNode[], parents: string[]): AreaChoice[] =>
    nodes.flatMap((node) => {
      const path = [...parents, node.region.name]
      const area = drawable.get(node.region.id)
      return [...(area ? [{ id: area.id, label: path.join(' › '), bounds: area.bounds }] : []), ...walk(node.children, path)]
    })
  return walk(buildRegionTree(regions as Region[]), [])
}

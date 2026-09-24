import type { Region, RegionLevel } from '@/api/geo'

export const REGION_LEVELS: readonly RegionLevel[] = ['province', 'district', 'tehsil']

export const REGION_LEVEL_LABEL: Record<RegionLevel, string> = {
  province: 'Province',
  district: 'District',
  tehsil: 'Tehsil',
}

export const REGION_LEVEL_PLURAL: Record<RegionLevel, string> = {
  province: 'provinces',
  district: 'districts',
  tehsil: 'tehsils',
}

/** The level a region of this level sits under. The API doesn't enforce it; the UI does. */
export const PARENT_LEVEL: Record<RegionLevel, RegionLevel | null> = {
  province: null,
  district: 'province',
  tehsil: 'district',
}

const byName = (a: Region, b: Region) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
const byLevelThenName = (a: Region, b: Region) =>
  REGION_LEVELS.indexOf(a.level) - REGION_LEVELS.indexOf(b.level) || byName(a, b)

export interface RegionNode {
  region: Region
  children: RegionNode[]
}

/**
 * Regions as a forest. Top level is every region with no parent, and — because the API doesn't
 * check hierarchy — also any whose parent isn't in the list. Regions caught in a parent **cycle**
 * (the API accepts one: it only refuses "its own parent") would otherwise vanish from the tree
 * altogether, so one member of each is promoted to a root to keep everything reachable.
 */
export function buildRegionTree(regions: Region[]): RegionNode[] {
  const ids = new Set(regions.map((region) => region.id))
  const childrenOf = new Map<string, Region[]>()
  const roots: Region[] = []
  for (const region of regions) {
    const parent = region.parent_region_id
    if (parent && parent !== region.id && ids.has(parent)) {
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), region])
    } else {
      roots.push(region)
    }
  }

  const visited = new Set<string>()
  const grow = (region: Region): RegionNode => {
    visited.add(region.id)
    const children = (childrenOf.get(region.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .sort(byName)
      .map(grow)
    return { region, children }
  }

  const nodes = roots.sort(byLevelThenName).map(grow)
  for (const region of [...regions].sort(byName)) {
    if (!visited.has(region.id)) nodes.push(grow(region))
  }
  return nodes
}

export interface RegionRow {
  region: Region
  depth: number
  /** How many direct sub-regions it has. */
  childCount: number
  expanded: boolean
}

/** The tree flattened into the rows to draw: a node's children follow it only while it's expanded. */
export function visibleRows(nodes: RegionNode[], expanded: ReadonlySet<string>, depth = 0): RegionRow[] {
  return nodes.flatMap((node) => {
    const isOpen = expanded.has(node.region.id)
    const row: RegionRow = { region: node.region, depth, childCount: node.children.length, expanded: isOpen }
    return isOpen ? [row, ...visibleRows(node.children, expanded, depth + 1)] : [row]
  })
}

/** Root → region, following `parent_region_id` (stops at a missing parent or a repeat). */
export function pathTo(regions: Region[], id: string): Region[] {
  const index = new Map(regions.map((region) => [region.id, region]))
  const path: Region[] = []
  const seen = new Set<string>()
  let current = index.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parent_region_id ? index.get(current.parent_region_id) : undefined
  }
  return path
}

/** The regions to open so that `id` is visible: every ancestor, not `id` itself. */
export function ancestorIds(regions: Region[], id: string): string[] {
  return pathTo(regions, id)
    .slice(0, -1)
    .map((region) => region.id)
}

export function childrenOf(regions: Region[], id: string): Region[] {
  return regions.filter((region) => region.parent_region_id === id && region.id !== id).sort(byName)
}

/** Everything below `id`, at any depth (cycle-safe). Not including `id`. */
export function descendantIds(regions: Region[], id: string): Set<string> {
  const found = new Set<string>()
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.pop() as string
    for (const region of regions) {
      if (region.parent_region_id === current && region.id !== id && !found.has(region.id)) {
        found.add(region.id)
        queue.push(region.id)
      }
    }
  }
  return found
}

export function countByLevel(regions: Region[]): Record<RegionLevel, number> {
  const counts: Record<RegionLevel, number> = { province: 0, district: 0, tehsil: 0 }
  for (const region of regions) counts[region.level] += 1
  return counts
}

export interface RegionFilter {
  q: string
  level: RegionLevel | 'all'
}

export const isFiltering = ({ q, level }: RegionFilter) => q.trim() !== '' || level !== 'all'

/** Flat matches for a name search and/or level filter, in path order (a province, then its districts…). */
export function searchRegions(regions: Region[], { q, level }: RegionFilter): Region[] {
  const needle = q.trim().toLowerCase()
  const key = (region: Region) =>
    pathTo(regions, region.id)
      .map((part) => part.name)
      .join(' › ')
  return regions
    .filter((region) => (level === 'all' || region.level === level) && (needle === '' || region.name.toLowerCase().includes(needle)))
    .sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' }))
}

/**
 * The regions that may be chosen as a parent for a region of `level`: those exactly one level up
 * (none for a province), never the region being edited nor anything below it — which would create a
 * cycle the API wouldn't refuse.
 */
export function parentOptions(regions: Region[], level: RegionLevel, editingId?: string): Region[] {
  const parentLevel = PARENT_LEVEL[level]
  if (!parentLevel) return []
  const excluded = editingId ? descendantIds(regions, editingId) : new Set<string>()
  return regions
    .filter((region) => region.level === parentLevel && region.id !== editingId && !excluded.has(region.id))
    .sort(byName)
}

/** `Sindh › Sukkur` — a region's ancestors and itself, for a subtitle. */
export function pathLabel(regions: Region[], id: string): string {
  return pathTo(regions, id)
    .map((region) => region.name)
    .join(' › ')
}

const plural = (count: number, level: RegionLevel) => `${count} ${count === 1 ? level : REGION_LEVEL_PLURAL[level]}`

/** "2 provinces · 3 districts · 1 tehsil" — the header line. */
export function describeCounts(counts: Record<RegionLevel, number>): string {
  return REGION_LEVELS.map((level) => plural(counts[level], level)).join(' · ')
}

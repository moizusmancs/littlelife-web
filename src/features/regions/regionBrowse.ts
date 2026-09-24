import type { Region } from '@/api/geo'
import type { RegionNode } from './regionTree'

export interface RegionBrowse {
  /** The regions drilled into, root first. */
  trail: Region[]
  /** What can be picked or opened at this depth: the top level, or the children of the last in `trail`. */
  options: RegionNode[]
}

/**
 * Where a drill-down picker stands after opening the regions in `trailIds`, one inside the next,
 * from the top of the tree. An id that isn't a child of the previous one (the list changed under it)
 * ends the walk there, so the picker lands on the last valid level instead of an empty screen.
 */
export function browseRegions(tree: RegionNode[], trailIds: readonly string[]): RegionBrowse {
  const trail: Region[] = []
  let options = tree
  for (const id of trailIds) {
    const node = options.find((candidate) => candidate.region.id === id)
    if (!node) break
    trail.push(node.region)
    options = node.children
  }
  return { trail, options }
}

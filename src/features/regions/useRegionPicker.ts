import { useMemo, useState } from 'react'
import type { Region } from '@/api/geo'
import { browseRegions } from './regionBrowse'
import type { RegionPickerProps } from './RegionPicker'
import { buildRegionTree, pathLabel, searchRegions } from './regionTree'

/**
 * State for a `RegionPicker`: where the drill-down has got to, the search text, and the one region
 * chosen. `unavailable` maps a region id to why it can't be chosen ("Already added"). `reset` returns
 * to the top with nothing chosen — call it when the picker is reopened.
 */
export function useRegionPicker(regions: Region[], unavailable: ReadonlyMap<string, string> = new Map()) {
  const [trailIds, setTrailIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const tree = useMemo(() => buildRegionTree(regions), [regions])
  const { trail, options } = useMemo(() => browseRegions(tree, trailIds), [tree, trailIds])
  const matches = useMemo(() => (search.trim() === '' ? null : searchRegions(regions, { q: search, level: 'all' })), [regions, search])
  const selected = selectedId ? (regions.find((region) => region.id === selectedId) ?? null) : null

  const pickerProps: RegionPickerProps = {
    trail,
    options: options.map((node) => ({ region: node.region, childCount: node.children.length })),
    matches,
    parentPathOf: (region) => (region.parent_region_id ? pathLabel(regions, region.parent_region_id) : ''),
    search,
    onSearchChange: setSearch,
    onOpen: (id) => setTrailIds([...trail.map((region) => region.id), id]),
    onTrailSelect: (depth) => setTrailIds(trail.slice(0, depth).map((region) => region.id)),
    selectedId,
    onSelect: setSelectedId,
    unavailable,
  }

  return {
    pickerProps,
    selected,
    reset: () => {
      setTrailIds([])
      setSearch('')
      setSelectedId(null)
    },
  }
}

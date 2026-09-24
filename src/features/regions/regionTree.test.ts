import { describe, expect, it } from 'vitest'
import type { Region, RegionLevel } from '@/api/geo'
import {
  ancestorIds,
  buildRegionTree,
  childrenOf,
  countByLevel,
  describeCounts,
  descendantIds,
  parentOptions,
  pathLabel,
  pathTo,
  searchRegions,
  visibleRows,
} from './regionTree'

const region = (id: string, name: string, level: RegionLevel, parent?: string): Region => ({
  id,
  name,
  level,
  ...(parent ? { parent_region_id: parent } : {}),
  boundary: { type: 'Polygon', coordinates: [] },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const sindh = region('sindh', 'Sindh', 'province')
const punjab = region('punjab', 'Punjab', 'province')
const sukkur = region('sukkur', 'Sukkur', 'district', 'sindh')
const larkana = region('larkana', 'Larkana', 'district', 'sindh')
const sukkurCity = region('sukkur-city', 'Sukkur City', 'tehsil', 'sukkur')
const orphan = region('orphan', 'Orphan District', 'district')
const all = [sukkurCity, orphan, sindh, larkana, punjab, sukkur]

describe('buildRegionTree', () => {
  it('nests by parent, sorts siblings by name, and lists provinces before parentless districts', () => {
    const tree = buildRegionTree(all)
    expect(tree.map((node) => node.region.name)).toEqual(['Punjab', 'Sindh', 'Orphan District'])
    const sindhNode = tree.find((node) => node.region.id === 'sindh')
    expect(sindhNode?.children.map((node) => node.region.name)).toEqual(['Larkana', 'Sukkur'])
    expect(sindhNode?.children[1].children.map((node) => node.region.name)).toEqual(['Sukkur City'])
  })

  it('treats a region whose parent is not in the list as top level, instead of losing it', () => {
    const tree = buildRegionTree([region('a', 'Lost Tehsil', 'tehsil', 'missing'), sindh])
    expect(tree.map((node) => node.region.name).sort()).toEqual(['Lost Tehsil', 'Sindh'])
  })

  it('keeps every region reachable when the API has accepted a parent cycle', () => {
    const a = region('a', 'A', 'province', 'b')
    const b = region('b', 'B', 'district', 'a')
    const flat = (nodes: ReturnType<typeof buildRegionTree>): string[] => nodes.flatMap((node) => [node.region.id, ...flat(node.children)])
    const ids = flat(buildRegionTree([a, b, sindh]))
    expect(ids.sort()).toEqual(['a', 'b', 'sindh'])
  })

  it('does not loop on a region that is its own parent', () => {
    const self = region('s', 'Self', 'province', 's')
    expect(buildRegionTree([self]).map((node) => node.region.id)).toEqual(['s'])
  })
})

describe('visibleRows', () => {
  const tree = buildRegionTree(all)

  it('shows only the top level when nothing is expanded, with child counts', () => {
    const rows = visibleRows(tree, new Set())
    expect(rows.map((row) => [row.region.name, row.depth, row.childCount, row.expanded])).toEqual([
      ['Punjab', 0, 0, false],
      ['Sindh', 0, 2, false],
      ['Orphan District', 0, 0, false],
    ])
  })

  it('reveals children of expanded nodes, indented by depth, in tree order', () => {
    const rows = visibleRows(tree, new Set(['sindh', 'sukkur']))
    expect(rows.map((row) => `${'-'.repeat(row.depth)}${row.region.name}`)).toEqual([
      'Punjab',
      'Sindh',
      '-Larkana',
      '-Sukkur',
      '--Sukkur City',
      'Orphan District',
    ])
  })
})

describe('paths and descendants', () => {
  it('pathTo runs root to region, and ancestorIds excludes the region itself', () => {
    expect(pathTo(all, 'sukkur-city').map((r) => r.name)).toEqual(['Sindh', 'Sukkur', 'Sukkur City'])
    expect(ancestorIds(all, 'sukkur-city')).toEqual(['sindh', 'sukkur'])
    expect(ancestorIds(all, 'sindh')).toEqual([])
    expect(pathTo(all, 'nope')).toEqual([])
    expect(pathLabel(all, 'sukkur-city')).toBe('Sindh › Sukkur › Sukkur City')
  })

  it('pathTo terminates on a cycle', () => {
    const a = region('a', 'A', 'province', 'b')
    const b = region('b', 'B', 'district', 'a')
    expect(pathTo([a, b], 'a').map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('descendantIds finds every level below, not the region itself, and childrenOf only direct ones', () => {
    expect([...descendantIds(all, 'sindh')].sort()).toEqual(['larkana', 'sukkur', 'sukkur-city'])
    expect([...descendantIds(all, 'sukkur-city')]).toEqual([])
    expect(childrenOf(all, 'sindh').map((r) => r.name)).toEqual(['Larkana', 'Sukkur'])
  })

  it('descendantIds terminates on a cycle and excludes the start', () => {
    const a = region('a', 'A', 'province', 'b')
    const b = region('b', 'B', 'district', 'a')
    expect([...descendantIds([a, b], 'a')]).toEqual(['b'])
  })
})

describe('countByLevel', () => {
  it('counts each level', () => {
    expect(countByLevel(all)).toEqual({ province: 2, district: 3, tehsil: 1 })
  })
})

describe('searchRegions', () => {
  it('matches names case-insensitively, in path order', () => {
    expect(searchRegions(all, { q: 'SUKKUR', level: 'all' }).map((r) => r.name)).toEqual(['Sukkur', 'Sukkur City'])
  })

  it('filters by level alone, and combines with a search', () => {
    expect(searchRegions(all, { q: '', level: 'district' }).map((r) => r.name)).toEqual(['Orphan District', 'Larkana', 'Sukkur'])
    expect(searchRegions(all, { q: 'city', level: 'tehsil' }).map((r) => r.name)).toEqual(['Sukkur City'])
    expect(searchRegions(all, { q: 'city', level: 'district' })).toEqual([])
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(searchRegions(all, { q: '  larkana ', level: 'all' })).toHaveLength(1)
  })
})

describe('parentOptions', () => {
  it('offers only regions exactly one level up, and nothing for a province', () => {
    expect(parentOptions(all, 'province')).toEqual([])
    expect(parentOptions(all, 'district').map((r) => r.name)).toEqual(['Punjab', 'Sindh'])
    expect(parentOptions(all, 'tehsil').map((r) => r.name)).toEqual(['Larkana', 'Orphan District', 'Sukkur'])
  })

  it('leaves out the region being edited and anything below it, which would create a cycle', () => {
    const weird = [...all, region('weird', 'Weird', 'district', 'sukkur-city')]
    expect(parentOptions(weird, 'district', 'sindh').map((r) => r.id)).toEqual(['punjab'])
    expect(parentOptions(weird, 'tehsil', 'sukkur-city').map((r) => r.id)).not.toContain('weird')
  })
})

describe('describeCounts', () => {
  it('pluralises each level on its own', () => {
    expect(describeCounts({ province: 2, district: 3, tehsil: 1 })).toBe('2 provinces · 3 districts · 1 tehsil')
    expect(describeCounts({ province: 1, district: 0, tehsil: 0 })).toBe('1 province · 0 districts · 0 tehsils')
  })
})

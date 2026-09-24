import { describe, expect, it } from 'vitest'
import { browseRegions } from './regionBrowse'
import { buildRegionTree } from './regionTree'
import { sampleRegions } from './testRegion'

const tree = buildRegionTree(sampleRegions)
const names = (nodes: ReturnType<typeof browseRegions>['options']) => nodes.map((node) => node.region.name)

describe('browseRegions', () => {
  it('starts at the top level with an empty trail', () => {
    const { trail, options } = browseRegions(tree, [])
    expect(trail).toEqual([])
    expect(names(options)).toEqual(['Punjab', 'Sindh', 'Orphan District'])
  })

  it('drills down one region at a time, listing what is inside the last one opened', () => {
    const province = browseRegions(tree, ['sindh'])
    expect(province.trail.map((r) => r.name)).toEqual(['Sindh'])
    expect(names(province.options)).toEqual(['Larkana', 'Sukkur'])

    const district = browseRegions(tree, ['sindh', 'sukkur'])
    expect(district.trail.map((r) => r.name)).toEqual(['Sindh', 'Sukkur'])
    expect(names(district.options)).toEqual(['Sukkur City'])
  })

  it('reaches a leaf, where there is nothing left to open', () => {
    expect(browseRegions(tree, ['sindh', 'sukkur', 'sukkur-city']).options).toEqual([])
  })

  it('stops at the last valid level when an id is not where it was, rather than showing nothing', () => {
    const { trail, options } = browseRegions(tree, ['sindh', 'gone', 'sukkur'])
    expect(trail.map((r) => r.name)).toEqual(['Sindh'])
    expect(names(options)).toEqual(['Larkana', 'Sukkur'])
    expect(browseRegions(tree, ['sukkur']).trail).toEqual([])
  })
})

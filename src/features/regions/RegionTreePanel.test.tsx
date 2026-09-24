import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RegionTreePanel, type RegionTreePanelProps } from './RegionTreePanel'
import { buildRegionTree, visibleRows } from './regionTree'
import { sampleRegions } from './testRegion'

function renderPanel(overrides: Partial<RegionTreePanelProps> = {}) {
  const props: RegionTreePanelProps = {
    rows: visibleRows(buildRegionTree(sampleRegions), new Set()),
    matches: null,
    parentPathOf: () => '',
    selectedId: undefined,
    onToggle: vi.fn(),
    search: '',
    onSearchChange: vi.fn(),
    level: 'all',
    onLevelChange: vi.fn(),
    linkSearch: '',
    ...overrides,
  }
  render(
    <MemoryRouter>
      <RegionTreePanel {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('RegionTreePanel', () => {
  it('shows the top level with a caret and a count only on regions that have sub-regions', () => {
    renderPanel()
    const list = screen.getByRole('list', { name: 'Regions' })
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Punjab', 'Sindh2, 2 sub-regions', 'Orphan District'])
    expect(screen.getByRole('button', { name: 'Expand Sindh' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /Punjab/ })).not.toBeInTheDocument()
  })

  it('draws children indented under an expanded parent, and offers to collapse it', () => {
    renderPanel({ rows: visibleRows(buildRegionTree(sampleRegions), new Set(['sindh'])) })
    expect(screen.getByRole('button', { name: 'Collapse Sindh' })).toHaveAttribute('aria-expanded', 'true')
    const larkana = screen.getByRole('link', { name: 'Larkana' }).closest('li')
    expect(larkana).toHaveStyle({ paddingInlineStart: '1.25rem' })
  })

  it('reports a caret click by region id', async () => {
    const { onToggle } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Expand Sindh' }))
    expect(onToggle).toHaveBeenCalledWith('sindh')
  })

  it('links each region to its page, keeping the filter, and marks the selected one as current', () => {
    renderPanel({ selectedId: 'punjab', linkSearch: '?level=district' })
    expect(screen.getByRole('link', { name: 'Punjab' })).toHaveAttribute('href', '/admin/regions/punjab?level=district')
    expect(screen.getByRole('link', { name: 'Punjab' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /^Sindh/ })).not.toHaveAttribute('aria-current')
  })

  it('reports search text and level choices, marking the current level as pressed', async () => {
    const { onSearchChange, onLevelChange } = renderPanel({ level: 'district' })
    expect(screen.getByRole('button', { name: 'District' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Tehsil' }))
    expect(onLevelChange).toHaveBeenCalledWith('tehsil')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search regions' }), 'a')
    expect(onSearchChange).toHaveBeenCalledWith('a')
  })

  it('in filter mode lists matches flat with their level and where they sit, instead of the tree', () => {
    renderPanel({
      matches: sampleRegions.filter((r) => r.name.startsWith('Sukkur')),
      parentPathOf: (region) => (region.id === 'sukkur-city' ? 'Sindh › Sukkur' : region.id === 'sukkur' ? 'Sindh' : ''),
    })
    expect(screen.queryByRole('list', { name: 'Regions' })).not.toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'Matching regions' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('SukkurSindhDistrict')
    expect(items[1]).toHaveTextContent('Sukkur CitySindh › SukkurTehsil')
    expect(screen.queryByRole('button', { name: /Expand/ })).not.toBeInTheDocument()
  })

  it('says so when nothing matches', () => {
    renderPanel({ matches: [] })
    expect(screen.getByText('No regions match.')).toBeInTheDocument()
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RegionDetailPanel, type RegionDetailPanelProps } from './RegionDetailPanel'
import { makeRegion, sampleRegions } from './testRegion'

const byId = (id: string) => sampleRegions.find((r) => r.id === id)!

function renderPanel(id: string, overrides: Partial<RegionDetailPanelProps> = {}) {
  const region = byId(id)
  const path: typeof sampleRegions = []
  for (let r: typeof region | undefined = region; r; r = r.parent_region_id ? byId(r.parent_region_id) : undefined) path.unshift(r)
  const props: RegionDetailPanelProps = {
    region,
    path,
    subRegions: sampleRegions.filter((r) => r.parent_region_id === id),
    onEdit: vi.fn(),
    onAddSubRegion: vi.fn(),
    onDownloadBoundary: vi.fn(),
    linkSearch: '?q=su',
    backLink: <a href="/admin/regions">All regions</a>,
    ...overrides,
  }
  render(
    <MemoryRouter>
      <RegionDetailPanel {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('RegionDetailPanel', () => {
  it('shows a district: its name and level, the path above it, its tehsils and its parent', () => {
    renderPanel('sukkur')
    expect(screen.getByRole('heading', { name: 'Sukkur' })).toBeInTheDocument()
    expect(screen.getByText('District')).toBeInTheDocument()

    const path = screen.getByRole('navigation', { name: 'Region path' })
    expect(within(path).getByRole('link', { name: 'Sindh' })).toHaveAttribute('href', '/admin/regions/sindh?q=su')
    expect(within(path).getByText('Sukkur')).toHaveAttribute('aria-current', 'page')

    const subs = screen.getByRole('region', { name: /Sub-regions/ })
    expect(within(subs).getByRole('link', { name: 'Sukkur City' })).toHaveAttribute('href', '/admin/regions/sukkur-city?q=su')
    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getByRole('link', { name: 'Sindh' })).toBeInTheDocument()
    expect(within(details).getByText('sukkur')).toBeInTheDocument()
  })

  it('shows created and updated times from the API', () => {
    renderPanel('sukkur')
    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getAllByText(/\d{1,2} Mar 2026, \d{2}:\d{2}/)).toHaveLength(2)
  })

  it('has no path line for a province and says it is top level', () => {
    renderPanel('punjab')
    expect(screen.queryByRole('navigation', { name: 'Region path' })).not.toBeInTheDocument()
    expect(screen.getByText('None — top level')).toBeInTheDocument()
  })

  it('offers to add the next level down — a district under a province, a tehsil under a district, nothing under a tehsil', async () => {
    const province = renderPanel('sindh')
    await userEvent.click(screen.getByRole('button', { name: /Add district/ }))
    expect(province.onAddSubRegion).toHaveBeenCalledWith('district')
  })

  it('offers tehsils under a district, and nothing under a tehsil', async () => {
    const district = renderPanel('larkana')
    expect(screen.getByText('No tehsils under Larkana yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Add tehsil/ }))
    expect(district.onAddSubRegion).toHaveBeenCalledWith('tehsil')
  })

  it('has no add button for a tehsil, which is the smallest level', () => {
    renderPanel('sukkur-city')
    expect(screen.queryByRole('button', { name: /Add/ })).not.toBeInTheDocument()
    expect(screen.getByText(/smallest level/)).toBeInTheDocument()
  })

  it('describes and draws a valid boundary, and downloads it', async () => {
    const props = renderPanel('sukkur')
    expect(screen.getByRole('img', { name: 'Outline of Sukkur' })).toBeInTheDocument()
    expect(screen.getByText(/Polygon · 1 ring · 5 points/)).toBeInTheDocument()
    expect(screen.getByText(/67.00° to 68.00° E, 24.00° to 25.00° N/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Download GeoJSON' }))
    expect(props.onDownloadBoundary).toHaveBeenCalled()
  })

  it("does not pretend to draw a stored boundary that isn't a well-formed polygon, but still lets it be downloaded", () => {
    const broken = makeRegion('b', 'Broken', 'province', undefined, { boundary: { type: 'Polygon', coordinates: [] } })
    render(
      <MemoryRouter>
        <RegionDetailPanel region={broken} path={[broken]} subRegions={[]} onEdit={vi.fn()} onAddSubRegion={vi.fn()} onDownloadBoundary={vi.fn()} linkSearch="" backLink={null} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/isn't a well-formed polygon/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download GeoJSON' })).toBeInTheDocument()
  })

  it('opens the editor from Edit region', async () => {
    const props = renderPanel('sukkur')
    await userEvent.click(screen.getByRole('button', { name: 'Edit region' }))
    expect(props.onEdit).toHaveBeenCalled()
  })

  it('renders the back link it is given (the phone path back to the tree)', () => {
    renderPanel('sukkur')
    expect(screen.getByRole('link', { name: 'All regions' })).toBeInTheDocument()
  })
})

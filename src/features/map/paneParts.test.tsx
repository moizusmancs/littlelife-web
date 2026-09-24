import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYERS } from './mapLayers'
import { HazardList } from './HazardList'
import { LayerChips } from './LayerChips'
import { MapSearchBar } from './MapSearchBar'
import { PlaceResults } from './PlaceResults'
import { essentialPlace, infrastructurePlace, shelterPlace } from './mapModel'
import { makeEssential, makeHazard, makeInfrastructure, makeShelter } from './testMap'

describe('MapSearchBar', () => {
  it('is a labelled search box that reports what is typed', async () => {
    const onChange = vi.fn()
    render(<MapSearchBar value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the map' }), 'h')
    expect(onChange).toHaveBeenCalledWith('h')
  })

  it('does not promise roads or towns — there is no geocoder behind it', () => {
    render(<MapSearchBar value="" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(/shelters, hospitals, pharmacies/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/roads/i)).not.toBeInTheDocument()
  })
})

describe('LayerChips', () => {
  it('shows the four real layers as toggles — pressed for the ones that are on — and no Reports/Missing Persons chips yet', () => {
    render(<LayerChips layers={DEFAULT_LAYERS} onToggle={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Map layers' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Flood', 'Shelters', 'Infrastructure', 'Essentials'])
    expect(screen.getByRole('button', { name: 'Flood' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Shelters' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Infrastructure' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports which layer was toggled', async () => {
    const onToggle = vi.fn()
    render(<LayerChips layers={DEFAULT_LAYERS} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button', { name: 'Essentials' }))
    expect(onToggle).toHaveBeenCalledWith('essentials')
  })
})

describe('HazardList', () => {
  const hazards = [makeHazard('a', 'high', 0.87), makeHazard('b', 'medium')]
  const props = { hazards, enabled: true, loading: false, open: true, onToggle: vi.fn(), selectedId: null, onSelect: vi.fn() }

  it('lists the zones in view as buttons — what they are, what they are based on, and how long ago — with the count', () => {
    render(<HazardList {...props} />)
    expect(screen.getByRole('heading', { name: /Active hazards in view/ })).toHaveTextContent('2')
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('High-risk flood zone')
    expect(rows[0]).toHaveTextContent('87% model confidence')
    expect(rows[1]).toHaveTextContent('Medium-risk hazard zone')
    expect(rows[1]).toHaveTextContent('Declared by staff')
  })

  it('reports the chosen zone, and marks the selected one', async () => {
    const onSelect = vi.fn()
    render(<HazardList {...props} onSelect={onSelect} selectedId="b" />)
    await userEvent.click(screen.getByRole('button', { name: /High-risk flood zone/ }))
    expect(onSelect).toHaveBeenCalledWith(hazards[0])
    expect(screen.getByRole('button', { name: /Medium-risk hazard zone/ })).toHaveAttribute('aria-current', 'true')
  })

  it('collapses and expands from its heading, saying which state it is in', async () => {
    const onToggle = vi.fn()
    const { rerender } = render(<HazardList {...props} onToggle={onToggle} />)
    const toggle = screen.getByRole('button', { name: /Active hazards in view/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(onToggle).toHaveBeenCalled()
    rerender(<HazardList {...props} open={false} />)
    expect(screen.getByRole('button', { name: /Active hazards in view/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('says so when nothing is in view, while loading, and when the Flood layer is off', () => {
    const { rerender } = render(<HazardList {...props} hazards={[]} />)
    expect(screen.getByText('No active hazards in this area.')).toBeInTheDocument()
    rerender(<HazardList {...props} hazards={[]} loading />)
    expect(screen.getByLabelText('Loading hazards')).toHaveAttribute('aria-busy', 'true')
    rerender(<HazardList {...props} hazards={[]} enabled={false} />)
    expect(screen.getByText('Turn on the Flood layer to see hazards.')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

describe('PlaceResults', () => {
  const places = [
    shelterPlace(makeShelter('s1', 'GBHS Johi')),
    infrastructurePlace(makeInfrastructure('i1', 'General Hospital', { status: 'at_risk' })),
    essentialPlace(makeEssential('e1', 'Corner Pharmacy')),
  ]

  it('lists each match with its type, status and — when the viewer’s position is known — distance', () => {
    render(<PlaceResults places={places} selectedKey={null} distanceOf={(p) => (p.kind === 'shelter' ? 4200 : null)} onSelect={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /Places matching your search/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /GBHS Johi/ })).toHaveTextContent('Shelter · Open · 4.2 km')
    expect(screen.getByRole('button', { name: /General Hospital/ })).toHaveTextContent('Hospital · At risk')
    expect(screen.getByRole('button', { name: /Corner Pharmacy/ })).toHaveTextContent('Pharmacy · Status unknown')
  })

  it('reports the chosen place, and marks the selected one', async () => {
    const onSelect = vi.fn()
    render(<PlaceResults places={places} selectedKey={places[1].key} distanceOf={() => null} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Corner Pharmacy/ }))
    expect(onSelect).toHaveBeenCalledWith(places[2])
    expect(screen.getByRole('button', { name: /General Hospital/ })).toHaveAttribute('aria-current', 'true')
  })

  it('explains an empty result — including that only switched-on layers are searched', () => {
    render(
      <MemoryRouter>
        <PlaceResults places={[]} selectedKey={null} distanceOf={() => null} onSelect={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Nothing matches\. Only places on the layers that are switched on are searched/)).toBeInTheDocument()
  })
})

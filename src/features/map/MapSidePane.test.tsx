import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYERS } from './mapLayers'
import { MapSidePane, type MapSidePaneProps } from './MapSidePane'
import { makeHazard } from './testMap'

function renderPane(overrides: Partial<MapSidePaneProps> = {}) {
  const props: MapSidePaneProps = {
    search: '',
    onSearchChange: vi.fn(),
    layers: DEFAULT_LAYERS,
    onToggleLayer: vi.fn(),
    notices: [],
    locationNote: null,
    selectedCard: null,
    placeResults: null,
    selectedPlaceKey: null,
    distanceOf: () => null,
    onSelectPlace: vi.fn(),
    hazards: [makeHazard('a', 'high', 0.87)],
    hazardsEnabled: true,
    hazardsLoading: false,
    hazardsOpen: true,
    onToggleHazards: vi.fn(),
    selectedHazardId: null,
    onSelectHazard: vi.fn(),
    ...overrides,
  }
  render(
    <MemoryRouter>
      <MapSidePane {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('MapSidePane', () => {
  it('has the search, the layer chips, the hazard list and Find Safe Route — and not the Report Incident / Request Help buttons whose drawers do not exist yet', () => {
    renderPane()
    expect(screen.getByRole('searchbox', { name: 'Search the map' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Map layers' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Active hazards in view/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find Safe Route' })).toHaveAttribute('href', '/app/navigate')
    expect(screen.queryByRole('button', { name: 'Report Incident' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request Help' })).not.toBeInTheDocument()
  })

  it('shows no search results section unless something is being searched', () => {
    renderPane({ placeResults: null })
    expect(screen.queryByRole('heading', { name: /Places matching/ })).not.toBeInTheDocument()
  })

  it('shows the search results section while searching, even when nothing matches', () => {
    renderPane({ placeResults: [] })
    expect(screen.getByRole('heading', { name: /Places matching your search/ })).toBeInTheDocument()
  })

  it('shows notices — a failure as an alert with a working retry, the rest as status text', async () => {
    const onRetry = vi.fn()
    renderPane({
      notices: [
        { id: 'overlay', tone: 'critical', text: "Couldn't load flood zones.", onRetry },
        { id: 'loading', tone: 'info', text: 'Loading places…' },
      ],
    })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load flood zones.")
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Loading places…')
  })

  it('places the location note and the selected card above the lists', () => {
    renderPane({ locationNote: <p>note here</p>, selectedCard: <p>card here</p> })
    const note = screen.getByText('note here')
    const card = screen.getByText('card here')
    const hazards = screen.getByRole('heading', { name: /Active hazards in view/ })
    expect(note.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(hazards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

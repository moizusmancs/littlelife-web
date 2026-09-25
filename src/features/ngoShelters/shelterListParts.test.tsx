import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { makeShelter } from '@/features/map/testMap'
import { CoverageNote } from '@/features/regions/CoverageNote'
import { OccupancyBar } from './OccupancyBar'
import { OccupancyEditor } from './OccupancyEditor'
import { ShelterKpis } from './ShelterKpis'
import { SheltersEmptyState, SheltersLoadState, SheltersNoMatch } from './ShelterListStates'
import { ShelterTable } from './ShelterTable'
import { ShelterToolbar } from './ShelterToolbar'
import { shelterTotals } from './shelterModel'

describe('OccupancyBar', () => {
  it('shows current over total with a thousands separator, the percentage, and a named progress bar', () => {
    render(<OccupancyBar shelter={{ capacity_current: 1830, capacity_total: 2450 }} label="Occupancy of Camp" />)
    expect(screen.getByText('1,830')).toBeInTheDocument()
    expect(screen.getByText(/2,450/)).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Occupancy of Camp' })).toHaveAttribute('aria-valuenow', '75')
  })

  it('reads a shelter with no capacity as 0%, not NaN', () => {
    render(<OccupancyBar shelter={{ capacity_current: 0, capacity_total: 0 }} label="x" />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})

describe('OccupancyEditor', () => {
  const shelter = { name: 'Degree College', capacity_current: 380, capacity_total: 450 }

  function Harness({ initial = '380', onSave = vi.fn(), onCancel = vi.fn(), serverError = null as string | null, isSaving = false }) {
    const [text, setText] = useState(initial)
    return <OccupancyEditor shelter={shelter} text={text} onTextChange={setText} onSave={onSave} onCancel={onCancel} isSaving={isSaving} serverError={serverError} />
  }

  it('says what will happen: the capacity, what it was, and the share after saving', async () => {
    render(<Harness />)
    const field = screen.getByRole('textbox', { name: 'People currently at Degree College' })
    await userEvent.clear(field)
    await userEvent.type(field, '412')
    expect(screen.getByText(/of 450 · was 380 ·/)).toHaveTextContent('92% after save')
  })

  it('says there is nothing to save while the number is the recorded one, and keeps Save off', () => {
    render(<Harness />)
    expect(screen.getByText(/this is what's recorded now/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save occupancy' })).toBeDisabled()
  })

  it('steps one person at a time with the buttons', async () => {
    render(<Harness initial="412" />)
    await userEvent.click(screen.getByRole('button', { name: 'One more person' }))
    expect(screen.getByRole('textbox')).toHaveValue('413')
    await userEvent.click(screen.getByRole('button', { name: 'One fewer person' }))
    await userEvent.click(screen.getByRole('button', { name: 'One fewer person' }))
    expect(screen.getByRole('textbox')).toHaveValue('411')
  })

  it('refuses what the API would — more than the capacity, a fraction, empty — saying why and never enabling Save', async () => {
    render(<Harness />)
    const field = screen.getByRole('textbox')
    const save = screen.getByRole('button', { name: 'Save occupancy' })
    await userEvent.clear(field)
    await userEvent.type(field, '451')
    expect(screen.getByText("It can't be more than the shelter's capacity of 450.")).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(save).toBeDisabled()
    await userEvent.clear(field)
    await userEvent.type(field, '3.5')
    expect(screen.getByText('Use a whole number, like 87.')).toBeInTheDocument()
    await userEvent.clear(field)
    expect(screen.getByText('Enter how many people are there now.')).toBeInTheDocument()
    expect(save).toBeDisabled()
  })

  it('saves a changed valid number with the button and with Enter, and cancels with the button and with Escape', async () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<Harness onSave={onSave} onCancel={onCancel} />)
    const field = screen.getByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save occupancy' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    await userEvent.type(field, '{Enter}')
    expect(onSave).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.type(field, '{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('does not save on Enter when nothing changed', async () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)
    await userEvent.type(screen.getByRole('textbox'), '{Enter}')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows the server\'s refusal, and locks Cancel and Save while a save is running', () => {
    const { rerender } = render(<Harness serverError="capacity_current must be between 0 and capacity_total" />)
    expect(screen.getByRole('alert')).toHaveTextContent('capacity_current must be between 0 and capacity_total')
    rerender(<Harness isSaving />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Save occupancy/ })).toBeDisabled()
  })
})

describe('ShelterKpis', () => {
  const shelters = [
    makeShelter('a', 'A', { capacity_total: 450, capacity_current: 412 }),
    makeShelter('b', 'B', { capacity_total: 300, capacity_current: 300, certification_status: 'pending' }),
  ]

  it('shows total capacity, occupied with its share, how many are at capacity and how many await certification', () => {
    render(<ShelterKpis totals={shelterTotals(shelters)} />)
    const totals = screen.getByLabelText('Shelter totals')
    expect(within(totals).getByText('Total capacity').nextElementSibling).toHaveTextContent('750')
    expect(within(totals).getByText('Occupied').nextElementSibling).toHaveTextContent('712 95%')
    expect(within(totals).getByText('At capacity').nextElementSibling).toHaveTextContent('1')
    expect(within(totals).getByText('Pending certification').nextElementSibling).toHaveTextContent('1')
  })

  it('colours the two attention figures only when there is something to act on', () => {
    const { rerender } = render(<ShelterKpis totals={shelterTotals(shelters)} />)
    expect(screen.getByText('At capacity').nextElementSibling).toHaveClass('text-status-critical')
    expect(screen.getByText('Pending certification').nextElementSibling).toHaveClass('text-status-caution')
    rerender(<ShelterKpis totals={shelterTotals([makeShelter('c', 'C', { capacity_current: 1 })])} />)
    expect(screen.getByText('At capacity').nextElementSibling).not.toHaveClass('text-status-critical')
    expect(screen.getByText('Pending certification').nextElementSibling).not.toHaveClass('text-status-caution')
  })
})

describe('ShelterToolbar', () => {
  const counts = { all: 5, open: 3, closed: 2, full: 1, pending: 0 }

  it('offers a labelled search and the five filters with their counts, the chosen one pressed', () => {
    render(<ShelterToolbar filter="open" onFilterChange={vi.fn()} counts={counts} search="" onSearchChange={vi.fn()} />)
    expect(screen.getByRole('searchbox', { name: 'Search shelters' })).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Filter shelters' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All5', 'Open3', 'Closed2', 'At capacity1', 'Pending certification0'])
    expect(within(group).getByRole('button', { name: /^Open/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the filter pressed and what is typed', async () => {
    const onFilterChange = vi.fn()
    const onSearchChange = vi.fn()
    render(<ShelterToolbar filter="all" onFilterChange={onFilterChange} counts={counts} search="" onSearchChange={onSearchChange} />)
    await userEvent.click(screen.getByRole('button', { name: /^At capacity/ }))
    expect(onFilterChange).toHaveBeenCalledWith('full')
    await userEvent.type(screen.getByRole('searchbox'), 'j')
    expect(onSearchChange).toHaveBeenCalledWith('j')
  })
})

describe('list states', () => {
  it('shows a busy skeleton while loading, and the message with a working Try again on failure', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<SheltersLoadState error={null} onRetry={onRetry} />)
    expect(screen.getByLabelText('Loading shelters')).toHaveAttribute('aria-busy', 'true')
    rerender(<SheltersLoadState error="account is not affiliated with an ngo" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('account is not affiliated with an ngo')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('invites an admin to register, and tells a volunteer who can', async () => {
    const onRegister = vi.fn()
    const { rerender } = render(<SheltersEmptyState canRegister onRegister={onRegister} />)
    await userEvent.click(screen.getByRole('button', { name: 'Register a shelter' }))
    expect(onRegister).toHaveBeenCalled()
    rerender(<SheltersEmptyState canRegister={false} onRegister={onRegister} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/An organisation admin can register one/)).toBeInTheDocument()
  })

  it('offers to clear a search that hides everything', async () => {
    const onClear = vi.fn()
    render(<SheltersNoMatch onClear={onClear} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show all shelters' }))
    expect(onClear).toHaveBeenCalled()
  })
})

describe('ShelterTable', () => {
  const shelters = [
    makeShelter('s1', 'Degree College', { capacity_total: 450, capacity_current: 412, location: { type: 'Point', coordinates: [68.86, 27.7] } }),
    makeShelter('s2', 'Relief camp', { type: 'relief_center', status: 'closed', certification_status: 'pending', capacity_total: 100, capacity_current: 0 }),
  ]
  const base = { shelters, canEdit: true, draft: null, onToggleOccupancy: vi.fn(), onDraftChange: vi.fn(), onDraftSave: vi.fn(), onDraftCancel: vi.fn(), onEdit: vi.fn() }
  const renderTable = (props: Partial<Parameters<typeof ShelterTable>[0]> = {}) =>
    render(
      <MemoryRouter>
        <ShelterTable {...base} {...props} />
      </MemoryRouter>,
    )

  it('shows each shelter\'s name, its kind and coordinates (there is no address), status, certification, occupancy and how long ago it changed', () => {
    renderTable()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Degree College')
    expect(rows[0]).toHaveTextContent('Shelter · 27.7000° N, 68.8600° E')
    expect(within(rows[0]).getByText('Open')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Certified')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('progressbar', { name: 'Occupancy of Degree College' })).toHaveAttribute('aria-valuenow', '92')
    expect(rows[1]).toHaveTextContent('Relief center')
    expect(within(rows[1]).getByText('Closed')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Pending certification')).toBeInTheDocument()
  })

  it('links View to the shelter, carrying the list view to come back to', () => {
    renderTable({ detailState: { listSearch: '?show=full' } })
    expect(screen.getByRole('link', { name: 'View Degree College' })).toHaveAttribute('href', '/ngo/shelters/s1')
  })

  it('reports which shelter\'s occupancy or edit button was pressed', async () => {
    const onToggleOccupancy = vi.fn()
    const onEdit = vi.fn()
    renderTable({ onToggleOccupancy, onEdit })
    await userEvent.click(screen.getByRole('button', { name: 'Update occupancy for Relief camp' }))
    expect(onToggleOccupancy).toHaveBeenCalledWith(shelters[1])
    await userEvent.click(screen.getByRole('button', { name: 'Edit Degree College' }))
    expect(onEdit).toHaveBeenCalledWith(shelters[0])
  })

  it('offers Edit only to those who can — a volunteer still has occupancy', () => {
    renderTable({ canEdit: false })
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Update occupancy for/ })).toHaveLength(2)
  })

  it('opens the editor inside the row of the shelter being edited, and marks its button expanded', () => {
    renderTable({ draft: { shelterId: 's1', text: '420', isSaving: false, error: null } })
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByRole('textbox', { name: 'People currently at Degree College' })).toHaveValue('420')
    expect(within(rows[1]).queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update occupancy for Degree College' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Update occupancy for Relief camp' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('passes the editor\'s events up', async () => {
    const onDraftChange = vi.fn()
    const onDraftSave = vi.fn()
    const onDraftCancel = vi.fn()
    renderTable({ draft: { shelterId: 's1', text: '420', isSaving: false, error: null }, onDraftChange, onDraftSave, onDraftCancel })
    await userEvent.click(screen.getByRole('button', { name: 'One more person' }))
    expect(onDraftChange).toHaveBeenCalledWith('421')
    await userEvent.click(screen.getByRole('button', { name: 'Save occupancy' }))
    expect(onDraftSave).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDraftCancel).toHaveBeenCalled()
  })
})

describe('CoverageNote', () => {
  it('says nothing when it cannot tell', () => {
    const { container } = render(<CoverageNote coverage={{ status: 'none' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the region a point is in and says citizens will see it there', () => {
    render(<CoverageNote coverage={{ status: 'inside', path: 'Sindh › Sukkur' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('In Sindh › Sukkur — citizens looking at that region will see it.')
  })

  it('warns that a point outside every region will not be seen by citizens, and that latitude comes first', () => {
    render(<CoverageNote coverage={{ status: 'outside' }} />)
    expect(screen.getByRole('status')).toHaveTextContent("isn't inside any region")
    expect(screen.getByRole('status')).toHaveTextContent('citizens won\'t see it')
    expect(screen.getByRole('status')).toHaveTextContent('latitude comes first')
  })

  it('while choosing where to put a place, says a point outside every region cannot be saved — in plain words, with what to do about it', () => {
    render(<CoverageNote coverage={{ status: 'outside' }} blocking detail="Ask an administrator to add that area." />)
    const note = screen.getByRole('status')
    expect(note).toHaveTextContent("outside the shaded areas, so it can't be saved")
    expect(note).toHaveTextContent('Click inside a shaded area')
    expect(note).toHaveTextContent('latitude first, then longitude')
    expect(note).toHaveTextContent('Ask an administrator to add that area.')
    // A place that already exists is not told it "can't be saved".
    expect(note).not.toHaveTextContent("isn't inside any region")
  })

  it('still names the region a point is in while choosing, exactly as for a place that exists', () => {
    render(<CoverageNote coverage={{ status: 'inside', path: 'Sindh › Sukkur' }} blocking />)
    expect(screen.getByRole('status')).toHaveTextContent('In Sindh › Sukkur — citizens looking at that region will see it.')
  })
})

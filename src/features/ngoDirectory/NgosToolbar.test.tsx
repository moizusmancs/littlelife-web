import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NgosToolbar, type NgosToolbarProps } from './NgosToolbar'

const counts = { all: 16, pending_approval: 2, active: 13, suspended: 0, rejected: 1, deactivated: 0 }

function renderToolbar(overrides: Partial<NgosToolbarProps> = {}) {
  const props: NgosToolbarProps = {
    tab: 'pending_approval',
    onTabChange: vi.fn(),
    counts,
    search: '',
    onSearchChange: vi.fn(),
    ...overrides,
  }
  render(<NgosToolbar {...props} />)
  return props
}

describe('NgosToolbar', () => {
  it('shows every status tab with its count, marks the selected one, and puts the actionable tab first', () => {
    renderToolbar()

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Pending approval2',
      'Active13',
      'Suspended0',
      'Rejected1',
      'Deactivated0',
      'All16',
    ])
    expect(screen.getByRole('tab', { name: /Pending approval/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Active/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('reports a chosen tab', async () => {
    const { onTabChange } = renderToolbar()

    await userEvent.click(screen.getByRole('tab', { name: /Rejected/ }))
    await userEvent.click(screen.getByRole('tab', { name: /^All/ }))

    expect(onTabChange).toHaveBeenNthCalledWith(1, 'rejected')
    expect(onTabChange).toHaveBeenNthCalledWith(2, 'all')
  })

  it('shows no counts while they are loading', () => {
    renderToolbar({ counts: undefined })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Pending approval',
      'Active',
      'Suspended',
      'Rejected',
      'Deactivated',
      'All',
    ])
  })

  it('reports what is typed into the search field', async () => {
    const { onSearchChange } = renderToolbar()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search organisations' }), 'i')

    expect(onSearchChange).toHaveBeenCalledWith('i')
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountsToolbar, type AccountsToolbarProps } from './AccountsToolbar'

function renderToolbar(overrides: Partial<AccountsToolbarProps> = {}) {
  const props: AccountsToolbarProps = {
    search: '',
    onSearchChange: vi.fn(),
    role: 'all',
    onRoleChange: vi.fn(),
    status: 'all',
    onStatusChange: vi.fn(),
    ...overrides,
  }
  render(<AccountsToolbar {...props} />)
  return props
}

describe('AccountsToolbar', () => {
  it('reports what is typed into the search field', async () => {
    const { onSearchChange } = renderToolbar()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'a')

    expect(onSearchChange).toHaveBeenCalledWith('a')
  })

  it('offers every role as a pill, marks the active one, and reports a choice', async () => {
    const { onRoleChange } = renderToolbar({ role: 'ngo_admin' })

    const group = screen.getByRole('group', { name: 'Filter by role' })
    expect(group).toHaveTextContent('AllCitizenNGO volunteerNGO adminAdminSuper admin')
    expect(screen.getByRole('button', { name: 'NGO admin' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'Citizen' }))
    await userEvent.click(screen.getByRole('button', { name: 'All' }))

    expect(onRoleChange).toHaveBeenNthCalledWith(1, 'user')
    expect(onRoleChange).toHaveBeenNthCalledWith(2, 'all')
  })

  it('offers every status including pending verification, and reports a choice', async () => {
    const { onStatusChange } = renderToolbar()

    const select = screen.getByRole('combobox', { name: 'Filter by status' })
    expect(select).toHaveDisplayValue('All statuses')
    await userEvent.selectOptions(select, 'Pending verification')

    expect(onStatusChange).toHaveBeenCalledWith('pending_verification')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All statuses',
      'Active',
      'Pending verification',
      'Suspended',
      'Deactivated',
    ])
  })
})

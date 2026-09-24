import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { AccountStatus, AccountSummary } from '@/api/identity'
import type { Role } from '@/store/auth'
import { AccountsTable } from './AccountsTable'

function account(id: string, email: string, role: Role, status: AccountStatus): AccountSummary {
  return { id, email, role, status, email_verified: true, created_at: '2026-09-20T06:44:36Z', updated_at: '2026-09-20T06:44:36Z' }
}

const accounts = [
  account('a-1', 'aisha@example.com', 'user', 'active'),
  account('a-2', 'bilal@example.com', 'ngo_admin', 'suspended'),
  account('a-3', 'chair@example.com', 'admin', 'active'),
  account('a-4', 'dana@example.com', 'user', 'pending_verification'),
]

function renderTable(props: Partial<React.ComponentProps<typeof AccountsTable>> = {}) {
  const onStatusAction = vi.fn()
  render(
    <MemoryRouter>
      <AccountsTable accounts={accounts} currentAccountId="a-3" onStatusAction={onStatusAction} {...props} />
    </MemoryRouter>,
  )
  return { onStatusAction }
}

describe('AccountsTable', () => {
  it('shows each account with its role, status and created date', () => {
    renderTable()

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByText('aisha@example.com')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Citizen')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Active')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/20 Sep 2026/)).toBeInTheDocument()
    expect(within(rows[1]).getByText('NGO admin')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Suspended')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Pending verification')).toBeInTheDocument()
  })

  it("links View to the account's detail page, carrying the router state along", () => {
    renderTable({ detailState: { listSearch: '?role=user' } })

    expect(screen.getByRole('link', { name: 'View aisha@example.com' })).toHaveAttribute('href', '/admin/users/a-1')
  })

  it('offers Suspend on an active row and Reactivate on a suspended one, and reports which', async () => {
    const { onStatusAction } = renderTable()

    await userEvent.click(screen.getByRole('button', { name: 'Suspend aisha@example.com' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate bilal@example.com' }))

    expect(onStatusAction).toHaveBeenNthCalledWith(1, accounts[0], 'suspend')
    expect(onStatusAction).toHaveBeenNthCalledWith(2, accounts[1], 'reactivate')
    expect(screen.queryByRole('button', { name: 'Reactivate aisha@example.com' })).not.toBeInTheDocument()
  })

  it("marks the caller's own row and gives it no status action — but still lets them view it", () => {
    renderTable()

    const own = screen.getAllByRole('listitem')[2]
    expect(within(own).getByText('You')).toBeInTheDocument()
    expect(within(own).queryByRole('button')).not.toBeInTheDocument()
    expect(within(own).getByRole('link', { name: 'View chair@example.com' })).toBeInTheDocument()
  })

  it('offers only Suspend (never Reactivate) on an account still pending verification', () => {
    renderTable()

    expect(screen.getByRole('button', { name: 'Suspend dana@example.com' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reactivate dana@example.com' })).not.toBeInTheDocument()
  })
})

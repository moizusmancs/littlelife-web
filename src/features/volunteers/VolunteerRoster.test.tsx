import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Volunteer } from '@/api/identity'
import { VolunteerRoster } from './VolunteerRoster'

const volunteers: Volunteer[] = [
  { id: 'v-1', email: 'aisha@example.com', status: 'active', created_at: '2026-09-20T06:44:36Z' },
  { id: 'v-2', email: 'bilal@example.com', status: 'suspended', created_at: '2026-08-02T10:00:00Z' },
  { id: 'v-3', email: 'chaudhry.long.address@example.org', status: 'deactivated', created_at: '2026-07-15T10:00:00Z' },
]

describe('VolunteerRoster', () => {
  it('lists every volunteer in the order given, with email, status and the account-created date', () => {
    render(<VolunteerRoster volunteers={volunteers} onRemove={vi.fn()} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('aisha@example.com')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Active')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/20 Sep 2026/)).toBeInTheDocument()
    expect(within(rows[1]).getByText('Suspended')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Deactivated')).toBeInTheDocument()
  })

  it("labels the date as the account's, not as a join date the API doesn't have", () => {
    render(<VolunteerRoster volunteers={volunteers.slice(0, 1)} onRemove={vi.fn()} />)

    expect(screen.getByText('Account created', { selector: 'div' })).toBeInTheDocument()
    expect(screen.queryByText(/joined/i)).not.toBeInTheDocument()
  })

  it('gives each Remove button the volunteer in its accessible name, and reports which one was clicked', async () => {
    const onRemove = vi.fn()
    render(<VolunteerRoster volunteers={volunteers} onRemove={onRemove} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove bilal@example.com from your organisation' }))

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(volunteers[1])
  })
})

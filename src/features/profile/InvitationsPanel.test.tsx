import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { VolunteerInvitation } from '@/api/identity'
import { InvitationsPanel } from './InvitationsPanel'

function inv(id: string, ngo_name: string): VolunteerInvitation {
  return { id, ngo_id: `ngo-${id}`, ngo_name, status: 'pending', created_at: '2026-09-20T10:00:00Z' }
}

const two = [inv('a', 'Sindh Relief Collective'), inv('b', 'Al-Khidmat Foundation')]

function renderPanel(overrides: Partial<React.ComponentProps<typeof InvitationsPanel>> = {}) {
  const props = {
    invitations: two,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    pending: null,
    actionError: null,
    ...overrides,
  }
  render(<InvitationsPanel {...props} />)
  return props
}

describe('InvitationsPanel', () => {
  it('shows the title, the one-role-per-account banner, a pending count, and a card per invitation', () => {
    renderPanel()

    expect(screen.getByRole('heading', { level: 1, name: 'Volunteer invitations' })).toBeInTheDocument()
    expect(screen.getByText(/One account holds one role at a time/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Pending · 2' })).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows an empty state — and no banner or count — when there are no invitations', () => {
    renderPanel({ invitations: [] })

    expect(screen.getByText('No pending invitations')).toBeInTheDocument()
    expect(screen.queryByText(/One account holds one role/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('passes the whole invitation to the accept / decline handlers', async () => {
    const { onAccept, onDecline } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation from Al-Khidmat Foundation' }))
    await userEvent.click(screen.getByRole('button', { name: 'Decline invitation from Sindh Relief Collective' }))

    expect(onAccept).toHaveBeenCalledWith(two[1])
    expect(onDecline).toHaveBeenCalledWith(two[0])
  })

  it('spins the acted-on card only, and disables every button, while an action is pending', () => {
    renderPanel({ pending: { id: 'b', action: 'decline' } })

    expect(screen.getByRole('button', { name: 'Decline invitation from Al-Khidmat Foundation' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Decline invitation from Sindh Relief Collective' })).not.toHaveAttribute(
      'aria-busy',
    )
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })

  it('renders a server error above the list', () => {
    renderPanel({ actionError: 'invitation is not pending' })
    expect(screen.getByRole('alert')).toHaveTextContent('invitation is not pending')
  })
})

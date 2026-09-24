import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { VolunteerInvitation } from '@/api/identity'
import { InvitationCard } from './InvitationCard'

const invitation: VolunteerInvitation = {
  id: 'inv-1',
  ngo_id: 'ngo-1',
  ngo_name: 'Sindh Relief Collective',
  status: 'pending',
  created_at: '2026-09-20T10:00:00Z',
}

function renderCard(overrides: Partial<React.ComponentProps<typeof InvitationCard>> = {}) {
  const props = { invitation, onAccept: vi.fn(), onDecline: vi.fn(), busy: null, disabled: false, ...overrides }
  render(<InvitationCard {...props} />)
  return props
}

describe('InvitationCard', () => {
  it('shows the NGO name, its initials, and the invite date — nothing invented beyond that', () => {
    renderCard()

    expect(screen.getByText('Sindh Relief Collective')).toBeInTheDocument()
    expect(screen.getByText('SR')).toBeInTheDocument()
    expect(screen.getByText('Invited 20 Sep 2026')).toBeInTheDocument()
  })

  it('reports Accept and Decline clicks, with the NGO name in each button\'s accessible name', async () => {
    const { onAccept, onDecline } = renderCard()

    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation from Sindh Relief Collective' }))
    await userEvent.click(screen.getByRole('button', { name: 'Decline invitation from Sindh Relief Collective' }))

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onDecline).toHaveBeenCalledTimes(1)
  })

  it('spins only the button for the action in flight, and disables both while anything is pending', () => {
    renderCard({ busy: 'accept', disabled: true })

    expect(screen.getByRole('button', { name: /Accept invitation/ })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: /Decline invitation/ })).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('button', { name: /Accept invitation/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Decline invitation/ })).toBeDisabled()
  })
})

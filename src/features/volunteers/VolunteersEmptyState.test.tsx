import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VolunteersEmptyState } from './VolunteersEmptyState'

describe('VolunteersEmptyState', () => {
  it('explains the empty roster and offers to invite', async () => {
    const onInvite = vi.fn()
    render(<VolunteersEmptyState onInvite={onInvite} canInvite />)

    expect(screen.getByRole('heading', { name: 'No volunteers yet' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Invite a volunteer' }))
    expect(onInvite).toHaveBeenCalledTimes(1)
  })

  it("offers no invite button when the organisation can't invite", () => {
    render(<VolunteersEmptyState onInvite={vi.fn()} canInvite={false} />)

    expect(screen.getByRole('heading', { name: 'No volunteers yet' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

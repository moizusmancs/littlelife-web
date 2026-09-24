import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MyNgoStatusCard } from './MyNgoStatusCard'

describe('MyNgoStatusCard', () => {
  it('shows the org name with a pending badge and no action for pending_approval', () => {
    render(<MyNgoStatusCard name="Flood Relief Karachi" status="pending_approval" onLogInAgain={vi.fn()} isLoggingOut={false} />)

    expect(screen.getByRole('heading', { name: 'Flood Relief Karachi' })).toBeInTheDocument()
    expect(screen.getByText('Pending approval')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says it was not approved for rejected, without inventing a reason', () => {
    render(<MyNgoStatusCard name="Flood Relief Karachi" status="rejected" onLogInAgain={vi.fn()} isLoggingOut={false} />)

    expect(screen.getByText('Not approved')).toBeInTheDocument()
    expect(screen.getByText(/didn't approve this registration/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('prompts a fresh login for active, and reports the click', async () => {
    const onLogInAgain = vi.fn()
    render(<MyNgoStatusCard name="Flood Relief Karachi" status="active" onLogInAgain={onLogInAgain} isLoggingOut={false} />)

    expect(screen.getByText('Approved')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Log in again' }))

    expect(onLogInAgain).toHaveBeenCalledTimes(1)
  })

  it('renders the two post-approval statuses without crashing', () => {
    const { rerender } = render(
      <MyNgoStatusCard name="Org" status="suspended" onLogInAgain={vi.fn()} isLoggingOut={false} />,
    )
    expect(screen.getByText('Suspended')).toBeInTheDocument()

    rerender(<MyNgoStatusCard name="Org" status="deactivated" onLogInAgain={vi.fn()} isLoggingOut={false} />)
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
  })
})

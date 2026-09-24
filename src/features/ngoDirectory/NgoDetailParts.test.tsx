import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Volunteer } from '@/api/identity'
import { NgoDetailHeader } from './NgoDetailHeader'
import { NgoDetailState } from './NgoDetailState'
import { NgoProfileCard } from './NgoProfileCard'
import { NgoVolunteersCard } from './NgoVolunteersCard'
import { makeNgo } from './testNgo'

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('NgoDetailHeader', () => {
  const pending = makeNgo('n-1', 'Flood Relief Karachi', 'pending_approval', { created_by_id: 'u-9', created_by_email: 'founder@example.com' })

  it('shows the identity, links the applicant to their account and the breadcrumb to the list view it came from', () => {
    wrap(<NgoDetailHeader ngo={pending} onDecide={vi.fn()} backTo="/admin/ngos?tab=all" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Flood Relief Karachi' })).toBeInTheDocument()
    expect(screen.getByText('Pending approval')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'founder@example.com' })).toHaveAttribute('href', '/admin/users/u-9')
    expect(screen.getByRole('link', { name: 'NGOs' })).toHaveAttribute('href', '/admin/ngos?tab=all')
  })

  it('offers Approve and Reject for a pending application, and reports which', async () => {
    const onDecide = vi.fn()
    wrap(<NgoDetailHeader ngo={pending} onDecide={onDecide} backTo="/admin/ngos" />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(onDecide).toHaveBeenNthCalledWith(1, 'approve')
    expect(onDecide).toHaveBeenNthCalledWith(2, 'reject')
  })

  it('offers no decision once the application is decided', () => {
    wrap(<NgoDetailHeader ngo={{ ...pending, status: 'active' }} onDecide={vi.fn()} backTo="/admin/ngos" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('NgoProfileCard', () => {
  it('lists the real fields and marks unset contact details as not provided', () => {
    render(<NgoProfileCard ngo={makeNgo('n-1', 'Indus Relief', 'pending_approval')} />)

    const card = screen.getByRole('region', { name: 'Organisation' })
    expect(within(card).getByText('n-1')).toBeInTheDocument()
    expect(within(card).getByText('Contact email').nextSibling).toHaveTextContent('Not provided')
    expect(within(card).getByText('Contact phone').nextSibling).toHaveTextContent('Not provided')
    expect(within(card).getByText('Submitted').nextSibling).toHaveTextContent(/20 Sep 2026/)
  })

  it('has no decision row while pending', () => {
    render(<NgoProfileCard ngo={makeNgo('n-1', 'x', 'pending_approval')} />)
    expect(screen.queryByText('Approved')).not.toBeInTheDocument()
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument()
  })

  it('words the decision by status: Approved for anything that was ever active, Rejected for a rejection', () => {
    const decided = { approved_at: '2026-09-22T09:00:00Z', approved_by_email: 'admin@platform.example' }
    const { rerender } = render(<NgoProfileCard ngo={makeNgo('n-1', 'x', 'active', decided)} />)
    expect(screen.getByText('Approved').nextSibling).toHaveTextContent(/22 Sep 2026.*by admin@platform\.example/)

    rerender(<NgoProfileCard ngo={makeNgo('n-1', 'x', 'deactivated', decided)} />)
    expect(screen.getByText('Approved')).toBeInTheDocument()

    rerender(<NgoProfileCard ngo={makeNgo('n-1', 'x', 'rejected', decided)} />)
    expect(screen.getByText('Rejected', { selector: 'dt' }).nextSibling).toHaveTextContent(/by admin@platform\.example/)
    expect(screen.queryByText('Approved')).not.toBeInTheDocument()
  })
})

describe('NgoVolunteersCard', () => {
  const volunteers: Volunteer[] = [
    { id: 'v-1', email: 'vera@example.com', status: 'active', created_at: '2026-09-20T06:44:36Z' },
    { id: 'v-2', email: 'sam@example.com', status: 'suspended', created_at: '2026-08-01T06:44:36Z' },
  ]
  const props = { isLoading: false, error: null, onRetry: vi.fn() }

  it('lists the roster with a count, statuses, and each email linking to that account', () => {
    wrap(<NgoVolunteersCard {...props} volunteers={volunteers} />)

    expect(screen.getByRole('heading', { name: 'Volunteers · 2' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'vera@example.com' })).toHaveAttribute('href', '/admin/users/v-1')
    expect(screen.getByText('Suspended')).toBeInTheDocument()
    expect(screen.getByText(/Account created 20 Sep 2026/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says so for an empty roster, and shows loading and a retryable error as distinct states', async () => {
    const onRetry = vi.fn()
    const { rerender } = wrap(<NgoVolunteersCard {...props} volunteers={[]} />)
    expect(screen.getByText('This organisation has no volunteers.')).toBeInTheDocument()

    rerender(<MemoryRouter><NgoVolunteersCard volunteers={undefined} isLoading error={null} onRetry={onRetry} /></MemoryRouter>)
    expect(screen.getByLabelText('Loading volunteers')).toBeInTheDocument()

    rerender(<MemoryRouter><NgoVolunteersCard volunteers={undefined} isLoading={false} error="roster down" onRetry={onRetry} /></MemoryRouter>)
    expect(screen.getByRole('alert')).toHaveTextContent('roster down')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('NgoDetailState', () => {
  it('is a busy skeleton while loading', () => {
    wrap(<NgoDetailState kind="loading" onRetry={vi.fn()} backTo="/admin/ngos" />)
    expect(screen.getByLabelText('Loading organisation')).toHaveAttribute('aria-busy', 'true')
  })

  it('says not found with a way back and no retry', () => {
    wrap(<NgoDetailState kind="not-found" onRetry={vi.fn()} backTo="/admin/ngos?tab=all" />)

    expect(screen.getByRole('heading', { name: 'Organisation not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to NGOs' })).toHaveAttribute('href', '/admin/ngos?tab=all')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('shows a load error with a working retry', async () => {
    const onRetry = vi.fn()
    wrap(<NgoDetailState kind="error" message="boom" onRetry={onRetry} backTo="/admin/ngos" />)

    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

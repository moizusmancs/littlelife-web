import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSummary } from '@/api/identity'
import type { ModerationAction } from '@/api/trust'
import { AccountDetailHeader } from './AccountDetailHeader'
import { AccountDetailState } from './AccountDetailState'
import { AccountSummaryCard } from './AccountSummaryCard'
import { CredibilityCard } from './CredibilityCard'
import { ModerationHistoryCard } from './ModerationHistoryCard'

const account: AccountSummary = {
  id: '4ac58f97-1234-4abc-9def-0123456789ab',
  email: 'aisha@example.com',
  role: 'ngo_admin',
  status: 'active',
  email_verified: false,
  created_at: '2026-09-20T06:44:36Z',
  updated_at: '2026-09-21T10:00:00Z',
}

describe('AccountDetailHeader', () => {
  const renderHeader = (props: Partial<React.ComponentProps<typeof AccountDetailHeader>> = {}) => {
    const onStatusAction = vi.fn()
    render(
      <MemoryRouter>
        <AccountDetailHeader account={account} isSelf={false} actions={['suspend']} onStatusAction={onStatusAction} backTo="/admin/users?role=user" {...props} />
      </MemoryRouter>,
    )
    return { onStatusAction }
  }

  it('shows the identity with role and status pills, and a breadcrumb back to the list view it came from', () => {
    renderHeader()

    expect(screen.getByRole('heading', { level: 1, name: 'aisha@example.com' })).toBeInTheDocument()
    expect(screen.getByText('NGO admin')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Users & Accounts/ })).toHaveAttribute('href', '/admin/users?role=user')
  })

  it('offers exactly the actions it is given, and reports which was clicked', async () => {
    const { onStatusAction } = renderHeader({ actions: ['suspend', 'reactivate'] })

    await userEvent.click(screen.getByRole('button', { name: 'Suspend account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate account' }))

    expect(onStatusAction).toHaveBeenNthCalledWith(1, 'suspend')
    expect(onStatusAction).toHaveBeenNthCalledWith(2, 'reactivate')
  })

  it("for the caller's own account: marks it You, has no buttons, and explains why", () => {
    renderHeader({ isSelf: true, actions: [] })

    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/your own account/)).toBeInTheDocument()
  })
})

describe('AccountSummaryCard', () => {
  it('lists the real fields, including whether the email is verified', () => {
    render(<AccountSummaryCard account={account} />)

    const card = screen.getByRole('region', { name: 'Account details' })
    expect(within(card).getByText(account.id)).toBeInTheDocument()
    expect(within(card).getByText('Email verified').nextSibling).toHaveTextContent('No')
    expect(within(card).getByText('Created').nextSibling).toHaveTextContent(/20 Sep 2026/)
    expect(within(card).getByText('Last updated').nextSibling).toHaveTextContent(/21 Sep 2026/)
  })
})

describe('CredibilityCard', () => {
  const props = { isLoading: false, error: null, onRetry: vi.fn() }

  it('shows a real score with its date and a bar', () => {
    render(<CredibilityCard {...props} score={{ account_id: 'x', score: 42, updated_at: '2026-09-18T00:10:05Z' }} />)

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText(/updated 18 Sep 2026/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Credibility score 42 out of 100' })).toBeInTheDocument()
  })

  it('shows "Not scored yet" — not a zero — when the backend reports no stored score', () => {
    render(<CredibilityCard {...props} score={{ account_id: 'x', score: 0 }} />)

    expect(screen.getByText('Not scored yet')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('does show an actually-stored zero as a score', () => {
    render(<CredibilityCard {...props} score={{ account_id: 'x', score: 0, updated_at: '2026-09-18T00:10:05Z' }} />)

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Not scored yet')).not.toBeInTheDocument()
  })

  it('says the itemised history is not recorded yet', () => {
    render(<CredibilityCard {...props} score={{ account_id: 'x', score: 0 }} />)
    expect(screen.getByText(/itemised history/)).toBeInTheDocument()
  })

  it('shows loading, and an error with a working retry', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(<CredibilityCard score={undefined} isLoading error={null} onRetry={onRetry} />)
    expect(screen.getByLabelText('Loading credibility')).toBeInTheDocument()

    rerender(<CredibilityCard score={undefined} isLoading={false} error="boom" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('ModerationHistoryCard', () => {
  const entries: ModerationAction[] = [
    { id: 'm-2', target_account_id: 'x', action_type: 'suspend', reason: 'Repeated false reports.\nSecond line.', performed_by: 'me', created_at: '2026-09-22T10:00:00Z' },
    { id: 'm-1', target_account_id: 'x', action_type: 'warn', reason: 'First warning', performed_by: 'other', created_at: '2026-09-20T10:00:00Z' },
  ]
  const renderCard = (props: Partial<React.ComponentProps<typeof ModerationHistoryCard>> = {}) =>
    render(
      <ModerationHistoryCard
        actions={entries}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        performerLabel={(id) => (id === 'me' ? 'You' : 'other@example.com')}
        onLog={vi.fn()}
        {...props}
      />,
    )

  it('lists entries in the order given, each with type, reason, who and when', () => {
    renderCard()

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Suspend')).toBeInTheDocument()
    expect(within(items[0]).getByText(/You · 22 Sep 2026/)).toBeInTheDocument()
    expect(within(items[0]).getByText(/Repeated false reports\./)).toBeInTheDocument()
    expect(within(items[1]).getByText('Warn')).toBeInTheDocument()
    expect(within(items[1]).getByText(/other@example\.com/)).toBeInTheDocument()
  })

  it('has a Log button when it can log, and none (for the caller\'s own account) when it cannot', async () => {
    const onLog = vi.fn()
    const { unmount } = renderCard({ onLog })
    await userEvent.click(screen.getByRole('button', { name: 'Log moderation action' }))
    expect(onLog).toHaveBeenCalledTimes(1)
    unmount()

    renderCard({ onLog: undefined })
    expect(screen.queryByRole('button', { name: 'Log moderation action' })).not.toBeInTheDocument()
  })

  it('shows an empty message, loading, and an error with retry as distinct states', async () => {
    const onRetry = vi.fn()
    const { rerender } = renderCard({ actions: [] })
    expect(screen.getByText(/No moderation actions have been recorded/)).toBeInTheDocument()

    rerender(<ModerationHistoryCard actions={undefined} isLoading error={null} onRetry={onRetry} performerLabel={() => ''} />)
    expect(screen.getByLabelText('Loading moderation history')).toBeInTheDocument()

    rerender(<ModerationHistoryCard actions={undefined} isLoading={false} error="nope" onRetry={onRetry} performerLabel={() => ''} />)
    expect(screen.getByRole('alert')).toHaveTextContent('nope')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('AccountDetailState', () => {
  const renderState = (props: Partial<React.ComponentProps<typeof AccountDetailState>>) =>
    render(
      <MemoryRouter>
        <AccountDetailState kind="loading" onRetry={vi.fn()} backTo="/admin/users" {...props} />
      </MemoryRouter>,
    )

  it('is a busy skeleton while loading', () => {
    renderState({ kind: 'loading' })
    expect(screen.getByLabelText('Loading account')).toHaveAttribute('aria-busy', 'true')
  })

  it('says the account was not found, with a way back and no retry', () => {
    renderState({ kind: 'not-found' })

    expect(screen.getByRole('heading', { name: 'Account not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to Users/ })).toHaveAttribute('href', '/admin/users')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('shows a load error with a working retry', async () => {
    const onRetry = vi.fn()
    renderState({ kind: 'error', message: 'Something went wrong.', onRetry })

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

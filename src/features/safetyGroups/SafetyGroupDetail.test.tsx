import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AMNA, connected, declined, incoming, link, ME, outgoing } from './fixtures'
import { SafetyGroupDetail } from './SafetyGroupDetail'

function renderDetail(overrides: Partial<React.ComponentProps<typeof SafetyGroupDetail>> = {}) {
  const props = { connection: connected(), me: ME, busy: null, onAccept: vi.fn(), onDecline: vi.fn(), onRemove: vi.fn(), ...overrides }
  render(
    <MemoryRouter>
      <SafetyGroupDetail {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('SafetyGroupDetail', () => {
  it('links back to the list', () => {
    renderDetail()
    expect(screen.getByRole('link', { name: 'Back to Safety Groups' })).toHaveAttribute('href', '/app/safety-groups')
  })

  it('names the other person, with their email, and still shows their full Member ID with a copy button', () => {
    renderDetail()

    expect(screen.getByRole('heading', { level: 1, name: 'Amna Khan' })).toBeInTheDocument()
    expect(screen.getByText('amna@example.com')).toBeInTheDocument()
    expect(screen.getByText('AK')).toBeInTheDocument()
    expect(screen.getByTestId('member-id')).toHaveTextContent(AMNA)
    expect(screen.getByRole('button', { name: 'Copy Member ID' })).toBeInTheDocument()
  })

  it('falls back to "Member" and the start of their id for someone you asked who has not accepted — the server shows you nothing more', () => {
    renderDetail({ connection: outgoing() })

    expect(screen.getByRole('heading', { level: 1, name: 'Member 8D0D395C' })).toBeInTheDocument()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
    expect(screen.getByTestId('member-id')).toHaveTextContent(AMNA)
  })

  it('shows the email you typed as the title once it is on the row', () => {
    renderDetail({ connection: { ...outgoing(), recipient_email: 'amna@example.com' } })
    expect(screen.getByRole('heading', { level: 1, name: 'amna@example.com' })).toBeInTheDocument()
  })

  it('lists exactly the facts the API returns', () => {
    renderDetail({ connection: connected({ type: 'safety_group' }) })

    const facts = screen.getByRole('region', { name: 'Details' })
    expect(facts).toHaveTextContent('RelationshipSafety group')
    expect(facts).toHaveTextContent('Requested byYou')
    expect(facts).toHaveTextContent('Requested on20 Sep 2026')
    expect(facts).toHaveTextContent('Accepted on21 Sep 2026')
  })

  it('says a request came from them, and labels a declined answer', () => {
    renderDetail({ connection: link(AMNA, ME, 'declined') })

    const facts = screen.getByRole('region', { name: 'Details' })
    expect(facts).toHaveTextContent('Requested byThem')
    expect(facts).toHaveTextContent('Declined on22 Sep 2026')
  })

  it('has no answered-on line while a request is still pending', () => {
    renderDetail({ connection: outgoing() })
    expect(screen.queryByText(/Accepted on|Declined on/)).not.toBeInTheDocument()
  })

  it('offers Remove member for a connected one, and says it ends for both', async () => {
    const { onRemove } = renderDetail()

    expect(screen.getByText('Removing ends the connection for both of you.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove member' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('offers Accept and Decline — and no Remove — for a request waiting on you', async () => {
    const { onAccept, onDecline } = renderDetail({ connection: incoming() })

    expect(screen.getByText('Waiting for you')).toBeInTheDocument() // the status badge, said once
    expect(screen.queryByRole('button', { name: /Remove|Cancel request/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onDecline).toHaveBeenCalledTimes(1)
  })

  it('offers Cancel request for one you sent, and Remove for a declined one', () => {
    const { unmount } = render(
      <MemoryRouter>
        <SafetyGroupDetail connection={outgoing()} me={ME} busy={null} onAccept={vi.fn()} onDecline={vi.fn()} onRemove={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument()
    unmount()

    renderDetail({ connection: declined() })
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('spins the button in flight and disables the others', () => {
    renderDetail({ connection: incoming(), busy: 'decline' })

    expect(screen.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled()
  })
})

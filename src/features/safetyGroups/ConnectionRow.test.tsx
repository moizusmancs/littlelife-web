import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionRow } from './ConnectionRow'
import { AMNA, connected, declined, incoming, link, ME, outgoing } from './fixtures'

function renderRow(overrides: Partial<React.ComponentProps<typeof ConnectionRow>> = {}) {
  const props = {
    connection: outgoing(),
    me: ME,
    busy: null,
    disabled: false,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
  render(
    <MemoryRouter>
      <ConnectionRow {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('ConnectionRow', () => {
  it('names the other person, with their email under it, the kind, and a link to the detail screen', () => {
    renderRow({ connection: connected({ id: 'abc' }) })

    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/safety-groups/abc')
    expect(screen.getByText('Amna Khan')).toBeInTheDocument()
    expect(screen.getByText('amna@example.com')).toBeInTheDocument()
    expect(screen.getByText('Family')).toBeInTheDocument()
    expect(screen.getByText('Connected since 21 Sep 2026')).toBeInTheDocument()
  })

  it('uses their initials as the avatar when there is a name to take them from', () => {
    renderRow({ connection: connected() })
    expect(screen.getByText('AK')).toBeInTheDocument()
  })

  it('shows the safety-group kind for that type', () => {
    renderRow({ connection: connected({ type: 'safety_group' }) })
    expect(screen.getByText('Safety group')).toBeInTheDocument()
  })

  it('falls back to the email as the title — and shows it once, not twice — for someone with no name yet', () => {
    renderRow({ connection: { ...connected(), recipient_name: '' } })

    expect(screen.getAllByText('amna@example.com')).toHaveLength(1)
  })

  it('falls back to "Member" and the start of their id for a request you sent, which the server shows you nothing about', () => {
    renderRow({ connection: outgoing() })

    expect(screen.getByText('Member 8D0D395C')).toBeInTheDocument()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it('shows the email you typed for a request you sent once it has been put back on the row', () => {
    renderRow({ connection: { ...outgoing(), recipient_email: 'amna@example.com' } })

    expect(screen.getByText('amna@example.com')).toBeInTheDocument()
    expect(screen.queryByText(/^Member /)).not.toBeInTheDocument()
  })

  it('offers Accept and Decline for a request waiting on you — by name — and reports each', async () => {
    const { onAccept, onDecline } = renderRow({ connection: incoming() })

    expect(screen.getByText('Wants to connect · 20 Sep 2026')).toBeInTheDocument()
    expect(screen.getByText('amna@example.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept request from Amna Khan' }))
    await userEvent.click(screen.getByRole('button', { name: 'Decline request from Amna Khan' }))

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onDecline).toHaveBeenCalledTimes(1)
  })

  it('offers only Cancel request for one you sent — you cannot accept your own', async () => {
    const { onRemove } = renderRow({ connection: outgoing() })

    expect(screen.getByText('You invited them · 20 Sep 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Accept/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel your request to Member 8D0D395C' }))

    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('says who declined, and offers Remove', async () => {
    const { onRemove } = renderRow({ connection: declined() })

    expect(screen.getByText('They declined · 22 Sep 2026')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove the declined request with Member 8D0D395C' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('says "You declined" when the request was theirs to you', () => {
    renderRow({ connection: link(AMNA, ME, 'declined') })
    expect(screen.getByText('You declined · 22 Sep 2026')).toBeInTheDocument()
  })

  it('has no buttons for a connected member — removal lives on the detail screen', () => {
    renderRow({ connection: connected() })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('spins only the button for the action in flight and disables the rest', () => {
    renderRow({ connection: incoming(), busy: 'accept', disabled: true })

    expect(screen.getByRole('button', { name: /Accept request/ })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: /Decline request/ })).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('button', { name: /Accept request/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Decline request/ })).toBeDisabled()
  })
})

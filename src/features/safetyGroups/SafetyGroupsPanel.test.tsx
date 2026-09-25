import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { BILAL, connected, incoming, link, ME } from './fixtures'
import { SafetyGroupsPanel } from './SafetyGroupsPanel'

function renderPanel(overrides: Partial<React.ComponentProps<typeof SafetyGroupsPanel>> = {}) {
  const props = {
    connections: [],
    me: ME,
    onInvite: vi.fn(),
    pending: null,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
  render(
    <MemoryRouter>
      <SafetyGroupsPanel {...props} />
    </MemoryRouter>,
  )
  return props
}

describe('SafetyGroupsPanel', () => {
  it('always shows how to be invited: your email, and your Member ID with a Copy button', () => {
    renderPanel({ email: 'hina@example.com' })

    expect(screen.getByText('hina@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('own-member-id')).toHaveTextContent(ME)
    expect(screen.getByRole('button', { name: 'Copy Member ID' })).toBeInTheDocument()
  })

  it('still offers the Member ID when the account has no email to show', () => {
    renderPanel()
    expect(screen.getByTestId('own-member-id')).toHaveTextContent(ME)
  })

  it('shows an empty state — not an error — when there are no connections, with a way to invite', async () => {
    const { onInvite } = renderPanel()

    expect(screen.getByText('Nobody in your circle yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Invite a member' }))
    expect(onInvite).toHaveBeenCalledTimes(1)
  })

  it('opens the invite dialog from the header button', async () => {
    const { onInvite } = renderPanel({ connections: [connected()] })
    await userEvent.click(screen.getByRole('button', { name: 'Invite member' }))
    expect(onInvite).toHaveBeenCalledTimes(1)
  })

  it('groups the list into sections with counts, most urgent first, and leaves out empty ones', () => {
    renderPanel({
      connections: [
        link(ME, BILAL, 'declined', { id: 'd' }),
        connected({ id: 'c1' }),
        link(ME, BILAL, 'pending', { id: 'o' }),
        incoming({ id: 'i' }),
        link(BILAL, ME, 'accepted', { id: 'c2' }),
      ],
    })

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['How people invite you', 'Requests for you · 1', 'Connected · 2', 'Waiting for a reply · 1', 'Declined · 1'])
    expect(within(screen.getByRole('region', { name: 'Connected' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('draws no section for a status nobody is in', () => {
    renderPanel({ connections: [connected()] })
    expect(screen.queryByRole('region', { name: 'Requests for you' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Declined' })).not.toBeInTheDocument()
  })

  it('routes each row action to the connection it belongs to', async () => {
    const request = incoming({ id: 'i' })
    const sent = link(ME, BILAL, 'pending', { id: 'o' })
    const props = renderPanel({ connections: [request, sent] })

    await userEvent.click(screen.getByRole('button', { name: /Accept request/ }))
    await userEvent.click(screen.getByRole('button', { name: /Decline request/ }))
    await userEvent.click(screen.getByRole('button', { name: /Cancel your request/ }))

    expect(props.onAccept).toHaveBeenCalledWith(request)
    expect(props.onDecline).toHaveBeenCalledWith(request)
    expect(props.onRemove).toHaveBeenCalledWith(sent)
  })

  it('spins the row whose action is in flight and disables every action', () => {
    renderPanel({
      connections: [incoming({ id: 'i' }), link(ME, BILAL, 'pending', { id: 'o' })],
      pending: { id: 'i', action: 'accept' },
    })

    expect(screen.getByRole('button', { name: /Accept request/ })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: /Cancel your request/ })).toBeDisabled()
  })

  it('renders whatever banner it is given under the header', () => {
    renderPanel({ connections: [connected()], banner: <p>You're now connected.</p> })
    expect(screen.getByText("You're now connected.")).toBeInTheDocument()
  })
})

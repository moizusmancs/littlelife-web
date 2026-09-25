import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import { AMNA, BILAL, connected, declined, incoming, link, ME, outgoing } from '@/features/safetyGroups/fixtures'
import { readInviteHints } from '@/features/safetyGroups/inviteHints'
import { renderSafetyGroups, serveConnections, signInAsMe } from './safetyGroupsTestKit'

const NOT_FOUND = "We couldn't find an active LittleLife member with that email."

describe('SafetyGroupsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    signInAsMe()
  })
  afterEach(() => useAuthStore.getState().clearAuth())

  it('lists the circle in sections by name, and shows how to be invited', async () => {
    serveConnections([incoming({ id: 'i' }), link(BILAL, ME, 'accepted', { id: 'c' }), link(ME, BILAL, 'declined', { id: 'd' })])
    renderSafetyGroups()

    expect(await screen.findByRole('region', { name: 'Requests for you' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Requests for you' })).getByText('Amna Khan')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Connected' })).getByText('Bilal Rehman')).toBeInTheDocument()
    // A request you sent and they declined shows you nothing about them.
    expect(within(screen.getByRole('region', { name: 'Declined' })).getByText(/^Member 5D4E7C55$/)).toBeInTheDocument()
    expect(screen.getByTestId('own-member-id')).toHaveTextContent(ME)
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
  })

  it('shows an empty state — not an error — for an account with no connections', async () => {
    serveConnections([])
    renderSafetyGroups()

    expect(await screen.findByText('Nobody in your circle yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the failure with a retry, and recovers when the retry succeeds', async () => {
    let failing = true
    server.use(
      http.get('*/safety-connections', () => (failing ? HttpResponse.json({ error: 'boom' }, { status: 500 }) : HttpResponse.json([connected()]))),
      http.post('*/auth/refresh', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    )
    renderSafetyGroups()

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Amna Khan')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('answering a request', () => {
    it('accepts it: calls the route, moves the row to Connected, and says so', async () => {
      const { calls } = serveConnections([incoming({ id: 'i' })])
      renderSafetyGroups()

      await userEvent.click(await screen.findByRole('button', { name: 'Accept request from Amna Khan' }))

      expect(await screen.findByText("You're now connected to Amna Khan.")).toBeInTheDocument()
      expect(calls).toEqual([{ method: 'PATCH', path: '/safety-connections/i/accept' }])
      expect(within(screen.getByRole('region', { name: 'Connected' })).getByText('Amna Khan')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Requests for you' })).not.toBeInTheDocument()
    })

    it('declines it: moves the row to Declined and says so', async () => {
      const { calls } = serveConnections([incoming({ id: 'i' })])
      renderSafetyGroups()

      await userEvent.click(await screen.findByRole('button', { name: 'Decline request from Amna Khan' }))

      expect(await screen.findByText('You declined the request from Amna Khan.')).toBeInTheDocument()
      expect(calls).toEqual([{ method: 'PATCH', path: '/safety-connections/i/decline' }])
      expect(within(screen.getByRole('region', { name: 'Declined' })).getByText(/You declined/)).toBeInTheDocument()
    })

    it("shows the server's message and refetches when the request has already been answered", async () => {
      serveConnections([incoming({ id: 'i' })])
      server.use(http.patch('*/safety-connections/i/accept', () => HttpResponse.json({ error: 'connection is not pending' }, { status: 409 })))
      renderSafetyGroups()

      await userEvent.click(await screen.findByRole('button', { name: /Accept request/ }))

      expect(await screen.findByRole('alert')).toHaveTextContent('connection is not pending')
    })
  })

  describe('removing', () => {
    it('cancels a request you sent, after a confirmation, and says so', async () => {
      const { calls } = serveConnections([outgoing({ id: 'o' })])
      renderSafetyGroups()

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel your request to Member 8D0D395C' }))
      expect(calls).toEqual([]) // asked first, nothing sent yet
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel request' }))

      expect(await screen.findByText('Your request to Member 8D0D395C was cancelled.')).toBeInTheDocument()
      expect(calls).toEqual([{ method: 'DELETE', path: '/safety-connections/o' }])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Nobody in your circle yet')).toBeInTheDocument()
    })

    it('sends nothing when the confirmation is backed out of', async () => {
      const { calls } = serveConnections([declined({ id: 'd' })])
      renderSafetyGroups()

      await userEvent.click(await screen.findByRole('button', { name: /Remove the declined request/ }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(calls).toEqual([])
      expect(screen.getByText('Member 8D0D395C')).toBeInTheDocument()
    })

    it("keeps the dialog open with the server's message when the removal fails", async () => {
      serveConnections([declined({ id: 'd' })])
      server.use(http.delete('*/safety-connections/d', () => HttpResponse.json({ error: 'this safety connection does not involve your account' }, { status: 403 })))
      renderSafetyGroups()

      await userEvent.click(await screen.findByRole('button', { name: /Remove the declined request/ }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))

      expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('does not involve your account')
    })
  })

  describe('inviting', () => {
    async function openInvite() {
      await userEvent.click(await screen.findByRole('button', { name: 'Invite member' }))
      return screen.getByRole('dialog')
    }

    async function inviteByEmail(email: string) {
      const dialog = await openInvite()
      await userEvent.type(within(dialog).getByLabelText('Their email'), email)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))
      return dialog
    }

    it('sends the email as typed, closes the dialog, and shows the new request under the email you typed', async () => {
      const { calls } = serveConnections([connected({ id: 'c' })])
      renderSafetyGroups()

      const dialog = await openInvite()
      await userEvent.type(within(dialog).getByLabelText('Their email'), '  Bilal@Example.com ')
      await userEvent.selectOptions(within(dialog).getByLabelText('They are'), 'safety_group')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

      expect(await screen.findByText("Request sent to Bilal@Example.com. You'll be connected once they accept it.")).toBeInTheDocument()
      expect(calls).toEqual([{ method: 'POST', path: '/safety-connections', body: { recipient_email: 'Bilal@Example.com', connection_type: 'safety_group' } }])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      // The server tells the requester nothing about the recipient — the row carries what was typed.
      expect(within(await screen.findByRole('region', { name: 'Waiting for a reply' })).getByText('Bilal@Example.com')).toBeInTheDocument()
    })

    it('remembers the typed email on this device, under your own account, so a reload still shows it', async () => {
      serveConnections([])
      const { unmount } = renderSafetyGroups()

      await inviteByEmail('bilal@example.com')
      await screen.findByRole('region', { name: 'Waiting for a reply' })
      expect(Object.values(readInviteHints(ME))).toEqual(['bilal@example.com'])
      unmount()

      renderSafetyGroups()
      expect(within(await screen.findByRole('region', { name: 'Waiting for a reply' })).getByText('bilal@example.com')).toBeInTheDocument()
    })

    it('sends a Member ID, in lower case, when that is how they are named, and shows "Member …" for them', async () => {
      const { calls } = serveConnections([])
      renderSafetyGroups()

      const dialog = await openInvite()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Use a Member ID instead' }))
      await userEvent.type(within(dialog).getByLabelText('Their Member ID'), `  ${BILAL.toUpperCase()} `)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

      expect(await screen.findByText("Request sent to Member 5D4E7C55. You'll be connected once they accept it.")).toBeInTheDocument()
      expect(calls).toEqual([{ method: 'POST', path: '/safety-connections', body: { recipient_account_id: BILAL, connection_type: 'family' } }])
      expect(within(await screen.findByRole('region', { name: 'Waiting for a reply' })).getByText('Member 5D4E7C55')).toBeInTheDocument()
      expect(readInviteHints(ME)).toEqual({}) // nothing typed that is worth remembering
    })

    it('checks only the shape of the email in the browser — no request for one that is not an email', async () => {
      const { calls } = serveConnections([])
      renderSafetyGroups()

      const dialog = await inviteByEmail('not-an-email')

      expect(await within(dialog).findByText('Enter a valid email address')).toBeInTheDocument()
      expect(calls).toEqual([])
    })

    it("puts the server's 'not found' in plainer words, since it also covers an account that is not an active citizen", async () => {
      serveConnections([])
      renderSafetyGroups()

      const dialog = await inviteByEmail('nobody@example.com')

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(NOT_FOUND)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(readInviteHints(ME)).toEqual({}) // nothing was sent, so nothing to remember
    })

    it('says the same about a Member ID that matches nobody', async () => {
      serveConnections([])
      renderSafetyGroups()

      const dialog = await openInvite()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Use a Member ID instead' }))
      await userEvent.type(within(dialog).getByLabelText('Their Member ID'), '00000000-0000-4000-8000-000000000000')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent("We couldn't find an active LittleLife member with that Member ID.")
    })

    it.each([
      ['your own email', [], 'hina@example.com', /cannot send a safety connection request to yourself/],
      ['someone you are already connected to', [connected({ id: 'c' })], 'amna@example.com', /you are already connected to this person/],
      ['someone you already invited', [outgoing({ id: 'o' })], 'amna@example.com', /a pending connection request already exists/],
      ['someone who has already invited you', [incoming({ id: 'i' })], 'amna@example.com', /this person has already sent you a request/],
    ])('shows the server\'s own message, unchanged, for %s', async (_label, existing, email, message) => {
      serveConnections(existing)
      renderSafetyGroups()

      const dialog = await inviteByEmail(email)

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('lets you ask again after a declined request', async () => {
      const { calls } = serveConnections([declined({ id: 'd' })])
      renderSafetyGroups()

      await inviteByEmail('amna@example.com')

      await waitFor(() => expect(calls).toHaveLength(1))
      expect(await screen.findByText(/Request sent to amna@example.com/)).toBeInTheDocument()
    })

    it('opens empty each time on the email field — a previous mistake and method do not carry over', async () => {
      serveConnections([])
      renderSafetyGroups()

      let dialog = await openInvite()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Use a Member ID instead' }))
      await userEvent.type(within(dialog).getByLabelText('Their Member ID'), 'nonsense')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))
      await within(dialog).findByText(/doesn't look like a Member ID/)
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      dialog = await openInvite()
      expect(within(dialog).getByLabelText('Their email')).toHaveValue('')
      expect(within(dialog).queryByText(/doesn't look like a Member ID/)).not.toBeInTheDocument()
    })
  })

  it('shows a message passed from the detail screen once, above the list', async () => {
    serveConnections([connected()])
    renderSafetyGroups('/app/safety-groups', { notice: 'Amna Khan was removed from your safety groups.' })

    expect(await screen.findByText('Amna Khan was removed from your safety groups.')).toBeInTheDocument()
  })

  it('does not show an unaccepted recipient anything the server did not send', async () => {
    serveConnections([link(ME, AMNA, 'pending', { id: 'o' })])
    renderSafetyGroups()

    const row = within(await screen.findByRole('region', { name: 'Waiting for a reply' }))
    expect(row.getByText('Member 8D0D395C')).toBeInTheDocument()
    expect(screen.queryByText('Amna Khan')).not.toBeInTheDocument()
    expect(screen.queryByText('amna@example.com')).not.toBeInTheDocument()
  })
})

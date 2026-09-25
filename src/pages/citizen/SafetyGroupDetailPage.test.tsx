import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/store/auth'
import { AMNA, connected, incoming, outgoing } from '@/features/safetyGroups/fixtures'
import { renderSafetyGroups, serveConnections, signInAsMe } from './safetyGroupsTestKit'

const AMNA_LABEL = 'Amna Khan'

describe('SafetyGroupDetailPage', () => {
  beforeEach(() => {
    localStorage.clear()
    signInAsMe()
  })
  afterEach(() => useAuthStore.getState().clearAuth())

  it("finds the connection in the account's list by id and shows it", async () => {
    serveConnections([outgoing({ id: 'other' }), connected({ id: 'c1' })])
    renderSafetyGroups('/app/safety-groups/c1')

    expect(await screen.findByRole('heading', { level: 1, name: AMNA_LABEL })).toBeInTheDocument()
    expect(screen.getByTestId('member-id')).toHaveTextContent(AMNA)
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('amna@example.com')).toBeInTheDocument()
  })

  it('shows the email you typed for a request you sent — remembered on this device — since the server tells you nothing else', async () => {
    serveConnections([outgoing({ id: 'o' })])
    localStorage.setItem('ll:safety-invites:3165dfbc-a40e-415b-8e50-0062a0c94471', JSON.stringify({ o: 'amna@example.com' }))
    renderSafetyGroups('/app/safety-groups/o')

    expect(await screen.findByRole('heading', { level: 1, name: 'amna@example.com' })).toBeInTheDocument()
    expect(screen.getByTestId('member-id')).toHaveTextContent(AMNA)
  })

  it('says the connection is not in your list for an unknown id — nothing else to fetch it from', async () => {
    serveConnections([connected({ id: 'c1' })])
    renderSafetyGroups('/app/safety-groups/nope')

    expect(await screen.findByRole('heading', { name: "This connection isn't in your list" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Safety Groups' })).toHaveAttribute('href', '/app/safety-groups')
  })

  it('shows the failure with a retry', async () => {
    server.use(
      http.get('*/safety-connections', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      http.post('*/auth/refresh', () => HttpResponse.json({ error: 'no session' }, { status: 401 })),
    )
    renderSafetyGroups('/app/safety-groups/c1')

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('accepts a request from the detail screen — stays here, updates in place, and says so', async () => {
    const { calls } = serveConnections([incoming({ id: 'i' })])
    renderSafetyGroups('/app/safety-groups/i')

    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }))

    expect(await screen.findByText(`You're now connected to ${AMNA_LABEL}.`)).toBeInTheDocument()
    expect(calls).toEqual([{ method: 'PATCH', path: '/safety-connections/i/accept' }])
    expect(await screen.findByRole('button', { name: 'Remove member' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  })

  it('declines from the detail screen', async () => {
    serveConnections([incoming({ id: 'i' })])
    renderSafetyGroups('/app/safety-groups/i')

    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))

    expect(await screen.findByText(`You declined the request from ${AMNA_LABEL}.`)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('removes a connected member after a confirmation, then returns to the list with a message', async () => {
    const { calls } = serveConnections([connected({ id: 'c1' })])
    renderSafetyGroups('/app/safety-groups/c1')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove member' }))
    expect(calls).toEqual([])
    expect(within(screen.getByRole('dialog')).getByText(/ends for both of you/)).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove member' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Safety Groups' })).toBeInTheDocument()
    expect(screen.getByText(`${AMNA_LABEL} was removed from your safety groups.`)).toBeInTheDocument()
    expect(calls).toEqual([{ method: 'DELETE', path: '/safety-connections/c1' }])
  })

  it('cancels nothing when the confirmation is backed out of', async () => {
    const { calls } = serveConnections([connected({ id: 'c1' })])
    renderSafetyGroups('/app/safety-groups/c1')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove member' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('shows the not-in-your-list state when the other person removed it first', async () => {
    const { setRows } = serveConnections([connected({ id: 'c1' })])
    server.use(http.delete('*/safety-connections/c1', () => HttpResponse.json({ error: 'safety connection not found' }, { status: 404 })))
    renderSafetyGroups('/app/safety-groups/c1')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove member' }))
    setRows([]) // they removed it while the dialog was open
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove member' }))

    expect(await screen.findByRole('heading', { name: "This connection isn't in your list" })).toBeInTheDocument()
  })
})

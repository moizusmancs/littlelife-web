import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeLiveLocation } from '@/features/liveLocation/testKit'
import { useAuthStore } from '@/store/auth'
import { AMNA, connected, incoming, ME, outgoing } from '@/features/safetyGroups/fixtures'
import { renderSafetyGroups, serveConnections, signInAsMe } from './safetyGroupsTestKit'

// The map itself is tested on its own (real Leaflet); here it is a stand-in that shows what the page handed it.
vi.mock('@/features/liveLocation/MemberLocationMap', () => ({
  MemberLocationMap: ({ position, live, label }: { position: [number, number]; live: boolean; label: string }) => (
    <div role="group" aria-label={label} data-testid="member-map" data-live={String(live)}>
      {position.join(',')}
    </div>
  ),
}))

const frame = (accountId: string, lat = 24.86, lng = 67.05) => ({ account_id: accountId, lat, lng, recorded_at: '2026-09-25T13:51:04Z' })

describe('Safety Groups — live location', () => {
  let world: ReturnType<typeof fakeLiveLocation>

  beforeEach(() => {
    localStorage.clear()
    signInAsMe()
    world = fakeLiveLocation({ idleCloseMs: 20 })
  })
  afterEach(() => {
    world.controller.dispose()
    useAuthStore.getState().clearAuth()
  })

  describe('the list', () => {
    it('has no share card, and opens no socket, when nobody is connected yet', async () => {
      serveConnections([incoming({ id: 'i' }), outgoing({ id: 'o' })])
      renderSafetyGroups('/app/safety-groups', undefined, world.controller)

      await screen.findByRole('region', { name: 'Requests for you' })
      expect(screen.queryByRole('switch', { name: 'Share my live location' })).not.toBeInTheDocument()
      expect(world.channel.opens).toBe(0)
    })

    it('with a connected member: offers the switch, and opens the socket to listen', async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups', undefined, world.controller)

      expect(await screen.findByRole('switch', { name: 'Share my live location' })).not.toBeChecked()
      expect(screen.getByText(/Sent to the 1 person you're connected to/)).toBeInTheDocument()
      expect(world.channel.opens).toBe(1)
    })

    it('turning it on asks the browser for the position, and sends it — to the relay, as {lat, lng} — once connected', async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups', undefined, world.controller)

      await userEvent.click(await screen.findByRole('switch', { name: 'Share my live location' }))
      expect(screen.getByRole('switch', { name: 'Share my live location' })).toBeChecked()
      expect(world.geo.watching).toHaveLength(1)

      act(() => {
        world.channel.serverOpens()
        world.geo.fix(24.86, 67.05)
      })

      expect(JSON.parse(world.channel.sent[0])).toEqual({ lat: 24.86, lng: 67.05 })
      expect(within(screen.getByRole('region', { name: 'Share my live location' })).getByRole('status')).toHaveTextContent('Sharing your live location.')
    })

    it('turning it off stops the position watch and says Off', async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups', undefined, world.controller)
      await userEvent.click(await screen.findByRole('switch', { name: 'Share my live location' }))
      act(() => world.channel.serverOpens())

      await userEvent.click(screen.getByRole('switch', { name: 'Share my live location' }))

      expect(world.geo.watching).toHaveLength(0)
      expect(screen.getByRole('switch', { name: 'Share my live location' })).not.toBeChecked()
      expect(screen.getByText(/Off\. Nobody can see where you are/)).toBeInTheDocument()
    })

    it('says so, and switches itself off, when the browser refuses the position', async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups', undefined, world.controller)
      await userEvent.click(await screen.findByRole('switch', { name: 'Share my live location' }))

      act(() => world.geo.fail(1))

      expect(await screen.findByText(/Your browser blocked location access/)).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: 'Share my live location' })).not.toBeChecked()
    })

    it("marks a connected member who is sharing as Live on their row — and only them", async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups', undefined, world.controller)
      await screen.findByText('Amna Khan')
      expect(screen.queryByText('Live')).not.toBeInTheDocument()

      act(() => {
        world.channel.serverOpens()
        world.channel.serverSends(frame('someone-else-entirely'))
      })
      expect(screen.queryByText('Live')).not.toBeInTheDocument()

      act(() => world.channel.serverSends(frame(AMNA)))
      expect(await screen.findByText('Live')).toBeInTheDocument()
    })
  })

  describe('a member', () => {
    it("shows that they aren't sharing until a position arrives, then shows it on the map as Live with the coordinates", async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups/c', undefined, world.controller)

      expect(await screen.findByText("Amna Khan isn't sharing right now")).toBeInTheDocument()
      expect(world.channel.opens).toBe(1)
      expect(screen.queryByTestId('member-map')).not.toBeInTheDocument()

      act(() => {
        world.channel.serverOpens()
        world.channel.serverSends(frame(AMNA, 24.86, 67.05))
      })

      expect(await screen.findByTestId('member-map')).toHaveTextContent('24.86,67.05')
      expect(screen.getByTestId('member-map')).toHaveAttribute('data-live', 'true')
      expect(screen.getByRole('group', { name: 'Map showing where Amna Khan is' })).toBeInTheDocument()
      expect(screen.getByText('24.8600, 67.0500')).toBeInTheDocument()
    })

    it("follows the member as they move, and ignores everyone else's pings", async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups/c', undefined, world.controller)
      await screen.findByText("Amna Khan isn't sharing right now")

      act(() => {
        world.channel.serverOpens()
        world.channel.serverSends(frame(AMNA, 24.86, 67.05))
        world.channel.serverSends(frame('a-stranger', 1, 1))
        world.channel.serverSends(frame(AMNA, 24.9, 67.1))
      })

      expect(await screen.findByTestId('member-map')).toHaveTextContent('24.9,67.1')
    })

    it('offers the same share switch here, on the one shared controller — turning it on here is turning it on everywhere', async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups/c', undefined, world.controller)

      await userEvent.click(await screen.findByRole('switch', { name: 'Share my live location' }))

      expect(world.controller.getSnapshot().sharing).toBe(true)
      expect(world.geo.watching).toHaveLength(1)
    })

    it("opening a member from the list keeps the socket and what it has heard — their page opens on where they are, with no reconnect", async () => {
      world.controller.dispose()
      world = fakeLiveLocation({ idleCloseMs: 1000 })
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups', undefined, world.controller)
      await screen.findByText('Amna Khan')
      act(() => {
        world.channel.serverOpens()
        world.channel.serverSends(frame(AMNA, 24.86, 67.05))
      })
      expect(await screen.findByText('Live')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('link', { name: /Amna Khan/ }))

      expect(await screen.findByTestId('member-map')).toHaveTextContent('24.86,67.05') // straight away, without waiting for the next ping
      expect(world.channel.opens).toBe(1)
      expect(world.channel.closes).toBe(0)
    })

    it('has no live location, no share card and no socket for a member who is not connected yet', async () => {
      serveConnections([outgoing({ id: 'o' })])
      renderSafetyGroups('/app/safety-groups/o', undefined, world.controller)

      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('region', { name: 'Live location' })).not.toBeInTheDocument()
      expect(screen.queryByRole('switch', { name: 'Share my live location' })).not.toBeInTheDocument()
      expect(world.channel.opens).toBe(0)
    })

    it('closes the socket when the member is removed and nobody else is being listened for', async () => {
      serveConnections([connected({ id: 'c' })])
      renderSafetyGroups('/app/safety-groups/c', undefined, world.controller)
      await screen.findByText("Amna Khan isn't sharing right now")
      expect(world.channel.opens).toBe(1)

      await userEvent.click(screen.getByRole('button', { name: 'Remove member' }))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove member' }))

      await screen.findByRole('heading', { level: 1, name: 'Safety Groups' })
      await waitFor(() => expect(world.channel.closes).toBeGreaterThan(0)) // after the short grace period
      expect(world.controller.getSnapshot().channel).toBe('idle')
    })
  })

  it('renders as before, with no live-location provider at all (an inert default)', async () => {
    serveConnections([connected({ id: 'c' })])
    renderSafetyGroups('/app/safety-groups')

    expect(await screen.findByText('Amna Khan')).toBeInTheDocument()
    expect(ME).toBeTruthy()
  })
})

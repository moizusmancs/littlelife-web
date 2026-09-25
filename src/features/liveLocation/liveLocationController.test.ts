import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveLocationController, type ControllerDeps, type LiveLocationController } from './liveLocationController'
import { FakeChannel, FakeGeolocation } from './testKit'
import { HEARTBEAT_MS, MIN_SEND_MS } from './liveLocationModel'
import { IDLE_CLOSE_MS } from './liveLocationController'

let channel: FakeChannel
let geo: FakeGeolocation
let controller: LiveLocationController
let clock: number

function make(overrides: Partial<ControllerDeps> = {}) {
  controller = createLiveLocationController({
    createSocket: (handlers) => {
      channel.handlers = handlers
      return channel.asSocket()
    },
    geolocation: () => geo as unknown as Geolocation,
    classify: async () => 'other',
    now: () => clock,
    ...overrides,
  })
  return controller
}

const snap = () => controller.getSnapshot()
const pings = () => channel.sent.map((s) => JSON.parse(s))

describe('LiveLocationController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    channel = new FakeChannel()
    geo = new FakeGeolocation()
    clock = 1_000_000
    make()
  })
  afterEach(() => {
    controller.dispose()
    vi.useRealTimers()
  })

  describe('listening (watching for members)', () => {
    it('does nothing until something wants it — no socket for a page that does not need one', () => {
      expect(channel.opens).toBe(0)
      expect(snap().channel).toBe('idle')
    })

    it('opens the socket while a screen is watching, and closes it — dropping what it heard — a moment after the last one leaves', () => {
      const stop = controller.addWatcher()
      expect(channel.opens).toBe(1)
      channel.serverOpens()
      expect(snap().channel).toBe('live')
      channel.serverSends({ account_id: 'm1', lat: 24.86, lng: 67.05, recorded_at: 't' })
      expect(Object.keys(snap().positions)).toEqual(['m1'])

      stop()
      expect(channel.closes).toBe(0) // not yet: another screen may be about to take over
      vi.advanceTimersByTime(IDLE_CLOSE_MS)

      expect(channel.closes).toBe(1)
      expect(snap().channel).toBe('idle')
      expect(snap().positions).toEqual({})
    })

    it('keeps the socket — and everything it has heard — across a hand-over between screens (the list to a member\'s page)', () => {
      const list = controller.addWatcher()
      channel.serverOpens()
      channel.serverSends({ account_id: 'm1', lat: 24.86, lng: 67.05, recorded_at: 't' })

      list() // the list unmounts…
      const detail = controller.addWatcher() // …and the member's page mounts a moment later
      vi.advanceTimersByTime(IDLE_CLOSE_MS * 2)

      expect(channel.opens).toBe(1)
      expect(channel.closes).toBe(0)
      expect(snap().channel).toBe('live')
      expect(snap().positions.m1).toBeDefined()
      detail()
    })

    it('keeps one socket for several watchers, closing it only when the last one has gone', () => {
      const a = controller.addWatcher()
      const b = controller.addWatcher()
      expect(channel.opens).toBe(1)
      a()
      vi.advanceTimersByTime(IDLE_CLOSE_MS)
      expect(channel.closes).toBe(0)
      b()
      vi.advanceTimersByTime(IDLE_CLOSE_MS)
      expect(channel.closes).toBe(1)
    })

    it('a second screen that comes and goes within the grace period does not restart the countdown twice', () => {
      const a = controller.addWatcher()
      a()
      const b = controller.addWatcher()
      b()
      vi.advanceTimersByTime(IDLE_CLOSE_MS)
      expect(channel.closes).toBe(1)
      expect(channel.opens).toBe(1)
    })

    it('a watcher removed twice is only removed once', () => {
      const a = controller.addWatcher()
      const b = controller.addWatcher()
      a()
      a()
      vi.advanceTimersByTime(IDLE_CLOSE_MS)
      expect(channel.closes).toBe(0)
      b()
    })

    it("remembers each member's latest position with the time this browser heard it, and keeps them apart", () => {
      controller.addWatcher()
      channel.serverOpens()
      channel.serverSends({ account_id: 'm1', lat: 1, lng: 2, recorded_at: 'a' })
      clock += 4000
      channel.serverSends({ account_id: 'm2', lat: 3, lng: 4, recorded_at: 'b' })
      channel.serverSends({ account_id: 'm1', lat: 5, lng: 6, recorded_at: 'c' })

      expect(snap().positions.m1).toEqual({ lat: 5, lng: 6, recordedAt: 'c', receivedAt: 1_004_000 })
      expect(snap().positions.m2).toMatchObject({ lat: 3, lng: 4 })
    })

    it('ignores anything that is not a valid position frame', () => {
      controller.addWatcher()
      channel.serverOpens()
      channel.serverSends('garbage')
      channel.serverSends({ account_id: 'm1', lat: 999, lng: 0, recorded_at: 't' })
      expect(snap().positions).toEqual({})
    })

    it('reports connecting, reconnecting and live as the socket does, and keeps the last positions through a reconnect', () => {
      controller.addWatcher()
      expect(snap().channel).toBe('connecting')
      channel.serverOpens()
      channel.serverSends({ account_id: 'm1', lat: 1, lng: 2, recorded_at: 't' })
      channel.serverDrops()
      expect(snap().channel).toBe('reconnecting')
      expect(snap().positions.m1).toBeDefined()
      channel.serverOpens()
      expect(snap().channel).toBe('live')
    })
  })

  describe('sharing', () => {
    it('asks the browser for the position, opens the socket, and sends a fix once it is open', () => {
      controller.startSharing()
      expect(snap()).toMatchObject({ sharing: true, fix: 'locating', channel: 'connecting' })
      expect(geo.watching).toHaveLength(1)

      channel.serverOpens()
      geo.fix(24.86, 67.05)

      expect(snap().fix).toBe('active')
      expect(pings()).toEqual([{ lat: 24.86, lng: 67.05 }])
    })

    it('sends a fix that arrived before the socket opened, the moment it opens — and never queues more than the latest', () => {
      controller.startSharing()
      geo.fix(1, 2)
      clock += 3000
      geo.fix(3, 4) // socket still connecting: both are dropped, only the latest is kept
      channel.serverOpens()

      expect(pings()).toEqual([{ lat: 3, lng: 4 }])
    })

    it('sends at most one fix every MIN_SEND_MS however often the browser reports — and the newest one goes out when the window ends, not at the next heartbeat', () => {
      controller.dispose()
      make({ now: () => Date.now() }) // time here is the fake timers' own, so the trailing send and the clock agree
      controller.startSharing()
      channel.serverOpens()

      geo.fix(1, 1)
      vi.advanceTimersByTime(500)
      geo.fix(2, 2)
      vi.advanceTimersByTime(500)
      geo.fix(3, 3) // three fixes inside one window
      expect(pings()).toEqual([{ lat: 1, lng: 1 }])

      vi.advanceTimersByTime(MIN_SEND_MS - 1000)
      expect(pings()).toEqual([{ lat: 1, lng: 1 }, { lat: 3, lng: 3 }]) // the middle one was never sent
      vi.advanceTimersByTime(MIN_SEND_MS)
      expect(pings()).toHaveLength(2) // and no extra send after
    })

    it('re-sends the last fix every heartbeat even if the person has not moved — a viewer who connects late has no snapshot to read', () => {
      controller.startSharing()
      channel.serverOpens()
      geo.fix(24.86, 67.05)
      expect(pings()).toHaveLength(1)

      vi.advanceTimersByTime(HEARTBEAT_MS)
      vi.advanceTimersByTime(HEARTBEAT_MS)

      expect(pings()).toEqual(Array(3).fill({ lat: 24.86, lng: 67.05 }))
    })

    it('sends nothing until there is a fix, and nothing when sharing is off', () => {
      controller.startSharing()
      channel.serverOpens()
      vi.advanceTimersByTime(HEARTBEAT_MS)
      expect(pings()).toEqual([])

      geo.fix(1, 2)
      controller.stopSharing()
      channel.serverOpens()
      vi.advanceTimersByTime(HEARTBEAT_MS * 2)
      expect(pings()).toHaveLength(1)
    })

    it('stops watching the position at once, and closes the socket a moment later if nobody is listening, when sharing is turned off', () => {
      controller.startSharing()
      channel.serverOpens()
      controller.stopSharing()

      expect(geo.watching).toHaveLength(0)
      expect(geo.cleared).toEqual([1])
      expect(snap()).toMatchObject({ sharing: false, fix: 'idle' })
      vi.advanceTimersByTime(IDLE_CLOSE_MS)
      expect(channel.closes).toBe(1)
      expect(snap().channel).toBe('idle')
    })

    it('keeps the socket open for a watching screen when sharing is turned off', () => {
      controller.addWatcher()
      controller.startSharing()
      channel.serverOpens()
      controller.stopSharing()

      expect(channel.closes).toBe(0)
      expect(snap().channel).toBe('live')
    })

    it('switches sharing off, with a reason, when the browser refuses the position', () => {
      controller.startSharing()
      geo.fail(1) // PERMISSION_DENIED

      expect(snap()).toMatchObject({ sharing: false, fix: 'denied' })
      expect(geo.watching).toHaveLength(0)
      vi.advanceTimersByTime(IDLE_CLOSE_MS)
      expect(channel.closes).toBe(1)
    })

    it('carries on, marked unavailable, when the position merely cannot be found right now — and recovers on the next fix', () => {
      controller.startSharing()
      channel.serverOpens()
      geo.fail(2) // POSITION_UNAVAILABLE
      expect(snap()).toMatchObject({ sharing: true, fix: 'unavailable' })
      expect(geo.watching).toHaveLength(1)

      geo.fix(1, 2)
      expect(snap().fix).toBe('active')
    })

    it('cannot share where the browser has no geolocation, and says so without turning anything on', () => {
      controller.dispose()
      make({ geolocation: () => null })

      controller.startSharing()

      expect(snap()).toMatchObject({ sharing: false, fix: 'unsupported' })
      expect(channel.opens).toBe(0)
    })

    it('starting twice does not watch twice', () => {
      controller.startSharing()
      controller.startSharing()
      expect(geo.watching).toHaveLength(1)
    })
  })

  describe('a tab in the background', () => {
    it('closes the socket, stops watching the position and heartbeats, and forgets the last fix — and sharing stays switched on', () => {
      controller.startSharing()
      channel.serverOpens()
      geo.fix(1, 2)

      controller.setVisible(false)

      expect(snap()).toMatchObject({ visible: false, sharing: true, channel: 'idle' })
      expect(geo.watching).toHaveLength(0)
      expect(channel.closes).toBe(1)
      vi.advanceTimersByTime(HEARTBEAT_MS * 3)
      expect(pings()).toHaveLength(1)
    })

    it('lets go of the socket at once — no grace period — when the tab goes to the background, even for a watching screen', () => {
      controller.addWatcher()
      channel.serverOpens()

      controller.setVisible(false)

      expect(channel.closes).toBe(1) // immediately: a hidden tab holding a socket would make the visible one deaf
      expect(snap().channel).toBe('idle')
    })

    it('drops a held-back send when the tab goes to the background, so nothing goes out from a hidden tab', () => {
      controller.dispose()
      make({ now: () => Date.now() })
      controller.startSharing()
      channel.serverOpens()
      geo.fix(1, 1)
      vi.advanceTimersByTime(500)
      geo.fix(2, 2) // held for the trailing send

      controller.setVisible(false)
      vi.advanceTimersByTime(MIN_SEND_MS * 2)

      expect(pings()).toEqual([{ lat: 1, lng: 1 }])
    })

    it('resumes when the tab comes back: a new watch, a new socket, and no replay of the stale fix', () => {
      controller.startSharing()
      channel.serverOpens()
      geo.fix(1, 2)
      controller.setVisible(false)

      controller.setVisible(true)
      expect(geo.watching).toHaveLength(1)
      expect(channel.opens).toBe(2)
      channel.serverOpens()
      expect(pings()).toHaveLength(1) // only the first fix so far: nothing stale re-sent on reopening

      geo.fix(5, 6)
      expect(pings().at(-1)).toEqual({ lat: 5, lng: 6 })
    })

    it('holds no socket for a watching screen while hidden, and reopens it on return', () => {
      controller.addWatcher()
      controller.setVisible(false)
      expect(channel.closes).toBe(1)
      controller.setVisible(true)
      expect(channel.opens).toBe(2)
    })

    it('is not visible-to-hidden churn when nothing changed', () => {
      controller.addWatcher()
      controller.setVisible(true)
      expect(channel.opens).toBe(1)
    })

    it('starts hidden if the page did', () => {
      controller.dispose()
      make({ initialVisible: false })
      controller.addWatcher()
      expect(channel.opens).toBe(0)
    })
  })

  describe('when the channel is refused', () => {
    it.each([['unauthorized'], ['not-allowed']] as const)('%s: stops retrying, says why, and shows blocked', async (why) => {
      controller.dispose()
      make({ classify: async () => why })
      controller.addWatcher()

      await expect(channel.handlers.onFailure()).resolves.toBe('stop')
      channel.handlers.onStatus('closed')

      expect(snap()).toMatchObject({ channel: 'blocked', blocked: why })
    })

    it('anything else is worth another try', async () => {
      controller.addWatcher()
      await expect(channel.handlers.onFailure()).resolves.toBe('retry')
      expect(snap().blocked).toBeNull()
    })

    it('does not reopen by itself while blocked, but retry() does', async () => {
      controller.dispose()
      make({ classify: async () => 'not-allowed' })
      controller.addWatcher()
      await channel.handlers.onFailure()
      channel.statusValue = 'closed' // what the real socket is after answering "stop"
      channel.handlers.onStatus('closed')
      controller.addWatcher() // another screen asks; still blocked
      expect(channel.opens).toBe(1)

      controller.retry()

      expect(channel.opens).toBe(2)
      expect(snap().blocked).toBeNull()
    })
  })

  it('subscribers hear every change, and stop hearing after they unsubscribe', () => {
    const listener = vi.fn()
    const off = controller.subscribe(listener)
    controller.startSharing()
    expect(listener).toHaveBeenCalled()
    listener.mockClear()
    off()
    geo.fix(1, 2)
    expect(listener).not.toHaveBeenCalled()
  })

  it('dispose closes everything', () => {
    controller.addWatcher()
    controller.startSharing()
    channel.serverOpens()
    controller.dispose()

    expect(geo.watching).toHaveLength(0)
    expect(channel.closes).toBeGreaterThan(0)
  })
})

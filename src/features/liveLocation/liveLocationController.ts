import { createReconnectingSocket, type ReconnectingSocket, type SocketStatus } from '@/lib/reconnectingSocket'
import { classifyRejection, currentLocationSocketUrl, type Rejection } from './locationChannel'
import { HEARTBEAT_MS, MIN_SEND_MS, parseRelay, pingFrame, type LivePosition } from './liveLocationModel'

export type ChannelState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'blocked'
/** Why the channel won't open and waiting won't help. */
export type BlockReason = 'unauthorized' | 'not-allowed'
/** The browser's answer to "where are you" while sharing. */
export type FixState = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable' | 'unsupported'

export interface LiveLocationSnapshot {
  channel: ChannelState
  blocked: BlockReason | null
  /** The person has turned sharing on (and not off). Sharing can be on but paused — see `visible`. */
  sharing: boolean
  /** Whether this tab is in front. Sharing and listening both stop while it isn't. */
  visible: boolean
  fix: FixState
  /** The last position heard from each member (by account id) since the channel was opened. */
  positions: Readonly<Record<string, LivePosition>>
}

export interface LiveLocationController {
  getSnapshot: () => LiveLocationSnapshot
  subscribe: (listener: () => void) => () => void
  /** Turn sharing on: asks the browser for the person's position and sends it to everyone they're connected to. */
  startSharing: () => void
  stopSharing: () => void
  /** A screen that wants to *see* members' positions says so for as long as it's on screen; returns how to stop. */
  addWatcher: () => () => void
  /** The tab came to the front or went to the back. */
  setVisible: (visible: boolean) => void
  /** Try again after a blocked channel. */
  retry: () => void
  dispose: () => void
}

export interface ControllerDeps {
  createSocket?: (handlers: { onMessage: (data: string) => void; onStatus: (status: SocketStatus) => void; onFailure: () => Promise<'retry' | 'stop'> }) => ReconnectingSocket
  geolocation?: () => Geolocation | null
  classify?: (url: string) => Promise<Rejection>
  now?: () => number
  initialVisible?: boolean
  /** How long the socket is kept once nothing wants it, in case another screen takes over (see `IDLE_CLOSE_MS`). */
  idleCloseMs?: number
}

/**
 * Moving from the Safety Groups list to a member's page unmounts one watcher and mounts another a moment later. Closing the socket in that gap
 * would drop it, throw away the positions already heard (so the member's page would open on "isn't sharing" for up to a heartbeat) and reconnect
 * straight away — and React's dev double-mount would do the same on every load. So a socket nothing wants is kept for this long first. A tab that goes to the
 * *background* is not given the grace: it must let go at once (the backend keeps one connection per account, so a hidden tab holding one would make the visible one deaf).
 */
export const IDLE_CLOSE_MS = 3000

const EMPTY: Readonly<Record<string, LivePosition>> = {}

/**
 * The state machine behind live location, kept out of React so it can be driven with a fake socket, fake geolocation and fake timers.
 *
 * **When the socket is open.** Only while the tab is in front **and** either the person is sharing or a screen is watching for members
 * (`addWatcher`), and a moment longer once nothing wants it (`IDLE_CLOSE_MS`) so a hand-over between screens doesn't reconnect. Both rules come from the backend, not taste: it keeps *one connection per account*, last one wins, so a second tab would
 * silently make the first deaf — a hidden tab holding no socket can't do that, and it is also all the browser lets a web page do (there is no
 * background location on the web). When the socket isn't wanted it is closed and the positions heard are dropped.
 *
 * **Sharing** asks the browser to *watch* the position, sends `{lat, lng}` on a fix (at most one every `MIN_SEND_MS` — a fix that comes sooner is held and the
 * *latest* one goes out when the window ends), and re-sends the last fix every
 * `HEARTBEAT_MS` so a viewer who connects late — the relay has no snapshot — still hears it. It goes to **everyone the person is connected to**: the
 * relay has no per-person targeting. A fix is never queued: frames go out only over an open socket, and a fix older than the last pause is dropped
 * rather than replayed. If the browser refuses (`denied`) sharing switches itself off.
 */
export function createLiveLocationController(deps: ControllerDeps = {}): LiveLocationController {
  const now = deps.now ?? Date.now
  const geo = deps.geolocation ?? (() => (typeof navigator !== 'undefined' ? navigator.geolocation ?? null : null))
  const classify = deps.classify ?? classifyRejection
  const idleCloseMs = deps.idleCloseMs ?? IDLE_CLOSE_MS

  let snapshot: LiveLocationSnapshot = {
    channel: 'idle',
    blocked: null,
    sharing: false,
    visible: deps.initialVisible ?? true,
    fix: 'idle',
    positions: EMPTY,
  }
  const listeners = new Set<() => void>()
  let watchers = 0
  let watchId: number | null = null
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let lastFix: { lat: number; lng: number } | null = null
  let lastSentAt = 0
  /** A send waiting for the throttle window to end, so the newest fix isn't left for the next heartbeat. */
  let trailing: ReturnType<typeof setTimeout> | undefined
  let idleClose: ReturnType<typeof setTimeout> | undefined
  let lastUrl = ''

  const set = (patch: Partial<LiveLocationSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    listeners.forEach((listener) => listener())
  }

  const handleStatus = (status: SocketStatus) => {
    if (status === 'connecting') set({ channel: 'connecting', blocked: null })
    else if (status === 'open') {
      set({ channel: 'live' })
      sendFix() // whoever is listening now gets the position straight away
    } else if (status === 'reconnecting') set({ channel: 'reconnecting' })
    else if (status === 'closed') set({ channel: snapshot.blocked ? 'blocked' : 'idle' })
  }

  const socket = (deps.createSocket ?? ((handlers) =>
    createReconnectingSocket({
      getUrl: async () => (lastUrl = await currentLocationSocketUrl()),
      onMessage: handlers.onMessage,
      onStatus: handlers.onStatus,
      onFailure: handlers.onFailure,
    })))({
    onMessage: (data) => {
      const frame = parseRelay(data)
      if (!frame) return
      set({ positions: { ...snapshot.positions, [frame.accountId]: { lat: frame.lat, lng: frame.lng, recordedAt: frame.recordedAt, receivedAt: now() } } })
    },
    onStatus: handleStatus,
    onFailure: async () => {
      const why = await classify(lastUrl)
      if (why === 'unauthorized' || why === 'not-allowed') {
        set({ blocked: why })
        return 'stop'
      }
      return 'retry'
    },
  })

  const wanted = () => snapshot.visible && (snapshot.sharing || watchers > 0)

  function sendFix() {
    if (!snapshot.sharing || !snapshot.visible || !lastFix) return
    if (socket.send(pingFrame(lastFix.lat, lastFix.lng))) lastSentAt = now()
  }

  function startWatching() {
    if (watchId !== null) return
    const g = geo()
    if (!g) return
    watchId = g.watchPosition(
      (position) => {
        lastFix = { lat: position.coords.latitude, lng: position.coords.longitude }
        if (snapshot.fix !== 'active') set({ fix: 'active' })
        const since = now() - lastSentAt
        if (since >= MIN_SEND_MS) sendFix()
        else if (trailing === undefined) {
          // Too soon after the last one: send the *latest* fix (not this one) when the window ends.
          trailing = setTimeout(() => {
            trailing = undefined
            sendFix()
          }, MIN_SEND_MS - since)
        }
      },
      (error) => {
        if (error.code === 1) {
          // PERMISSION_DENIED: the browser said no, and nothing will change that without the person. Switch sharing off rather than pretend.
          stopWatching()
          lastFix = null
          set({ sharing: false, fix: 'denied' })
          sync()
        } else set({ fix: 'unavailable' })
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    )
    heartbeat = setInterval(sendFix, HEARTBEAT_MS)
  }

  function stopWatching() {
    if (watchId !== null) geo()?.clearWatch(watchId)
    watchId = null
    clearInterval(heartbeat)
    heartbeat = undefined
    clearTimeout(trailing)
    trailing = undefined
  }

  function closeNow() {
    clearTimeout(idleClose)
    idleClose = undefined
    socket.close()
    set({ channel: 'idle', blocked: null, positions: EMPTY })
  }

  /** Brings the socket and the position watch in line with what is wanted right now. */
  function sync() {
    if (wanted()) {
      clearTimeout(idleClose) // another screen took over within the grace period: keep the socket, and what it has heard
      idleClose = undefined
      if (snapshot.blocked === null && socket.status() !== 'open' && socket.status() !== 'connecting' && socket.status() !== 'reconnecting') socket.open()
    } else if (!snapshot.visible) {
      closeNow() // a background tab lets go at once
    } else if (idleClose === undefined && socket.status() !== 'closed' && socket.status() !== 'idle') {
      idleClose = setTimeout(() => {
        idleClose = undefined
        if (!wanted()) closeNow()
      }, idleCloseMs)
    } else if (socket.status() === 'closed' || socket.status() === 'idle') {
      set({ channel: snapshot.blocked ? 'blocked' : 'idle', positions: EMPTY })
    }

    if (snapshot.sharing && snapshot.visible) startWatching()
    else {
      stopWatching()
      lastFix = null // a fix from before a pause is not where the person is now
      lastSentAt = 0 // and the first fix after it goes out at once, not after the old throttle
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    startSharing() {
      if (snapshot.sharing) return
      if (!geo()) {
        set({ fix: 'unsupported' })
        return
      }
      set({ sharing: true, fix: 'locating', blocked: null })
      sync()
    },
    stopSharing() {
      if (!snapshot.sharing && snapshot.fix === 'idle') return
      set({ sharing: false, fix: 'idle' })
      sync()
    },
    addWatcher() {
      watchers += 1
      sync()
      let removed = false
      return () => {
        if (removed) return
        removed = true
        watchers -= 1
        sync()
      }
    },
    setVisible(visible) {
      if (snapshot.visible === visible) return
      set({ visible })
      sync()
    },
    retry() {
      set({ blocked: null })
      sync()
    },
    dispose() {
      watchers = 0
      stopWatching()
      clearTimeout(idleClose)
      idleClose = undefined
      socket.close()
      listeners.clear()
    },
  }
}

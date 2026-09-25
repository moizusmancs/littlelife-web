/**
 * A WebSocket that keeps itself connected: it opens, and when the connection drops or an attempt fails it tries again after a growing
 * pause (1 s, 2 s, 4 s … capped at 30 s, each with a little jitter so a lot of clients dropped together don't all come back on the same tick).
 * The first real-time piece in the app — the pattern Phase 7's chat and navigation reuse — so it knows nothing about locations.
 *
 * - **The URL is asked for on every attempt** (`getUrl`), not once: a token in the query string goes stale, and a reconnect an hour later
 *   must not reuse the first one. A `getUrl` that throws counts as a failed attempt.
 * - **Backoff resets only once a connection has held** for `stableMs`, so a server that accepts and immediately hangs up doesn't get hammered
 *   once a second forever, and a connection that did its job for a while starts over from the short pause.
 * - **A browser gives no reason for a failed handshake** (the `error` event is bare, the close code is 1006 whatever went wrong), so before
 *   retrying an attempt that never opened the caller is asked (`onFailure`) whether it is worth trying again — a rejected token or a
 *   refused gate won't change by waiting — and can answer `'stop'`.
 * - **`close()` is final** and safe from anywhere: it cancels the pending retry and ignores anything the old socket still says.
 *   To use it again, call `open()`.
 * - **`send` never queues**: it returns whether the frame went out. A stale queue replayed on reconnect would be old positions or old chat.
 */
export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface BackoffOptions {
  baseMs: number
  maxMs: number
  factor: number
  /** ± this fraction of the delay, e.g. 0.2 for ±20%. */
  jitter: number
  /** How long a connection must stay open before the next drop starts the backoff over. */
  stableMs: number
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1000, maxMs: 30_000, factor: 2, jitter: 0.2, stableMs: 5000 }

export interface ReconnectingSocketOptions {
  getUrl: () => Promise<string> | string
  onMessage: (data: string) => void
  onStatus?: (status: SocketStatus) => void
  /** An attempt failed before it opened (or `getUrl` threw). Answer `'stop'` to give up; anything else, or nothing, retries. */
  onFailure?: (info: { attempt: number; error?: unknown }) => Promise<'retry' | 'stop' | void> | 'retry' | 'stop' | void
  backoff?: Partial<BackoffOptions>
  /** Injected for tests. */
  WebSocketImpl?: typeof WebSocket
  random?: () => number
}

export interface ReconnectingSocket {
  open: () => void
  close: () => void
  send: (data: string) => boolean
  status: () => SocketStatus
}

/** The pause before attempt number `attempt` (1-based): `base × factor^(attempt-1)`, capped, then jittered. */
export function backoffDelay(attempt: number, options: BackoffOptions, random: () => number = Math.random): number {
  const raw = Math.min(options.maxMs, options.baseMs * options.factor ** Math.max(0, attempt - 1))
  const spread = raw * options.jitter
  return Math.max(0, Math.round(raw - spread + random() * 2 * spread))
}

export function createReconnectingSocket(options: ReconnectingSocketOptions): ReconnectingSocket {
  const backoff = { ...DEFAULT_BACKOFF, ...options.backoff }
  const Impl = options.WebSocketImpl ?? WebSocket
  const random = options.random ?? Math.random

  let status: SocketStatus = 'idle'
  let socket: WebSocket | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let stableTimer: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  /** Bumped by every attempt and by `close()`, so an event from a socket that is no longer the current one is recognised and dropped. */
  let epoch = 0

  const setStatus = (next: SocketStatus) => {
    if (status === next) return
    status = next
    options.onStatus?.(next)
  }

  const clearTimers = () => {
    clearTimeout(retryTimer)
    clearTimeout(stableTimer)
    retryTimer = undefined
    stableTimer = undefined
  }

  async function connect() {
    const mine = ++epoch
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting')

    let url: string
    try {
      url = await options.getUrl()
    } catch (error) {
      if (mine === epoch) void failed(mine, error)
      return
    }
    if (mine !== epoch) return

    let opened = false
    const ws = new Impl(url)
    socket = ws

    ws.onopen = () => {
      if (mine !== epoch) return
      opened = true
      setStatus('open')
      stableTimer = setTimeout(() => {
        attempt = 0
      }, backoff.stableMs)
    }
    ws.onmessage = (event) => {
      if (mine === epoch) options.onMessage(String(event.data))
    }
    ws.onerror = () => {
      // A bare event with no reason — the close that follows is what triggers the retry.
    }
    ws.onclose = () => {
      if (mine !== epoch) return
      socket = null
      clearTimeout(stableTimer)
      stableTimer = undefined
      if (opened) {
        // A connection that dropped before it had held counts against the backoff like a failed attempt; one that had held started over from 0.
        attempt += 1
        schedule()
      } else void failed(mine)
    }
  }

  async function failed(mine: number, error?: unknown) {
    attempt += 1
    let verdict: 'retry' | 'stop' | void
    try {
      verdict = await options.onFailure?.({ attempt, error })
    } catch {
      verdict = 'retry' // a probe that itself failed says nothing — keep trying
    }
    if (mine !== epoch) return
    if (verdict === 'stop') {
      socket = null
      setStatus('closed')
      return
    }
    schedule()
  }

  function schedule() {
    setStatus('reconnecting')
    retryTimer = setTimeout(() => void connect(), backoffDelay(attempt, backoff, random))
  }

  return {
    open() {
      if (status === 'connecting' || status === 'open' || status === 'reconnecting') return
      attempt = 0
      void connect()
    },
    close() {
      epoch += 1
      clearTimers()
      const ws = socket
      socket = null
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
        ws.close()
      }
      setStatus('closed')
    },
    send(data) {
      if (!socket || socket.readyState !== 1) return false
      socket.send(data)
      return true
    },
    status: () => status,
  }
}

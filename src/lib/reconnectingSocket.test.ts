import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backoffDelay, createReconnectingSocket, DEFAULT_BACKOFF, type SocketStatus } from './reconnectingSocket'

/** A stand-in for the browser's WebSocket that the test drives by hand. */
class FakeSocket {
  static instances: FakeSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  closedByClient = false
  url: string
  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closedByClient = true
    this.readyState = 3
  }
  // — the test's side —
  serverOpens() {
    this.readyState = 1
    this.onopen?.()
  }
  serverSends(data: unknown) {
    this.onmessage?.({ data })
  }
  serverDrops() {
    this.readyState = 3
    this.onerror?.()
    this.onclose?.()
  }
  failsToOpen() {
    this.readyState = 3
    this.onerror?.()
    this.onclose?.()
  }
}

const last = () => FakeSocket.instances[FakeSocket.instances.length - 1]

function setup(overrides: Partial<Parameters<typeof createReconnectingSocket>[0]> = {}) {
  const statuses: SocketStatus[] = []
  const messages: string[] = []
  const socket = createReconnectingSocket({
    getUrl: () => `ws://x/${FakeSocket.instances.length}`,
    onMessage: (data) => messages.push(data),
    onStatus: (s) => statuses.push(s),
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    random: () => 0.5, // no jitter: the midpoint
    ...overrides,
  })
  return { socket, statuses, messages }
}

/** Lets pending promises (an awaited `getUrl`, an awaited `onFailure`) settle. */
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0)
}

describe('backoffDelay', () => {
  it('doubles from the base and stops at the cap', () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => backoffDelay(n, { ...DEFAULT_BACKOFF, jitter: 0 }))
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000])
  })

  it('spreads by the jitter fraction either side, and never goes negative', () => {
    const options = { ...DEFAULT_BACKOFF, jitter: 0.2 }
    expect(backoffDelay(1, options, () => 0)).toBe(800)
    expect(backoffDelay(1, options, () => 1)).toBe(1200)
    expect(backoffDelay(1, { ...options, jitter: 5 }, () => 0)).toBe(0)
  })
})

describe('createReconnectingSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
  })
  afterEach(() => vi.useRealTimers())

  it('connects, reports connecting then open, and hands messages up', async () => {
    const { socket, statuses, messages } = setup()

    socket.open()
    await flush()
    expect(statuses).toEqual(['connecting'])
    last().serverOpens()
    last().serverSends('{"a":1}')

    expect(statuses).toEqual(['connecting', 'open'])
    expect(messages).toEqual(['{"a":1}'])
    expect(socket.status()).toBe('open')
  })

  it('sends only while open, and never queues what it could not send', async () => {
    const { socket } = setup()

    expect(socket.send('early')).toBe(false) // never opened
    socket.open()
    await flush()
    expect(socket.send('still connecting')).toBe(false)
    last().serverOpens()
    expect(socket.send('now')).toBe(true)
    last().serverDrops()
    expect(socket.send('dropped')).toBe(false)

    expect(FakeSocket.instances[0].sent).toEqual(['now']) // nothing replayed later
    await vi.advanceTimersByTimeAsync(5000)
    last().serverOpens()
    expect(last().sent).toEqual([])
  })

  it('reconnects after the server drops it, with growing pauses that start over once a connection has held', async () => {
    const { socket, statuses } = setup()
    socket.open()
    await flush()
    last().serverOpens()
    last().serverDrops() // opened, then dropped at once — well short of stableMs
    expect(statuses.at(-1)).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(999)
    expect(FakeSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1) // 1 s: the first pause
    expect(FakeSocket.instances).toHaveLength(2)
    last().serverOpens()
    last().serverDrops() // and again without holding: the pause doubles
    await vi.advanceTimersByTimeAsync(1999)
    expect(FakeSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeSocket.instances).toHaveLength(3)

    last().serverOpens()
    await vi.advanceTimersByTimeAsync(5000) // this one holds
    last().serverDrops()
    await vi.advanceTimersByTimeAsync(1000) // back to the first pause
    expect(FakeSocket.instances).toHaveLength(4)
  })

  it('backs off across attempts that never open, up to the cap', async () => {
    const { socket } = setup()
    socket.open()
    await flush()

    const gaps: number[] = []
    for (let i = 0; i < 7; i++) {
      const before = FakeSocket.instances.length
      last().failsToOpen()
      await flush()
      let waited = 0
      while (FakeSocket.instances.length === before) {
        await vi.advanceTimersByTimeAsync(500)
        waited += 500
      }
      gaps.push(waited)
    }
    expect(gaps).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000])
  })

  it('asks for a fresh URL on every attempt — a reconnect must not reuse a stale token', async () => {
    let n = 0
    const { socket } = setup({ getUrl: () => `ws://x/?token=t${++n}` })

    socket.open()
    await flush()
    last().serverOpens()
    last().serverDrops()
    await vi.advanceTimersByTimeAsync(1000)

    expect(FakeSocket.instances.map((s) => s.url)).toEqual(['ws://x/?token=t1', 'ws://x/?token=t2'])
  })

  it('waits for an asynchronous getUrl, and treats one that throws as a failed attempt to retry', async () => {
    let calls = 0
    const onFailure = vi.fn()
    const { socket } = setup({
      getUrl: async () => {
        calls += 1
        if (calls === 1) throw new Error('token refresh failed')
        return 'ws://x/ok'
      },
      onFailure,
    })

    socket.open()
    await flush()
    expect(FakeSocket.instances).toHaveLength(0)
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, error: expect.any(Error) }))
    await vi.advanceTimersByTimeAsync(1000)
    await flush()

    expect(FakeSocket.instances.map((s) => s.url)).toEqual(['ws://x/ok'])
  })

  describe('failures before it opens', () => {
    it('asks the caller whether to keep trying, and stops when told to — a rejection that waiting will not fix', async () => {
      const onFailure = vi.fn().mockResolvedValue('stop')
      const { socket, statuses } = setup({ onFailure })
      socket.open()
      await flush()

      last().failsToOpen()
      await flush()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(onFailure).toHaveBeenCalledTimes(1)
      expect(FakeSocket.instances).toHaveLength(1) // never tried again
      expect(statuses.at(-1)).toBe('closed')
    })

    it('carries on when the caller says retry, or answers nothing, or throws', async () => {
      const answers: Array<() => unknown> = [() => 'retry', () => undefined, () => { throw new Error('probe failed') }]
      let i = 0
      const { socket } = setup({ onFailure: () => answers[i++ % 3]() as never })
      socket.open()
      await flush()

      for (let n = 1; n <= 3; n++) {
        last().failsToOpen()
        await flush()
        await vi.advanceTimersByTimeAsync(30_000)
        expect(FakeSocket.instances).toHaveLength(n + 1)
      }
    })

    it('does not consult the caller for a connection that opened and then dropped', async () => {
      const onFailure = vi.fn()
      const { socket } = setup({ onFailure })
      socket.open()
      await flush()
      last().serverOpens()
      last().serverDrops()

      expect(onFailure).not.toHaveBeenCalled()
    })
  })

  describe('close()', () => {
    it('closes the socket for good, cancels a pending retry, and reports closed', async () => {
      const { socket, statuses } = setup()
      socket.open()
      await flush()
      last().serverOpens()
      last().serverDrops()
      socket.close()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(FakeSocket.instances).toHaveLength(1)
      expect(statuses.at(-1)).toBe('closed')
    })

    it('closes an open socket and ignores anything it still says', async () => {
      const { socket, messages } = setup()
      socket.open()
      await flush()
      const ws = last()
      ws.serverOpens()
      socket.close()

      expect(ws.closedByClient).toBe(true)
      ws.serverSends('late')
      ws.onclose?.()
      expect(messages).toEqual([])
      await vi.advanceTimersByTimeAsync(60_000)
      expect(FakeSocket.instances).toHaveLength(1)
    })

    it('can be opened again afterwards, from the short pause', async () => {
      const { socket } = setup()
      socket.open()
      await flush()
      socket.close()
      socket.open()
      await flush()

      expect(FakeSocket.instances).toHaveLength(2)
      last().serverOpens()
      expect(socket.status()).toBe('open')
    })

    it('drops an attempt still waiting for its URL', async () => {
      let resolveUrl: (url: string) => void = () => undefined
      const { socket } = setup({ getUrl: () => new Promise<string>((resolve) => (resolveUrl = resolve)) })
      socket.open()
      socket.close()
      resolveUrl('ws://x/late')
      await flush()

      expect(FakeSocket.instances).toHaveLength(0)
    })

    it('is safe to call twice, and before anything was opened', () => {
      const { socket } = setup()
      expect(() => {
        socket.close()
        socket.close()
      }).not.toThrow()
    })
  })

  it('ignores a second open() while already connected or waiting to retry', async () => {
    const { socket } = setup()
    socket.open()
    socket.open()
    await flush()
    expect(FakeSocket.instances).toHaveLength(1)
    last().serverOpens()
    socket.open()
    expect(FakeSocket.instances).toHaveLength(1)
  })
})

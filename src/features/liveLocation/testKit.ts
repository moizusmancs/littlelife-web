import type { ReconnectingSocket, SocketStatus } from '@/lib/reconnectingSocket'
import { createLiveLocationController, type ControllerDeps, type LiveLocationController } from './liveLocationController'

/** A socket the test drives: open/close are recorded, `serverOpens` etc. push events into the controller's handlers. */
export class FakeChannel {
  statusValue: SocketStatus = 'idle'
  sent: string[] = []
  opens = 0
  closes = 0
  handlers!: Parameters<NonNullable<ControllerDeps['createSocket']>>[0]
  asSocket(): ReconnectingSocket {
    return {
      open: () => {
        this.opens += 1
        this.statusValue = 'connecting'
        this.handlers.onStatus('connecting')
      },
      close: () => {
        this.closes += 1
        this.statusValue = 'closed'
        this.handlers.onStatus('closed')
      },
      send: (data) => {
        if (this.statusValue !== 'open') return false
        this.sent.push(data)
        return true
      },
      status: () => this.statusValue,
    }
  }
  serverOpens() {
    this.statusValue = 'open'
    this.handlers.onStatus('open')
  }
  serverDrops() {
    this.statusValue = 'reconnecting'
    this.handlers.onStatus('reconnecting')
  }
  serverSends(frame: unknown) {
    this.handlers.onMessage(typeof frame === 'string' ? frame : JSON.stringify(frame))
  }
}

/** A stand-in for `navigator.geolocation` the test drives by hand. */
export class FakeGeolocation {
  watching: Array<{ id: number; ok: (p: { coords: { latitude: number; longitude: number } }) => void; err: (e: { code: number }) => void }> = []
  cleared: number[] = []
  next = 1
  watchPosition = (ok: never, err: never) => {
    const id = this.next++
    this.watching.push({ id, ok, err })
    return id
  }
  clearWatch = (id: number) => {
    this.cleared.push(id)
    this.watching = this.watching.filter((w) => w.id !== id)
  }
  fix(latitude: number, longitude: number) {
    this.watching.forEach((w) => w.ok({ coords: { latitude, longitude } }))
  }
  fail(code: number) {
    this.watching.forEach((w) => w.err({ code }))
  }
}


/** A real controller wired to a fake socket and fake geolocation — what a page test wraps its screen in (via `LiveLocationContext.Provider`). */
export function fakeLiveLocation(overrides: Partial<ControllerDeps> = {}): { controller: LiveLocationController; channel: FakeChannel; geo: FakeGeolocation } {
  const channel = new FakeChannel()
  const geo = new FakeGeolocation()
  const controller = createLiveLocationController({
    createSocket: (handlers) => {
      channel.handlers = handlers
      return channel.asSocket()
    },
    geolocation: () => geo as unknown as Geolocation,
    classify: async () => 'other',
    ...overrides,
  })
  return { controller, channel, geo }
}

import { describe, expect, it } from 'vitest'
import type { LiveLocationSnapshot } from './liveLocationController'
import { isShareOn, SHARE_STATUS_TEXT, shareStatus, type ShareStatus } from './shareStatus'

const base: Pick<LiveLocationSnapshot, 'sharing' | 'visible' | 'blocked' | 'channel' | 'fix'> = { sharing: true, visible: true, blocked: null, channel: 'live', fix: 'active' }

describe('shareStatus', () => {
  it.each<[string, Partial<typeof base>, ShareStatus]>([
    ['sharing off', { sharing: false, fix: 'idle', channel: 'idle' }, 'off'],
    ['the browser refused the position', { sharing: false, fix: 'denied' }, 'denied'],
    ['no geolocation in this browser', { sharing: false, fix: 'unsupported' }, 'unsupported'],
    ['on but the tab is in the background', { visible: false, channel: 'idle', fix: 'idle' }, 'paused'],
    ['the session is gone', { blocked: 'unauthorized', channel: 'blocked' }, 'blocked-unauthorized'],
    ['the alert gate said no', { blocked: 'not-allowed', channel: 'blocked' }, 'blocked-not-allowed'],
    ['the position cannot be found right now', { fix: 'unavailable' }, 'unavailable'],
    ['the socket is still connecting', { channel: 'connecting', fix: 'locating' }, 'connecting'],
    ['the socket is idle but sharing is on (about to open)', { channel: 'idle', fix: 'locating' }, 'connecting'],
    ['the connection dropped', { channel: 'reconnecting' }, 'reconnecting'],
    ['connected, waiting for the first fix', { fix: 'locating' }, 'locating'],
    ['connected with a fix', {}, 'sharing'],
  ])('%s', (_label, patch, expected) => {
    expect(shareStatus({ ...base, ...patch })).toBe(expected)
  })

  it('never says "sharing" unless the socket is live AND there is a fix', () => {
    for (const channel of ['idle', 'connecting', 'reconnecting', 'blocked'] as const) {
      expect(shareStatus({ ...base, channel })).not.toBe('sharing')
    }
    expect(shareStatus({ ...base, fix: 'locating' })).not.toBe('sharing')
  })

  it('says the tab is paused even when the channel would otherwise be blocked or down — the pause is what the person can act on', () => {
    expect(shareStatus({ ...base, visible: false, blocked: 'not-allowed', channel: 'blocked' })).toBe('paused')
  })

  it('has words for every status', () => {
    for (const status of Object.keys(SHARE_STATUS_TEXT)) expect(SHARE_STATUS_TEXT[status as ShareStatus].length).toBeGreaterThan(5)
  })

  it('shows the switch on for any share that is switched on, however stalled', () => {
    expect(isShareOn({ sharing: true })).toBe(true)
    expect(isShareOn({ sharing: false })).toBe(false)
  })
})

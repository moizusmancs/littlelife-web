import { describe, expect, it } from 'vitest'
import { ageLabel, formatCoordinates, HEARTBEAT_MS, isLive, LIVE_FOR_MS, parseRelay, pingFrame } from './liveLocationModel'

describe('parseRelay', () => {
  const frame = { account_id: 'acct-1', lat: 24.86, lng: 67.05, recorded_at: '2026-09-25T13:51:04.170368Z' }

  it('reads a frame as the relay sends it — newline and all', () => {
    expect(parseRelay(JSON.stringify(frame) + '\n')).toEqual({ accountId: 'acct-1', lat: 24.86, lng: 67.05, recordedAt: '2026-09-25T13:51:04.170368Z' })
  })

  it.each([
    ['not JSON', 'ping'],
    ['an array', '[1,2]'],
    ['no account', JSON.stringify({ ...frame, account_id: undefined })],
    ['a text latitude', JSON.stringify({ ...frame, lat: '24.86' })],
    ['a latitude off the globe', JSON.stringify({ ...frame, lat: 91 })],
    ['a longitude off the globe', JSON.stringify({ ...frame, lng: -181 })],
    ['no timestamp', JSON.stringify({ ...frame, recorded_at: undefined })],
  ])('rejects %s', (_label, raw) => {
    expect(parseRelay(raw)).toBeNull()
  })

  it('accepts the extremes of the globe', () => {
    expect(parseRelay(JSON.stringify({ ...frame, lat: -90, lng: 180 }))).not.toBeNull()
  })
})

describe('pingFrame', () => {
  it('is the bare {lat, lng} the relay expects — no envelope, no type', () => {
    expect(JSON.parse(pingFrame(24.86, 67.05))).toEqual({ lat: 24.86, lng: 67.05 })
  })
})

describe('isLive', () => {
  const at = (receivedAt: number) => ({ lat: 1, lng: 2, recordedAt: '', receivedAt })

  it('holds for three heartbeats after the last frame, by this browser\'s own clock, and not a moment longer', () => {
    expect(LIVE_FOR_MS).toBe(3 * HEARTBEAT_MS)
    expect(isLive(at(1000), 1000 + LIVE_FOR_MS)).toBe(true)
    expect(isLive(at(1000), 1000 + LIVE_FOR_MS + 1)).toBe(false)
  })
})

describe('ageLabel', () => {
  it.each([
    [0, 'just now'],
    [4000, 'just now'],
    [12_000, '12 s ago'],
    [59_000, '59 s ago'],
    [3 * 60_000, '3 min ago'],
    [2 * 3_600_000, '2 h ago'],
    [-5000, 'just now'],
  ])('%i ms → %s', (ms, label) => {
    expect(ageLabel(ms)).toBe(label)
  })
})

describe('formatCoordinates', () => {
  it('prints four places', () => {
    expect(formatCoordinates(24.86, 67.05)).toBe('24.8600, 67.0500')
    expect(formatCoordinates(-1.23456, 100)).toBe('-1.2346, 100.0000')
  })
})

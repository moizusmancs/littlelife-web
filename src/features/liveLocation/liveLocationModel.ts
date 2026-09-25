/**
 * Timing and framing for live location. A tracker sends `{lat, lng}` whenever the browser reports a new fix, and again every
 * `HEARTBEAT_MS` even if it hasn't moved — the relay has **no snapshot**: a viewer who connects later only hears the *next* ping, so a
 * still tracker would otherwise be invisible to them until they move. A viewer therefore treats a position as live for three heartbeats.
 */
export const HEARTBEAT_MS = 15_000
export const LIVE_FOR_MS = 3 * HEARTBEAT_MS
/** No more than one fix a couple of seconds apart goes out, however chatty the browser is (the backend only keeps one row per 30 s or 50 m anyway). */
export const MIN_SEND_MS = 2000

/** A member's last known position: the server's frame, plus when *this browser* received it (its own clock, so a skewed server clock can't make it stale). */
export interface LivePosition {
  lat: number
  lng: number
  /** The server's `recorded_at`. */
  recordedAt: string
  /** `Date.now()` at receipt. */
  receivedAt: number
}

export interface RelayFrame {
  accountId: string
  lat: number
  lng: number
  recordedAt: string
}

/** Reads a frame the relay sent (`{account_id, lat, lng, recorded_at}`, newline-terminated); `null` for anything malformed or out of range. */
export function parseRelay(raw: string): RelayFrame | null {
  try {
    const frame = JSON.parse(raw) as Record<string, unknown>
    const { account_id: accountId, lat, lng, recorded_at: recordedAt } = frame
    if (typeof accountId !== 'string' || typeof lat !== 'number' || typeof lng !== 'number' || typeof recordedAt !== 'string') return null
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return { accountId, lat, lng, recordedAt }
  } catch {
    return null
  }
}

/** What a tracker sends: the bare `{lat, lng}` the relay expects — no envelope, no type. */
export const pingFrame = (lat: number, lng: number) => JSON.stringify({ lat, lng })

export const isLive = (position: LivePosition, now: number) => now - position.receivedAt <= LIVE_FOR_MS

/** "just now", "12 s ago", "3 min ago", "2 h ago". */
export function ageLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}

/** "24.8600, 67.0500" — four places is about 11 m, plenty for a family member. */
export const formatCoordinates = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`

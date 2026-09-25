import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { LiveLocationController, LiveLocationSnapshot } from './liveLocationController'

/** What a screen sees when nothing has provided live location — tests, and any page rendered outside the citizen app: idle, and every action does nothing. */
const IDLE: LiveLocationSnapshot = { channel: 'idle', blocked: null, sharing: false, visible: true, fix: 'idle', positions: {} }
const INERT: LiveLocationController = {
  getSnapshot: () => IDLE,
  subscribe: () => () => undefined,
  startSharing: () => undefined,
  stopSharing: () => undefined,
  addWatcher: () => () => undefined,
  setVisible: () => undefined,
  retry: () => undefined,
  dispose: () => undefined,
}

export const LiveLocationContext = createContext<LiveLocationController>(INERT)

/** The live-location state and its actions. Re-renders on every change (a position arriving, the channel dropping). */
export function useLiveLocation() {
  const controller = useContext(LiveLocationContext)
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return { ...snapshot, startSharing: controller.startSharing, stopSharing: controller.stopSharing, retry: controller.retry }
}

/**
 * Says "this screen wants to see members' positions" for as long as it is mounted and `enabled` — which is what opens the socket for a
 * viewer. Leaving the screen (or `enabled` going false) lets it close again, unless the person is sharing.
 */
export function useWatchLiveLocation(enabled = true) {
  const controller = useContext(LiveLocationContext)
  useEffect(() => (enabled ? controller.addWatcher() : undefined), [controller, enabled])
}

/** The current time, refreshed every `intervalMs`, so "Live" turns to "last seen" on screen without anything else changing. */
export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

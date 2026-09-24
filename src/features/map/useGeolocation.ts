import { useCallback, useState } from 'react'
import type { LatLng } from './mapGeo'

export type LocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'unsupported'

export interface GeolocationState {
  status: LocationStatus
  position: LatLng | null
}

/**
 * The citizen's position, **only when they ask for it**. Nothing is requested on load — a location prompt on
 * opening a map is both unwelcome and unnecessary, since the map opens on their home region or the country. `locate`
 * asks; the result is a position, or a reason it isn't available (`denied` is the browser permission; `unavailable`
 * is a fix that timed out or failed; `unsupported` is no geolocation at all). `onFix` is called with each new position, which
 * is how a screen moves its map there without an effect.
 */
export function useGeolocation(onFix?: (position: LatLng) => void) {
  const [state, setState] = useState<GeolocationState>({ status: 'idle', position: null })

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((previous) => ({ ...previous, status: 'unsupported' }))
      return
    }
    setState((previous) => ({ ...previous, status: 'locating' }))
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const position: LatLng = [result.coords.latitude, result.coords.longitude]
        setState({ status: 'ready', position })
        onFix?.(position)
      },
      (error) => setState((previous) => ({ ...previous, status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' })),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }, [onFix])

  return { ...state, locate }
}

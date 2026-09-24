import { useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query currently matches, updating as it changes. `false` where `matchMedia` doesn't exist
 * (so a test environment reads as the small layout unless it says otherwise).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}
